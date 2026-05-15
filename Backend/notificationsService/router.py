"""Notifications endpoint router."""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from authService import ensure_auth_tables, require_auth_user
from database import execute_query
from database import execute_mutation
from utils import current_timestamp, format_datetime_minute

router = APIRouter(prefix="/notifications", tags=["notifications"])

STATUS_TYPE_MAP = {
    "Escalated": "warning",
    "Closed": "success",
    "Approved": "success",
}


class DismissNotificationRequest(BaseModel):
        notificationId: str


async def ensure_notification_tables() -> None:
        await ensure_auth_tables()
        await execute_mutation(
                """
                CREATE TABLE IF NOT EXISTS user_notification_dismissals (
                    userId INT NOT NULL,
                    notificationId VARCHAR(180) NOT NULL,
                    dismissedAt DATETIME NOT NULL,
                    PRIMARY KEY (userId, notificationId),
                    INDEX idx_user_notification_dismissals_userId (userId),
                    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                )
                """
        )
        await execute_mutation(
                """
                CREATE TABLE IF NOT EXISTS user_notification_state (
                    userId INT PRIMARY KEY,
                    lastClearedAt DATETIME NULL,
                    updatedAt DATETIME NOT NULL,
                    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
                )
                """
        )


def _normalize_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        return format_datetime_minute(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return current_timestamp()
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                return format_datetime_minute(datetime.strptime(text, fmt))
            except ValueError:
                continue
        return text
    return current_timestamp()


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
    return datetime.now()


def _build_notification(entity_type: str, record_id: str, message: str, status: str, updated_at: Any) -> Dict[str, Any]:
    return {
        "id": f"{entity_type}-{record_id}",
        "message": message,
        "type": STATUS_TYPE_MAP.get(status, "info"),
        "timestamp": _normalize_timestamp(updated_at),
        "entityType": entity_type,
        "entityId": record_id,
    }


@router.get("/recent")
async def get_recent_notifications(request: Request, hours: int = Query(24, ge=1, le=168)) -> List[Dict[str, Any]]:
    user = await require_auth_user(request)
    await ensure_notification_tables()

    cutoff = datetime.now() - timedelta(hours=hours)
    cutoff_str = current_timestamp(cutoff)

    notifications: List[Dict[str, Any]] = []

    project_rows = await execute_query(
        """
        SELECT recordId, projectName, stage, updatedAt
        FROM projects
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in project_rows:
        record_id = row.get("recordId", "")
        stage = row.get("stage") or "Updated"
        name = row.get("projectName") or "Unnamed"
        notifications.append(
            _build_notification("project", record_id, f"Project {record_id} ({name}): {stage}", stage, row.get("updatedAt"))
        )

    mantis_rows = await execute_query(
        """
        SELECT recordId, mantisStatus, updatedAt
        FROM mantis
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in mantis_rows:
        record_id = row.get("recordId", "")
        status = row.get("mantisStatus") or "Updated"
        notifications.append(
            _build_notification("mantis", record_id, f"Mantis {record_id}: {status}", status, row.get("updatedAt"))
        )

    knock_rows = await execute_query(
        """
        SELECT recordId, status, updatedAt
        FROM knocks
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in knock_rows:
        record_id = row.get("recordId", "")
        status = row.get("status") or "Updated"
        notifications.append(
            _build_notification("knock", record_id, f"Knock {record_id}: {status}", status, row.get("updatedAt"))
        )

    account_rows = await execute_query(
        """
        SELECT recordId, accountName, updatedAt
        FROM accounts
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in account_rows:
        record_id = row.get("recordId", "")
        account_name = row.get("accountName") or "Unknown"
        notifications.append(
            _build_notification("account", record_id, f"Account {record_id} ({account_name}) updated", "Updated", row.get("updatedAt"))
        )

    product_rows = await execute_query(
        """
        SELECT recordId, productName, updatedAt
        FROM products
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in product_rows:
        record_id = row.get("recordId", "")
        product_name = row.get("productName") or "Unknown"
        notifications.append(
            _build_notification("product", record_id, f"Product {record_id} ({product_name}) updated", "Updated", row.get("updatedAt"))
        )

    notifications.sort(key=lambda n: _to_datetime(n.get("timestamp")), reverse=True)
    notifications = notifications[:20]

    dismiss_rows = await execute_query(
        """
        SELECT notificationId
        FROM user_notification_dismissals
        WHERE userId = %s
        """,
        [user["id"]],
    )
    dismissed_ids = {row.get("notificationId") for row in dismiss_rows}

    state_row = await execute_query(
        """
        SELECT lastClearedAt
        FROM user_notification_state
        WHERE userId = %s
        LIMIT 1
        """,
        [user["id"]],
        fetch_one=True,
    )
    last_cleared_at = _to_datetime(state_row.get("lastClearedAt")) if state_row and state_row.get("lastClearedAt") else None

    filtered: List[Dict[str, Any]] = []
    for notification in notifications:
        notification_id = notification.get("id")
        notification_time = _to_datetime(notification.get("timestamp"))

        if notification_id in dismissed_ids:
            continue

        if last_cleared_at and notification_time <= last_cleared_at:
            continue

        filtered.append(notification)

    return filtered


@router.post("/dismiss")
async def dismiss_notification(request: Request, payload: DismissNotificationRequest) -> Dict[str, bool]:
    user = await require_auth_user(request)
    await ensure_notification_tables()

    await execute_mutation(
        """
        INSERT INTO user_notification_dismissals (userId, notificationId, dismissedAt)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE dismissedAt = VALUES(dismissedAt)
        """,
        [user["id"], payload.notificationId, current_timestamp()],
    )

    return {"success": True}


@router.post("/clear-all")
async def clear_all_notifications(request: Request) -> Dict[str, bool]:
    user = await require_auth_user(request)
    await ensure_notification_tables()

    now = current_timestamp()
    await execute_mutation(
        """
        INSERT INTO user_notification_state (userId, lastClearedAt, updatedAt)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE lastClearedAt = VALUES(lastClearedAt), updatedAt = VALUES(updatedAt)
        """,
        [user["id"], now, now],
    )

    return {"success": True}
