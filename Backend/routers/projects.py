"""Projects endpoint router."""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from schemas import ProjectRecord, HistoryEntryCreate
from utils import build_history_entry, normalize_record
import json

router = APIRouter(prefix="/projects", tags=["projects"])

SEARCH_FIELDS = ["recordId", "projectName", "accountId", "stage", "se", "ownedBy"]


@router.get("", response_model=List[ProjectRecord])
async def list_projects(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[ProjectRecord]:
    """List all projects."""
    
    where_parts = ["1=1"]
    params = []
    
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM projects WHERE {where_clause} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=ProjectRecord)
async def get_project(recordId: str) -> ProjectRecord:
    """Get project detail."""
    
    result = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return normalize_record(result)


@router.post("", response_model=ProjectRecord)
async def create_project(data: dict) -> ProjectRecord:
    """Create a new project."""
    
    record_id = generate_record_id("PRJ", "projects")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [build_history_entry("Created", "Project created")]
    
    sql = """
        INSERT INTO projects (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            projectName, accountId, startDate, closeDate, stage,
            sfdc, sfdcValue, se, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id, "MOD-PROJECT", "1.0", data.get("metaData"),
        data.get("ownedBy", "System"), now, "System", now, "System",
        data.get("projectName"), data.get("accountId"),
        data.get("startDate"), data.get("closeDate"), data.get("stage"),
        data.get("sfdc"), data.get("sfdcValue"), data.get("se"),
        json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=ProjectRecord)
async def update_project(recordId: str, data: dict) -> ProjectRecord:
    """Update a project."""
    
    existing = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry("Updated", "Project updated"))
    
    sql = """
        UPDATE projects SET
            projectName = %s, accountId = %s, startDate = %s, closeDate = %s,
            stage = %s, sfdc = %s, sfdcValue = %s, se = %s,
            metaData = %s, updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.get("projectName"), data.get("accountId"),
        data.get("startDate"), data.get("closeDate"), data.get("stage"),
        data.get("sfdc"), data.get("sfdcValue"), data.get("se"),
        data.get("metaData"), now, "System", json.dumps(history), recordId,
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_project(recordId: str):
    """Delete a project."""
    
    existing = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await execute_mutation("DELETE FROM projects WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=ProjectRecord)
async def add_project_history(recordId: str, entry: HistoryEntryCreate) -> ProjectRecord:
    """Add a history entry."""
    
    existing = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry(entry.action, entry.changes, entry.user))
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    await execute_mutation(
        "UPDATE projects SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    result = await execute_query(
        "SELECT * FROM projects WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
