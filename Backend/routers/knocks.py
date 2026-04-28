"""Knocks (Feature Requests) endpoint router."""

from fastapi import APIRouter, HTTPException, Query, Request
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from auth import require_auth_user
from schemas import KnockRecord, HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, normalize_record
import json

router = APIRouter(prefix="/knocks", tags=["knocks"])

SEARCH_FIELDS = ["recordId", "description", "knockId", "status", "ownedBy"]


@router.get("", response_model=List[KnockRecord])
async def list_knocks(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[KnockRecord]:
    """List all knocks."""
    
    where_parts = ["1=1"]
    params = []
    
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM knocks WHERE {where_clause} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=KnockRecord)
async def get_knock(recordId: str) -> KnockRecord:
    """Get knock detail."""
    
    result = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Knock not found")
    
    return normalize_record(result)


@router.post("", response_model=KnockRecord)
async def create_knock(data: dict) -> KnockRecord:
    """Create a new knock."""
    
    record_id = generate_record_id("KNOCK", "knocks")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [build_history_entry("Created", "Knock created")]
    
    sql = """
        INSERT INTO knocks (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            description, knockId, knockUrl, status,
            requestDate, targetDate, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id, "MOD-KNOCK", "1.0", data.get("metaData"),
        data.get("ownedBy", "System"), now, "System", now, "System",
        data.get("description"), data.get("knockId"), data.get("knockUrl"),
        data.get("status"), data.get("requestDate"), data.get("targetDate"),
        json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=KnockRecord)
async def update_knock(recordId: str, data: dict, request: Request) -> KnockRecord:
    """Update a knock."""
    actor = await require_auth_user(request)
    
    existing = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Knock not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.extend(
        build_update_history_entries(
            existing,
            {
                "description": data.get("description"),
                "knockId": data.get("knockId"),
                "knockUrl": data.get("knockUrl"),
                "status": data.get("status"),
                "requestDate": data.get("requestDate"),
                "targetDate": data.get("targetDate"),
                "metaData": data.get("metaData"),
            },
            actor["displayName"],
            field_labels={
                "description": "Description",
                "knockId": "Knock ID",
                "knockUrl": "Knock URL",
                "status": "Status",
                "requestDate": "Request Date",
                "targetDate": "Target Date",
                "metaData": "Metadata",
            },
        )
    )

    if not history:
        history.append(build_history_entry("Updated", "Knock updated", user=actor["displayName"]))
    
    sql = """
        UPDATE knocks SET
            description = %s, knockId = %s, knockUrl = %s, status = %s,
            requestDate = %s, targetDate = %s,
            metaData = %s, updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.get("description"), data.get("knockId"), data.get("knockUrl"),
        data.get("status"), data.get("requestDate"), data.get("targetDate"),
        data.get("metaData"), now, actor["displayName"], json.dumps(history), recordId,
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_knock(recordId: str):
    """Delete a knock."""
    
    existing = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Knock not found")
    
    await execute_mutation("DELETE FROM knocks WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=KnockRecord)
async def add_knock_history(recordId: str, entry: HistoryEntryCreate) -> KnockRecord:
    """Add a history entry."""
    
    existing = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Knock not found")
    
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry(entry.action, entry.changes, entry.user))
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    await execute_mutation(
        "UPDATE knocks SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    result = await execute_query(
        "SELECT * FROM knocks WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
