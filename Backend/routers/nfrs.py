"""NFRs (Non-Functional Requirements) endpoint router."""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from schemas import NfrRecord, HistoryEntryCreate
from utils import build_history_entry, normalize_record
import json

router = APIRouter(prefix="/nfrs", tags=["nfrs"])

SEARCH_FIELDS = ["recordId", "description", "mantisId", "nfrStatus", "ownedBy"]


@router.get("", response_model=List[NfrRecord])
async def list_nfrs(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[NfrRecord]:
    """List all NFRs."""
    
    where_parts = ["1=1"]
    params = []
    
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM nfrs WHERE {where_clause} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=NfrRecord)
async def get_nfr(recordId: str) -> NfrRecord:
    """Get NFR detail."""
    
    result = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="NFR not found")
    
    return normalize_record(result)


@router.post("", response_model=NfrRecord)
async def create_nfr(data: dict) -> NfrRecord:
    """Create a new NFR."""
    
    record_id = generate_record_id("NFR", "nfrs")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [build_history_entry("Created", "NFR created")]
    
    sql = """
        INSERT INTO nfrs (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            description, mantisId, mantisUrl, nfrStatus,
            nfrRequestDate, nfrTargetDate, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id, "MOD-NFR", "1.0", data.get("metaData"),
        data.get("ownedBy", "System"), now, "System", now, "System",
        data.get("description"), data.get("mantisId"), data.get("mantisUrl"),
        data.get("nfrStatus"), data.get("nfrRequestDate"), data.get("nfrTargetDate"),
        json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=NfrRecord)
async def update_nfr(recordId: str, data: dict) -> NfrRecord:
    """Update an NFR."""
    
    existing = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="NFR not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry("Updated", "NFR updated"))
    
    sql = """
        UPDATE nfrs SET
            description = %s, mantisId = %s, mantisUrl = %s, nfrStatus = %s,
            nfrRequestDate = %s, nfrTargetDate = %s,
            metaData = %s, updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.get("description"), data.get("mantisId"), data.get("mantisUrl"),
        data.get("nfrStatus"), data.get("nfrRequestDate"), data.get("nfrTargetDate"),
        data.get("metaData"), now, "System", json.dumps(history), recordId,
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_nfr(recordId: str):
    """Delete an NFR."""
    
    existing = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="NFR not found")
    
    await execute_mutation("DELETE FROM nfrs WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=NfrRecord)
async def add_nfr_history(recordId: str, entry: HistoryEntryCreate) -> NfrRecord:
    """Add a history entry."""
    
    existing = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="NFR not found")
    
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry(entry.action, entry.changes, entry.user))
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    await execute_mutation(
        "UPDATE nfrs SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    result = await execute_query(
        "SELECT * FROM nfrs WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
