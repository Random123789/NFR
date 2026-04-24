"""Utility functions for record management."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import json
from database import deserialize_history


def build_history_entry(
    action: str,
    changes: str,
    user: str = "System"
) -> Dict[str, str]:
    """Build a single history entry."""
    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "user": user,
        "action": action,
        "changes": changes,
    }


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
    
    # Ensure history is always a list for response model validation.
    if "history" not in record or record["history"] is None:
        record["history"] = []
    elif isinstance(record["history"], str):
        record["history"] = deserialize_history(record["history"])
    
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
