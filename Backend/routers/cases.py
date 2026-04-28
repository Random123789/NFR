"""Cases endpoint router."""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from database import execute_query, execute_mutation, generate_record_id
from auth import require_auth_user
from schemas import CaseRecord, CaseCreate, HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, normalize_record
import json

router = APIRouter(prefix="/cases", tags=["cases"])

SEARCH_FIELDS = [
    "recordId", "description", "status", "priority", "category",
    "caseOwner", "seOwner", "account", "product", "project",
    "mantisId", "knockId"
]

CASE_LINK_ENTITY_TYPES = {"account", "product", "project", "nfr", "knock"}


class CaseLinkRequest(BaseModel):
    entityType: str
    entityRecordId: str


async def ensure_case_link_tables() -> None:
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS case_entity_links (
          caseRecordId VARCHAR(32) NOT NULL,
          entityType VARCHAR(16) NOT NULL,
          entityRecordId VARCHAR(32) NOT NULL,
          createdAt DATETIME NOT NULL,
          createdBy VARCHAR(120) NULL,
          PRIMARY KEY (caseRecordId, entityType, entityRecordId),
          INDEX idx_case_entity_links_case (caseRecordId),
          INDEX idx_case_entity_links_entity (entityType, entityRecordId)
        )
        """
    )

    # Backfill legacy single-link fields into the multi-link table.
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT recordId, 'account', account, NOW(), updatedBy
        FROM cases
        WHERE account IS NOT NULL AND TRIM(account) <> ''
        """
    )
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT recordId, 'product', product, NOW(), updatedBy
        FROM cases
        WHERE product IS NOT NULL AND TRIM(product) <> ''
        """
    )
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT recordId, 'project', project, NOW(), updatedBy
        FROM cases
        WHERE project IS NOT NULL AND TRIM(project) <> ''
        """
    )
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT c.recordId, 'nfr', n.recordId, NOW(), c.updatedBy
        FROM cases c
        INNER JOIN nfrs n ON n.mantisId = c.mantisId
        WHERE c.mantisId IS NOT NULL AND TRIM(c.mantisId) <> ''
        """
    )
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT c.recordId, 'knock', k.recordId, NOW(), c.updatedBy
        FROM cases c
        INNER JOIN knocks k ON k.knockId = c.knockId
        WHERE c.knockId IS NOT NULL AND TRIM(c.knockId) <> ''
        """
    )


async def get_case_or_404(record_id: str) -> dict:
    case_row = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [record_id],
        fetch_one=True,
    )
    if not case_row:
        raise HTTPException(status_code=404, detail="Case not found")
    return case_row


async def sync_case_primary_links(record_id: str, actor_display_name: str) -> None:
    account_link = await execute_query(
        """
        SELECT entityRecordId FROM case_entity_links
        WHERE caseRecordId = %s AND entityType = 'account'
        ORDER BY createdAt DESC
        LIMIT 1
        """,
        [record_id],
        fetch_one=True,
    )
    product_link = await execute_query(
        """
        SELECT entityRecordId FROM case_entity_links
        WHERE caseRecordId = %s AND entityType = 'product'
        ORDER BY createdAt DESC
        LIMIT 1
        """,
        [record_id],
        fetch_one=True,
    )
    project_link = await execute_query(
        """
        SELECT entityRecordId FROM case_entity_links
        WHERE caseRecordId = %s AND entityType = 'project'
        ORDER BY createdAt DESC
        LIMIT 1
        """,
        [record_id],
        fetch_one=True,
    )
    nfr_link = await execute_query(
        """
        SELECT n.mantisId
        FROM case_entity_links cel
        INNER JOIN nfrs n ON n.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'nfr'
        ORDER BY cel.createdAt DESC
        LIMIT 1
        """,
        [record_id],
        fetch_one=True,
    )
    knock_link = await execute_query(
        """
        SELECT k.knockId
        FROM case_entity_links cel
        INNER JOIN knocks k ON k.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'knock'
        ORDER BY cel.createdAt DESC
        LIMIT 1
        """,
        [record_id],
        fetch_one=True,
    )

    await execute_mutation(
        """
        UPDATE cases
        SET account = %s,
            product = %s,
            project = %s,
            mantisId = %s,
            knockId = %s,
            updatedAt = %s,
            updatedBy = %s
        WHERE recordId = %s
        """,
        [
            account_link["entityRecordId"] if account_link else None,
            product_link["entityRecordId"] if product_link else None,
            project_link["entityRecordId"] if project_link else None,
            nfr_link["mantisId"] if nfr_link else None,
            knock_link["knockId"] if knock_link else None,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            actor_display_name,
            record_id,
        ],
    )


async def build_case_links_payload(record_id: str) -> dict:
    linked_accounts = await execute_query(
        """
        SELECT a.*
        FROM case_entity_links cel
        INNER JOIN accounts a ON a.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'account'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_products = await execute_query(
        """
        SELECT p.*
        FROM case_entity_links cel
        INNER JOIN products p ON p.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'product'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_projects = await execute_query(
        """
        SELECT p.*
        FROM case_entity_links cel
        INNER JOIN projects p ON p.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'project'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_nfrs = await execute_query(
        """
        SELECT n.*
        FROM case_entity_links cel
        INNER JOIN nfrs n ON n.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'nfr'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_knocks = await execute_query(
        """
        SELECT k.*
        FROM case_entity_links cel
        INNER JOIN knocks k ON k.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'knock'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )

    return {
        "accounts": [normalize_record(row) for row in linked_accounts],
        "products": [normalize_record(row) for row in linked_products],
        "projects": [normalize_record(row) for row in linked_projects],
        "nfrs": [normalize_record(row) for row in linked_nfrs],
        "knocks": [normalize_record(row) for row in linked_knocks],
    }


async def build_linked_cases_payload(entity_type: str, entity_record_id: str, actor: dict) -> list[dict]:
    cases_rows = await execute_query(
        """
        SELECT c.*
        FROM case_entity_links cel
        INNER JOIN cases c ON c.recordId = cel.caseRecordId
        WHERE cel.entityType = %s AND cel.entityRecordId = %s
        ORDER BY c.updatedAt DESC
        """,
        [entity_type, entity_record_id],
    )

    return [normalize_record(row) for row in cases_rows if _case_is_visible_to_actor(row, actor)]


def _case_is_visible_to_actor(case_record: dict, actor: dict) -> bool:
    if actor.get("role") == "admin":
        return True

    actor_name = (actor.get("displayName") or "").strip().lower()
    if not actor_name:
        return False

    visible_values = [
        case_record.get("seOwner"),
        case_record.get("caseOwner"),
        case_record.get("ownedBy"),
        case_record.get("createdBy"),
        case_record.get("updatedBy"),
    ]

    return any((value or "").strip().lower() == actor_name for value in visible_values)


@router.get("", response_model=List[CaseRecord])
async def list_cases(
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[CaseRecord]:
    """List all cases with optional search and pagination."""

    actor = await require_auth_user(request)
    
    where_parts = ["1=1"]
    params = []

    if actor.get("role") != "admin":
        where_parts.append("(`seOwner` = %s OR `caseOwner` = %s OR `ownedBy` = %s OR `createdBy` = %s OR `updatedBy` = %s)")
        params.extend([actor["displayName"]] * 5)
    
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


@router.get("/linked")
async def get_linked_cases(request: Request, entityType: str = Query(...), entityRecordId: str = Query(...)) -> list[dict]:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    entity_type = entityType.strip().lower()
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    entity_record_id = entityRecordId.strip()
    if not entity_record_id:
        raise HTTPException(status_code=400, detail="entityRecordId is required")

    return await build_linked_cases_payload(entity_type, entity_record_id, actor)


@router.get("/{recordId}", response_model=CaseRecord)
async def get_case(recordId: str, request: Request) -> CaseRecord:
    """Get case detail with all related information."""
    actor = await require_auth_user(request)
    sql = "SELECT * FROM cases WHERE recordId = %s"
    result = await execute_query(sql, [recordId], fetch_one=True)
    
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _case_is_visible_to_actor(result, actor):
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
async def update_case(recordId: str, data: CaseCreate, request: Request) -> CaseRecord:
    """Update a case."""
    actor = await require_auth_user(request)
    
    # Check if case exists
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _case_is_visible_to_actor(existing, actor):
        raise HTTPException(status_code=404, detail="Case not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    history = existing.get("history", [])
    if isinstance(history, str):
        history = json.loads(history) if history else []

    update_payload = {
        "description": data.description,
        "status": data.status,
        "priority": data.priority,
        "category": data.category,
        "caseOwner": data.caseOwner,
        "product": data.product,
        "account": data.account,
        "project": data.project,
        "knockId": data.knockId,
        "mantisId": data.mantisId,
        "metaData": data.metaData,
    }

    history.extend(
        build_update_history_entries(
            existing,
            update_payload,
            actor["displayName"],
            field_labels={
                "description": "Description",
                "status": "Status",
                "priority": "Priority",
                "category": "Category",
                "caseOwner": "Case Owner",
                "product": "Product",
                "account": "Account",
                "project": "Project",
                "knockId": "Knock ID",
                "mantisId": "Mantis ID",
                "metaData": "Metadata",
            },
        )
    )

    if not history:
        history.append(build_history_entry("Updated", "Case updated", user=actor["displayName"]))
    
    
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
        actor["displayName"],
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
async def delete_case(recordId: str, request: Request):
    """Delete a case."""
    actor = await require_auth_user(request)
    
    # Check if exists
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _case_is_visible_to_actor(existing, actor):
        raise HTTPException(status_code=404, detail="Case not found")
    
    await execute_mutation("DELETE FROM cases WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=CaseRecord)
async def add_case_history(recordId: str, request: Request, entry: HistoryEntryCreate) -> CaseRecord:
    """Add a history entry to a case."""
    actor = await require_auth_user(request)
    
    # Get existing record
    existing = await execute_query(
        "SELECT * FROM cases WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _case_is_visible_to_actor(existing, actor):
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


@router.get("/{recordId}/links")
async def get_case_links(recordId: str, request: Request) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    await sync_case_primary_links(recordId, actor["displayName"])
    return await build_case_links_payload(recordId)


@router.post("/{recordId}/links")
async def add_case_link(recordId: str, request: Request, payload: CaseLinkRequest) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    entity_type = payload.entityType.strip().lower()
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    entity_record_id = payload.entityRecordId.strip()
    if not entity_record_id:
        raise HTTPException(status_code=400, detail="entityRecordId is required")

    table_map = {
        "account": "accounts",
        "product": "products",
        "project": "projects",
        "nfr": "nfrs",
        "knock": "knocks",
    }
    target = await execute_query(
        f"SELECT recordId FROM {table_map[entity_type]} WHERE recordId = %s LIMIT 1",
        [entity_record_id],
        fetch_one=True,
    )
    if not target:
        raise HTTPException(status_code=404, detail="Linked entity not found")

    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        VALUES (%s, %s, %s, NOW(), %s)
        """,
        [recordId, entity_type, entity_record_id, actor["displayName"]],
    )

    await sync_case_primary_links(recordId, actor["displayName"])
    return await build_case_links_payload(recordId)


@router.delete("/{recordId}/links/{entityType}/{entityRecordId}")
async def remove_case_link(recordId: str, entityType: str, entityRecordId: str, request: Request) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    entity_type = entityType.strip().lower()
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    await execute_mutation(
        """
        DELETE FROM case_entity_links
        WHERE caseRecordId = %s AND entityType = %s AND entityRecordId = %s
        """,
        [recordId, entity_type, entityRecordId],
    )

    await sync_case_primary_links(recordId, actor["displayName"])
    return await build_case_links_payload(recordId)
