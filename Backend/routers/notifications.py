"""Notifications endpoint router."""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Query

from database import execute_query

router = APIRouter(prefix="/notifications", tags=["notifications"])

STATUS_TYPE_MAP = {
    "Escalated": "warning",
    "Closed": "success",
    "Approved": "success",
}


def _normalize_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return datetime.now().isoformat()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                return datetime.strptime(text, fmt).isoformat()
            except ValueError:
                continue
        return text
    return datetime.now().isoformat()


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f"):
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
async def get_recent_notifications(hours: int = Query(24, ge=1, le=168)) -> List[Dict[str, Any]]:
    cutoff = datetime.now() - timedelta(hours=hours)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

    notifications: List[Dict[str, Any]] = []

    case_rows = await execute_query(
        """
        SELECT recordId, status, updatedAt
        FROM cases
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in case_rows:
        record_id = row.get("recordId", "")
        status = row.get("status") or "Updated"
        notifications.append(
            _build_notification("case", record_id, f"Case {record_id}: {status}", status, row.get("updatedAt"))
        )

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

    nfr_rows = await execute_query(
        """
        SELECT recordId, nfrStatus, updatedAt
        FROM nfrs
        WHERE updatedAt >= %s
        ORDER BY updatedAt DESC
        LIMIT 10
        """,
        [cutoff_str],
    )
    for row in nfr_rows:
        record_id = row.get("recordId", "")
        status = row.get("nfrStatus") or "Updated"
        notifications.append(
            _build_notification("nfr", record_id, f"NFR {record_id}: {status}", status, row.get("updatedAt"))
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
    return notifications[:20]
