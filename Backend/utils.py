"""Utility functions for record management."""

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
import json
from database import deserialize_history

DATETIME_MINUTE_FORMAT = "%Y-%m-%d %H:%M"


def current_timestamp(value: Any = None) -> str:
    """Return the current local timestamp at minute precision."""
    dt = value if isinstance(value, datetime) else datetime.now()
    return dt.replace(second=0, microsecond=0).strftime(DATETIME_MINUTE_FORMAT)


def format_datetime_minute(value: Any) -> str:
    """Format datetime-like values without seconds."""
    if isinstance(value, datetime):
        return value.replace(second=0, microsecond=0).strftime(DATETIME_MINUTE_FORMAT)

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return current_timestamp()

        normalized = text.replace("T", " ")
        for fmt in (
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
        ):
            try:
                parsed = datetime.strptime(normalized, fmt)
                return parsed.replace(second=0, microsecond=0).strftime(DATETIME_MINUTE_FORMAT)
            except ValueError:
                continue

        return text

    return current_timestamp()


def trim_timestamp_seconds(value: Any) -> Any:
    """Trim seconds from datetime values while leaving non-timestamps alone."""
    if isinstance(value, datetime):
        return format_datetime_minute(value)

    if isinstance(value, str):
        text = value.strip()
        normalized = text.replace("T", " ")

        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(normalized, fmt).strftime(DATETIME_MINUTE_FORMAT)
            except ValueError:
                continue

        return text

    return value


def normalize_temporal_values(record: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize datetime values in a response record without mutating the caller's object."""
    return {key: trim_timestamp_seconds(value) for key, value in record.items()}


def build_history_entry(
    action: str,
    changes: str,
    user: str = "System",
    field: Optional[str] = None,
    previous_value: Any = None,
    new_value: Any = None,
) -> Dict[str, Any]:
    """Build a single history entry."""
    entry: Dict[str, Any] = {
        "timestamp": current_timestamp(),
        "user": user,
        "action": action,
        "changes": changes,
    }

    if field is not None:
        entry["field"] = field

    if previous_value is not None:
        entry["previousValue"] = previous_value

    if new_value is not None:
        entry["newValue"] = new_value

    return entry


def _format_history_value(value: Any) -> str:
    if value is None:
        return "-"

    if isinstance(value, str):
        return value if value.strip() else "-"

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    return str(value)


def build_update_history_entries(
    before: Dict[str, Any],
    after: Dict[str, Any],
    user: str,
    field_labels: Optional[Dict[str, str]] = None,
    ignored_fields: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Build one history entry per field that changed."""
    labels = field_labels or {}
    ignored = set(ignored_fields or [])
    entries: List[Dict[str, Any]] = []

    for field, new_value in after.items():
        if field in ignored:
            continue

        previous_value = before.get(field)
        if previous_value == new_value:
            continue

        label = labels.get(field, field)
        previous_text = _format_history_value(previous_value)
        new_text = _format_history_value(new_value)

        entries.append(
            build_history_entry(
                action="Updated",
                changes=f"{label} changed from {previous_text} to {new_text}",
                user=user,
                field=label,
                previous_value=previous_text,
                new_value=new_text,
            )
        )

    return entries


def normalize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a record by deserializing history JSON.
    
    Args:
        record: Raw database record with history as JSON string or list
    
    Returns:
        Normalized record with history as list of dicts
    """
    if not record:
        return record

    for key, value in list(record.items()):
        if isinstance(value, datetime):
            record[key] = format_datetime_minute(value)
    
    # Ensure history is always a list for response model validation.
    if "history" not in record or record["history"] is None:
        record["history"] = []
    elif isinstance(record["history"], str):
        record["history"] = deserialize_history(record["history"])

    if isinstance(record.get("history"), list):
        for entry in record["history"]:
            if isinstance(entry, dict) and "timestamp" in entry:
                entry["timestamp"] = trim_timestamp_seconds(entry["timestamp"])
    
    return record


def serialize_record_for_db(
    record: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Serialize a record for database storage by converting history to JSON.
    
    Args:
        record: Record dict with history as list
    
    Returns:
        Record with history serialized as JSON string
    """
    if "history" in record and isinstance(record["history"], list):
        record["history"] = json.dumps(record["history"])
    
    return record


def parse_query_params(
    q: Optional[str] = None,
    sort: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    **filters: Any
) -> tuple[str, List[Any], Optional[str], int, int]:
    """
    Parse common query parameters into SQL WHERE/ORDER BY clauses.
    
    Args:
        q: Search term
        sort: Field to sort by (prefix with - for DESC)
        limit: Results per page
        offset: Results to skip
        **filters: Additional field=value filters
    
    Returns:
        Tuple of (where_clause, params, order_by_clause, limit, offset)
    """
    where_parts = []
    params = []
    order_by = None
    
    # Search across common fields (will be customized per route)
    if q:
        where_parts.append("1=0")  # Default: no global search, override per endpoint
    
    # Filters
    for field, value in filters.items():
        if value is not None:
            where_parts.append(f"`{field}` = %s")
            params.append(value)
    
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"
    
    # Sorting
    if sort:
        if sort.startswith("-"):
            order_by = f"`{sort[1:]}` DESC"
        else:
            order_by = f"`{sort}` ASC"
    
    # Pagination
    limit = min(limit, 1000)  # Max 1000
    offset = max(offset, 0)
    
    return where_clause, params, order_by, limit, offset
