"""Accounts endpoint router."""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from schemas import AccountRecord, AccountCreate, HistoryEntryCreate
from utils import build_history_entry, normalize_record, serialize_record_for_db
import json

router = APIRouter(prefix="/accounts", tags=["accounts"])

SEARCH_FIELDS = ["recordId", "accountName", "type", "vertical", "ownedBy"]


@router.get("", response_model=List[AccountRecord])
async def list_accounts(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[AccountRecord]:
    """List all accounts with optional search and pagination."""
    
    where_parts = ["1=1"]
    params = []
    
    # Search across defined fields
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    where_clause = " AND ".join(where_parts)
    
    sql = f"""
        SELECT * FROM accounts 
        WHERE {where_clause}
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=AccountRecord)
async def get_account(recordId: str) -> AccountRecord:
    """Get account detail with related cases and projects."""
    
    sql = "SELECT * FROM accounts WHERE recordId = %s"
    result = await execute_query(sql, [recordId], fetch_one=True)
    
    if not result:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return normalize_record(result)


@router.post("", response_model=AccountRecord)
async def create_account(data: AccountCreate) -> AccountRecord:
    """Create a new account."""
    
    record_id = generate_record_id("ACC", "accounts")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [
        build_history_entry(
            action="Created",
            changes="Account created",
            user="System"
        )
    ]
    
    sql = """
        INSERT INTO accounts (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            accountName, website, type, vertical, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id,
        "MOD-ACCOUNT",
        "1.0",
        data.metaData,
        "System",
        now,
        "System",
        now,
        "System",
        data.accountName,
        data.website,
        data.type,
        data.vertical,
        json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    # Fetch and return created record
    result = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=AccountRecord)
async def update_account(recordId: str, data: AccountCreate) -> AccountRecord:
    """Update an account."""
    
    # Check if account exists
    existing = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Add history entry
    history = existing.get("history", [])
    if isinstance(history, str):
        history = json.loads(history) if history else []
    
    history.append(build_history_entry(
        action="Updated",
        changes="Account updated",
        user="System"
    ))
    
    sql = """
        UPDATE accounts SET
            accountName = %s, website = %s, type = %s, vertical = %s,
            metaData = %s, updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.accountName,
        data.website,
        data.type,
        data.vertical,
        data.metaData,
        now,
        "System",
        json.dumps(history),
        recordId,
    ]
    
    await execute_mutation(sql, params)
    
    # Fetch and return updated record
    result = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_account(recordId: str):
    """Delete an account."""
    
    # Check if exists
    existing = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await execute_mutation("DELETE FROM accounts WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=AccountRecord)
async def add_account_history(recordId: str, entry: HistoryEntryCreate) -> AccountRecord:
    """Add a history entry to an account."""
    
    # Get existing record
    existing = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
    
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
        "UPDATE accounts SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    # Return updated record
    result = await execute_query(
        "SELECT * FROM accounts WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
