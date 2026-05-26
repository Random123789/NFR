"""Notifications endpoint router."""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from authService import ensure_auth_tables, require_auth_user
from database import execute_mutation, execute_query
from utils import current_timestamp, format_datetime_minute

router = APIRouter(prefix="/notifications", tags=["notifications"])

STATUS_TYPE_MAP = {
    "Escalated": "warning",
    "Monitoring": "warning",
    "Closed": "success",
    "Closed-Resolved": "success",
    "Closed-Dead": "success",
    "Approved": "success",
    "Completed": "success",
    "Dead": "error",
}

MAX_NOTIFICATIONS = 20
PER_SOURCE_LIMIT = 50


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
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
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
        text = value.strip().replace("T", " ")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
    return datetime.now()


def _safe_event_key(value: str) -> str:
    return "".join(char if char.isalnum() else "-" for char in value).strip("-")[:80] or "updated"


def _qualified(alias: str, field: str) -> str:
    return f"{alias}.`{field}`" if alias else f"`{field}`"


def _is_manager_or_admin(actor: dict) -> bool:
    return actor.get("role") in {"admin", "manager"}


def _case_visibility_clause(actor: dict, case_alias: str = "c") -> tuple[str, List[Any]]:
    if _is_manager_or_admin(actor):
        return "1=1", []

    actor_name = (actor.get("displayName") or "").strip().lower()
    actor_id = actor.get("id")
    actor_vertical = (actor.get("vertical") or "").strip()
    record_id_ref = _qualified(case_alias, "recordId")
    conditions: List[str] = []
    params: List[Any] = []

    if actor_name:
        conditions.append(
            f"(LOWER(TRIM({_qualified(case_alias, 'seOwner')})) = %s OR LOWER(TRIM({_qualified(case_alias, 'assignedTo')})) = %s)"
        )
        params.extend([actor_name, actor_name])

    watcher_conditions: List[str] = []
    watcher_params: List[Any] = []
    if actor_id:
        watcher_conditions.append("visible_watcher.userId = %s")
        watcher_params.append(actor_id)
    if actor_name:
        watcher_conditions.append("LOWER(TRIM(visible_watcher.displayName)) = %s")
        watcher_params.append(actor_name)

    if watcher_conditions:
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM case_watchers visible_watcher
                WHERE visible_watcher.caseRecordId = {record_id_ref}
                  AND ({' OR '.join(watcher_conditions)})
            )
            """
        )
        params.extend(watcher_params)

    if actor_vertical:
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM case_entity_links visible_link
                INNER JOIN accounts linked_account ON linked_account.recordId = visible_link.entityRecordId
                WHERE visible_link.caseRecordId = {record_id_ref}
                  AND visible_link.entityType = 'account'
                  AND linked_account.vertical = %s
            )
            """
        )
        params.append(actor_vertical)

    if not conditions:
        return "1=0", []

    return f"({' OR '.join(conditions)})", params


def _account_visibility_clause(actor: dict, account_alias: str = "a") -> tuple[str, List[Any]]:
    if _is_manager_or_admin(actor):
        return "1=1", []

    actor_vertical = (actor.get("vertical") or "").strip()
    if not actor_vertical:
        return "1=0", []

    return f"{_qualified(account_alias, 'vertical')} = %s", [actor_vertical]


def _project_visibility_clause(actor: dict, project_alias: str = "p") -> tuple[str, List[Any]]:
    if _is_manager_or_admin(actor):
        return "1=1", []

    actor_name = (actor.get("displayName") or "").strip().lower()
    actor_vertical = (actor.get("vertical") or "").strip()
    conditions: List[str] = []
    params: List[Any] = []

    if actor_name:
        conditions.append(f"LOWER(TRIM({_qualified(project_alias, 'seOwner')})) = %s")
        params.append(actor_name)

    if actor_vertical:
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM accounts visible_account
                WHERE visible_account.recordId = {_qualified(project_alias, 'accountId')}
                  AND visible_account.vertical = %s
            )
            """
        )
        params.append(actor_vertical)

    case_clause, case_params = _case_visibility_clause(actor, "visible_case")
    if case_clause != "1=0":
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM cases visible_case
                WHERE visible_case.project = {_qualified(project_alias, 'recordId')}
                  AND {case_clause}
            )
            """
        )
        params.extend(case_params)

    if not conditions:
        return "1=0", []

    return f"({' OR '.join(conditions)})", params


def _linked_case_visibility_clause(actor: dict, entity_type: str, entity_alias: str) -> tuple[str, List[Any]]:
    if _is_manager_or_admin(actor):
        return "1=1", []

    case_clause, case_params = _case_visibility_clause(actor, "visible_case")
    if case_clause == "1=0":
        return "1=0", []

    return (
        f"""
        EXISTS (
            SELECT 1
            FROM case_entity_links visible_entity_link
            INNER JOIN cases visible_case ON visible_case.recordId = visible_entity_link.caseRecordId
            WHERE visible_entity_link.entityType = %s
              AND visible_entity_link.entityRecordId = {_qualified(entity_alias, 'recordId')}
              AND {case_clause}
        )
        """,
        [entity_type, *case_params],
    )


def _build_notification(entity_type: str, record_id: str, message: str, status: str, updated_at: Any) -> Dict[str, Any]:
    timestamp = _normalize_timestamp(updated_at)
    return {
        "id": f"{entity_type}-{record_id}-{_safe_event_key(timestamp)}",
        "message": message,
        "type": STATUS_TYPE_MAP.get(status, "info"),
        "timestamp": timestamp,
        "entityType": entity_type,
        "entityId": record_id,
    }


def _summarize(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return text if len(text) <= 72 else f"{text[:69]}..."


async def _fetch_case_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _case_visibility_clause(actor, "c")
    rows = await execute_query(
        f"""
        SELECT c.recordId, c.description, c.status, c.priority, c.updatedAt
        FROM cases c
        WHERE c.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY c.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        status = row.get("status") or "Updated"
        title = _summarize(row.get("description"), "Case updated")
        notifications.append(_build_notification("case", record_id, f"Case {record_id}: {title} ({status})", status, row.get("updatedAt")))
    return notifications


async def _fetch_project_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _project_visibility_clause(actor, "p")
    rows = await execute_query(
        f"""
        SELECT p.recordId, p.projectName, p.stage, p.updatedAt
        FROM projects p
        WHERE p.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY p.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        stage = row.get("stage") or "Updated"
        name = _summarize(row.get("projectName"), "Unnamed")
        notifications.append(_build_notification("project", record_id, f"Project {record_id} ({name}): {stage}", stage, row.get("updatedAt")))
    return notifications


async def _fetch_account_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _account_visibility_clause(actor, "a")
    rows = await execute_query(
        f"""
        SELECT a.recordId, a.accountName, a.updatedAt
        FROM accounts a
        WHERE a.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY a.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        account_name = _summarize(row.get("accountName"), "Unknown")
        notifications.append(_build_notification("account", record_id, f"Account {record_id} ({account_name}) updated", "Updated", row.get("updatedAt")))
    return notifications


async def _fetch_product_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _linked_case_visibility_clause(actor, "product", "p")
    rows = await execute_query(
        f"""
        SELECT p.recordId, p.productName, p.updatedAt
        FROM products p
        WHERE p.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY p.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        product_name = _summarize(row.get("productName"), "Unknown")
        notifications.append(_build_notification("product", record_id, f"Product {record_id} ({product_name}) updated", "Updated", row.get("updatedAt")))
    return notifications


async def _fetch_mantis_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _linked_case_visibility_clause(actor, "mantis", "m")
    rows = await execute_query(
        f"""
        SELECT m.recordId, m.mantisStatus, m.updatedAt
        FROM mantis m
        WHERE m.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY m.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        status = row.get("mantisStatus") or "Updated"
        notifications.append(_build_notification("mantis", record_id, f"Mantis {record_id}: {status}", status, row.get("updatedAt")))
    return notifications


async def _fetch_knock_notifications(actor: dict, cutoff_str: str) -> List[Dict[str, Any]]:
    visibility_clause, visibility_params = _linked_case_visibility_clause(actor, "knock", "k")
    rows = await execute_query(
        f"""
        SELECT k.recordId, k.status, k.updatedAt
        FROM knocks k
        WHERE k.updatedAt >= %s
          AND {visibility_clause}
        ORDER BY k.updatedAt DESC
        LIMIT %s
        """,
        [cutoff_str, *visibility_params, PER_SOURCE_LIMIT],
    )

    notifications: List[Dict[str, Any]] = []
    for row in rows:
        record_id = row.get("recordId", "")
        status = row.get("status") or "Updated"
        notifications.append(_build_notification("knock", record_id, f"Knock {record_id}: {status}", status, row.get("updatedAt")))
    return notifications


async def _dismissed_notification_ids(user_id: int) -> set[str]:
    rows = await execute_query(
        """
        SELECT notificationId
        FROM user_notification_dismissals
        WHERE userId = %s
        """,
        [user_id],
    )
    return {row.get("notificationId") for row in rows if row.get("notificationId")}


async def _last_cleared_at(user_id: int) -> datetime | None:
    row = await execute_query(
        """
        SELECT lastClearedAt
        FROM user_notification_state
        WHERE userId = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )
    if not row or not row.get("lastClearedAt"):
        return None
    return _to_datetime(row.get("lastClearedAt"))


@router.get("/recent")
async def get_recent_notifications(request: Request, hours: int = Query(24, ge=1, le=168)) -> List[Dict[str, Any]]:
    user = await require_auth_user(request)

    cutoff = datetime.now() - timedelta(hours=hours)
    cutoff_str = current_timestamp(cutoff)

    notifications: List[Dict[str, Any]] = []
    notifications.extend(await _fetch_case_notifications(user, cutoff_str))
    notifications.extend(await _fetch_project_notifications(user, cutoff_str))
    notifications.extend(await _fetch_account_notifications(user, cutoff_str))
    notifications.extend(await _fetch_product_notifications(user, cutoff_str))
    notifications.extend(await _fetch_mantis_notifications(user, cutoff_str))
    notifications.extend(await _fetch_knock_notifications(user, cutoff_str))

    dismissed_ids = await _dismissed_notification_ids(user["id"])
    last_cleared_at = await _last_cleared_at(user["id"])

    filtered: List[Dict[str, Any]] = []
    for notification in notifications:
        notification_id = notification.get("id")
        notification_time = _to_datetime(notification.get("timestamp"))

        if notification_id in dismissed_ids:
            continue

        if last_cleared_at and notification_time <= last_cleared_at:
            continue

        filtered.append(notification)

    filtered.sort(key=lambda n: _to_datetime(n.get("timestamp")), reverse=True)
    return filtered[:MAX_NOTIFICATIONS]


@router.post("/dismiss")
async def dismiss_notification(request: Request, payload: DismissNotificationRequest) -> Dict[str, bool]:
    user = await require_auth_user(request)

    notification_id = payload.notificationId.strip()
    if not notification_id:
        return {"success": True}

    await execute_mutation(
        """
        INSERT INTO user_notification_dismissals (userId, notificationId, dismissedAt)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE dismissedAt = VALUES(dismissedAt)
        """,
        [user["id"], notification_id, current_timestamp()],
    )

    return {"success": True}


@router.post("/clear-all")
async def clear_all_notifications(request: Request) -> Dict[str, bool]:
    user = await require_auth_user(request)

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
