"""Cases endpoint router."""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from schemas import CaseRecord, CaseCreate, HistoryEntryCreate
from utils import build_history_entry, normalize_record
import json

router = APIRouter(prefix="/cases", tags=["cases"])

SEARCH_FIELDS = [
    "recordId", "description", "status", "priority", "category",
    "caseOwner", "seOwner", "account", "product", "project",
    "mantisId", "knockId"
]


@router.get("", response_model=List[CaseRecord])
async def list_cases(
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[CaseRecord]:
    """List all cases with optional search and pagination."""
    
    where_parts = ["1=1"]
    params = []
    
    # Search across defined fields
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    # Additional filters
    for field, value in request.query_params.items():
        if value is not None and field not in ["limit", "offset"]:
            where_parts.append(f"`{field}` = %s")
            params.append(value)
    
    where_clause = " AND ".join(where_parts)
    
    sql = f"""
        SELECT * FROM cases 
        WHERE {where_clause}
        ORDER BY createdAt DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=CaseRecord)
async def get_case(recordId: str) -> CaseRecord:
    """Get case detail with all related information."""
    
    sql = "SELECT * FROM cases WHERE recordId = %s"
    result = await execute_query(sql, [recordId], fetch_one=True)
    
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return normalize_record(result)


@router.post("", response_model=CaseRecord)
async def create_case(data: CaseCreate) -> CaseRecord:
    """Create a new case."""
    
    record_id = generate_record_id("REC", "cases")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [
        build_history_entry(
            action="Created",
            changes="Case created",
            user="System"
        )
    ]
    
    sql = """
        INSERT INTO cases (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            description, previousStatus, closeDate, status, priority,
            category, caseOwner, product, account, project,
            knockId, mantisId, escalationNote, escalationType, seOwner, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id,
        "MOD-CASE",
        "1.0",
        data.metaData,
        "System",
        now,
        "System",
        now,
        "System",
        data.description,
        None,
        None,
        data.status,
        data.priority,
        data.category,
        data.caseOwner,
        data.product,
        data.account,
        data.project,
        data.knockId,
        data.mantisId,
        None,
        None,
        None,
        json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    # Fetch and return created record
    result = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=CaseRecord)
async def update_case(recordId: str, data: CaseCreate) -> CaseRecord:
    """Update a case."""
    
    # Check if case exists
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Add history entry
    history = existing.get("history", [])
    if isinstance(history, str):
        history = json.loads(history) if history else []
    
    history.append(build_history_entry(
        action="Updated",
        changes="Case updated",
        user="System"
    ))
    
    sql = """
        UPDATE cases SET
            description = %s, status = %s, priority = %s, category = %s,
            caseOwner = %s, product = %s, account = %s, project = %s,
            knockId = %s, mantisId = %s, metaData = %s,
            updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.description,
        data.status,
        data.priority,
        data.category,
        data.caseOwner,
        data.product,
        data.account,
        data.project,
        data.knockId,
        data.mantisId,
        data.metaData,
        now,
        "System",
        json.dumps(history),
        recordId,
    ]
    
    await execute_mutation(sql, params)
    
    # Fetch and return updated record
    result = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_case(recordId: str):
    """Delete a case."""
    
    # Check if exists
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    
    await execute_mutation("DELETE FROM cases WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=CaseRecord)
async def add_case_history(recordId: str, entry: HistoryEntryCreate) -> CaseRecord:
    """Add a history entry to a case."""
    
    # Get existing record
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Parse and add to history
    history = existing.get("history", [])
    if isinstance(history, str):
        history = json.loads(history) if history else []
    
    history.append(build_history_entry(
        action=entry.action,
        changes=entry.changes,
        user=entry.user
    ))
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    await execute_mutation(
        "UPDATE cases SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    # Return updated record
    result = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
