"""Cases endpoint router."""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from database import execute_query, execute_mutation, generate_record_id
from authService import require_auth_user
from schemas import CaseRecord, CaseCreate, HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, normalize_record
import json
import logging

router = APIRouter(prefix="/cases", tags=["cases"])
logger = logging.getLogger(__name__)

SEARCH_FIELDS = [
    "recordId", "description", "status", "priority", "category",
    "caseOwner", "seOwner", "account", "product", "project",
    "nfrRecordId", "knockRecordId", "mantisId", "knockId"
]

CASE_LINK_ENTITY_TYPES = {"account", "product", "project", "nfr", "knock"}


class CaseLinkRequest(BaseModel):
    entityType: str
    entityRecordId: str


async def _column_exists(table_name: str, column_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        """,
        [table_name, column_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _index_exists(table_name: str, index_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND INDEX_NAME = %s
        """,
        [table_name, index_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _add_column_if_missing(table_name: str, column_name: str, alter_sql: str) -> None:
    if await _column_exists(table_name, column_name):
        return

    await execute_mutation(alter_sql)


async def _add_index_if_missing(table_name: str, index_name: str, create_sql: str) -> None:
    if await _index_exists(table_name, index_name):
        return

    try:
        await execute_mutation(create_sql)
    except Exception as exc:
        logger.warning("Could not add index %s on %s: %s", index_name, table_name, exc)


def _blank_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _case_payload(data: CaseCreate) -> dict:
    return {
        "description": data.description,
        "previousStatus": _blank_to_none(data.previousStatus),
        "closeDate": _blank_to_none(data.closeDate),
        "status": _blank_to_none(data.status),
        "priority": _blank_to_none(data.priority),
        "category": _blank_to_none(data.category),
        "caseOwner": _blank_to_none(data.caseOwner),
        "product": _blank_to_none(data.product),
        "account": _blank_to_none(data.account),
        "project": _blank_to_none(data.project),
        "nfrRecordId": _blank_to_none(data.nfrRecordId),
        "knockRecordId": _blank_to_none(data.knockRecordId),
        "knockId": _blank_to_none(data.knockId),
        "mantisId": _blank_to_none(data.mantisId),
        "escalationNote": _blank_to_none(data.escalationNote),
        "escalationType": _blank_to_none(data.escalationType),
        "seOwner": _blank_to_none(data.seOwner),
        "metaData": _blank_to_none(data.metaData),
    }


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
    await ensure_case_foreign_keys()

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
        SELECT recordId, 'nfr', nfrRecordId, NOW(), updatedBy
        FROM cases
        WHERE nfrRecordId IS NOT NULL AND TRIM(nfrRecordId) <> ''
        """
    )
    await execute_mutation(
        """
        INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        SELECT recordId, 'knock', knockRecordId, NOW(), updatedBy
        FROM cases
        WHERE knockRecordId IS NOT NULL AND TRIM(knockRecordId) <> ''
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


async def _foreign_key_exists(constraint_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = %s
        """,
        [constraint_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _add_foreign_key_if_missing(constraint_name: str, alter_sql: str) -> None:
    if await _foreign_key_exists(constraint_name):
        return

    try:
        await execute_mutation(alter_sql)
    except Exception as exc:
        logger.warning("Could not add foreign key %s: %s", constraint_name, exc)


async def _normalize_foreign_key_values() -> None:
    for table_name, column_name in (
        ("cases", "account"),
        ("cases", "product"),
        ("cases", "project"),
        ("cases", "nfrRecordId"),
        ("cases", "knockRecordId"),
        ("cases", "mantisId"),
        ("cases", "knockId"),
        ("projects", "accountId"),
        ("nfrs", "mantisId"),
        ("knocks", "knockId"),
    ):
        await execute_mutation(
            f"UPDATE {table_name} SET {column_name} = NULL WHERE {column_name} IS NOT NULL AND TRIM({column_name}) = ''"
        )

    await execute_mutation(
        """
        UPDATE cases c
        INNER JOIN (
            SELECT mantisId, MIN(recordId) AS recordId
            FROM nfrs
            WHERE mantisId IS NOT NULL AND TRIM(mantisId) <> ''
            GROUP BY mantisId
        ) n ON n.mantisId = c.mantisId
        SET c.nfrRecordId = n.recordId
        WHERE c.nfrRecordId IS NULL
          AND c.mantisId IS NOT NULL
          AND TRIM(c.mantisId) <> ''
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        INNER JOIN (
            SELECT knockId, MIN(recordId) AS recordId
            FROM knocks
            WHERE knockId IS NOT NULL AND TRIM(knockId) <> ''
            GROUP BY knockId
        ) k ON k.knockId = c.knockId
        SET c.knockRecordId = k.recordId
        WHERE c.knockRecordId IS NULL
          AND c.knockId IS NOT NULL
          AND TRIM(c.knockId) <> ''
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        INNER JOIN nfrs n ON n.recordId = c.nfrRecordId
        SET c.mantisId = n.mantisId
        WHERE (c.mantisId IS NULL OR TRIM(c.mantisId) = '')
          AND n.mantisId IS NOT NULL
          AND TRIM(n.mantisId) <> ''
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        INNER JOIN knocks k ON k.recordId = c.knockRecordId
        SET c.knockId = k.knockId
        WHERE (c.knockId IS NULL OR TRIM(c.knockId) = '')
          AND k.knockId IS NOT NULL
          AND TRIM(k.knockId) <> ''
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN accounts a ON c.account = a.recordId
        SET c.account = NULL
        WHERE c.account IS NOT NULL AND a.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN products p ON c.product = p.recordId
        SET c.product = NULL
        WHERE c.product IS NOT NULL AND p.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN projects p ON c.project = p.recordId
        SET c.project = NULL
        WHERE c.project IS NOT NULL AND p.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN nfrs n ON c.nfrRecordId = n.recordId
        SET c.nfrRecordId = NULL
        WHERE c.nfrRecordId IS NOT NULL AND n.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN knocks k ON c.knockRecordId = k.recordId
        SET c.knockRecordId = NULL
        WHERE c.knockRecordId IS NOT NULL AND k.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE projects p
        LEFT JOIN accounts a ON p.accountId = a.recordId
        SET p.accountId = NULL
        WHERE p.accountId IS NOT NULL AND a.recordId IS NULL
        """
    )


async def ensure_case_foreign_keys() -> None:
    await _add_column_if_missing(
        "cases",
        "nfrRecordId",
        "ALTER TABLE cases ADD COLUMN nfrRecordId VARCHAR(32) NULL AFTER project",
    )
    await _add_column_if_missing(
        "cases",
        "knockRecordId",
        "ALTER TABLE cases ADD COLUMN knockRecordId VARCHAR(32) NULL AFTER nfrRecordId",
    )
    await _add_index_if_missing(
        "cases",
        "idx_cases_nfrRecordId",
        "CREATE INDEX idx_cases_nfrRecordId ON cases (nfrRecordId)",
    )
    await _add_index_if_missing(
        "cases",
        "idx_cases_knockRecordId",
        "CREATE INDEX idx_cases_knockRecordId ON cases (knockRecordId)",
    )

    await _normalize_foreign_key_values()

    await _add_index_if_missing(
        "nfrs",
        "uniq_nfrs_mantisId",
        "CREATE UNIQUE INDEX uniq_nfrs_mantisId ON nfrs (mantisId)",
    )
    await _add_index_if_missing(
        "knocks",
        "uniq_knocks_knockId",
        "CREATE UNIQUE INDEX uniq_knocks_knockId ON knocks (knockId)",
    )

    await _add_foreign_key_if_missing(
        "fk_projects_account",
        """
        ALTER TABLE projects
          ADD CONSTRAINT fk_projects_account
          FOREIGN KEY (accountId) REFERENCES accounts(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )
    await _add_foreign_key_if_missing(
        "fk_cases_account",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_account
          FOREIGN KEY (account) REFERENCES accounts(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )
    await _add_foreign_key_if_missing(
        "fk_cases_product",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_product
          FOREIGN KEY (product) REFERENCES products(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )
    await _add_foreign_key_if_missing(
        "fk_cases_project",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_project
          FOREIGN KEY (project) REFERENCES projects(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )
    await _add_foreign_key_if_missing(
        "fk_cases_nfr",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_nfr
          FOREIGN KEY (nfrRecordId) REFERENCES nfrs(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )
    await _add_foreign_key_if_missing(
        "fk_cases_knock",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_knock
          FOREIGN KEY (knockRecordId) REFERENCES knocks(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )


async def _resolve_case_reference_fields(payload: dict) -> dict:
    """Keep user-facing Mantis/Knock IDs in sync with internal record FK fields."""
    nfr_record_id = payload.get("nfrRecordId")
    mantis_id = payload.get("mantisId")
    if nfr_record_id:
        nfr = await execute_query(
            "SELECT recordId, mantisId FROM nfrs WHERE recordId = %s LIMIT 1",
            [nfr_record_id],
            fetch_one=True,
        )
        if not nfr:
            raise HTTPException(status_code=400, detail="NFR record not found")
        payload["nfrRecordId"] = nfr["recordId"]
        payload["mantisId"] = nfr.get("mantisId")
    elif mantis_id:
        nfr = await execute_query(
            "SELECT recordId, mantisId FROM nfrs WHERE mantisId = %s LIMIT 1",
            [mantis_id],
            fetch_one=True,
        )
        if nfr:
            payload["nfrRecordId"] = nfr["recordId"]
            payload["mantisId"] = nfr.get("mantisId")

    knock_record_id = payload.get("knockRecordId")
    knock_id = payload.get("knockId")
    if knock_record_id:
        knock = await execute_query(
            "SELECT recordId, knockId FROM knocks WHERE recordId = %s LIMIT 1",
            [knock_record_id],
            fetch_one=True,
        )
        if not knock:
            raise HTTPException(status_code=400, detail="Knock record not found")
        payload["knockRecordId"] = knock["recordId"]
        payload["knockId"] = knock.get("knockId")
    elif knock_id:
        knock = await execute_query(
            "SELECT recordId, knockId FROM knocks WHERE knockId = %s LIMIT 1",
            [knock_id],
            fetch_one=True,
        )
        if knock:
            payload["knockRecordId"] = knock["recordId"]
            payload["knockId"] = knock.get("knockId")

    return payload


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
        SELECT n.recordId, n.mantisId
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
        SELECT k.recordId, k.knockId
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
            nfrRecordId = %s,
            knockRecordId = %s,
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
            nfr_link["recordId"] if nfr_link else None,
            knock_link["recordId"] if knock_link else None,
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
    payload = _case_payload(data)
    payload = await _resolve_case_reference_fields(payload)
    
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
            nfrRecordId, knockRecordId, knockId, mantisId,
            escalationNote, escalationType, seOwner, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id,
        "MOD-CASE",
        "1.0",
        payload["metaData"],
        "System",
        now,
        "System",
        now,
        "System",
        payload["description"],
        payload["previousStatus"],
        payload["closeDate"],
        payload["status"],
        payload["priority"],
        payload["category"],
        payload["caseOwner"],
        payload["product"],
        payload["account"],
        payload["project"],
        payload["nfrRecordId"],
        payload["knockRecordId"],
        payload["knockId"],
        payload["mantisId"],
        payload["escalationNote"],
        payload["escalationType"],
        payload["seOwner"],
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
    payload = _case_payload(data)
    payload = await _resolve_case_reference_fields(payload)

    history = existing.get("history", [])
    if isinstance(history, str):
        history = json.loads(history) if history else []

    update_payload = {
        "description": payload["description"],
        "previousStatus": payload["previousStatus"],
        "closeDate": payload["closeDate"],
        "status": payload["status"],
        "priority": payload["priority"],
        "category": payload["category"],
        "caseOwner": payload["caseOwner"],
        "product": payload["product"],
        "account": payload["account"],
        "project": payload["project"],
        "nfrRecordId": payload["nfrRecordId"],
        "knockRecordId": payload["knockRecordId"],
        "knockId": payload["knockId"],
        "mantisId": payload["mantisId"],
        "escalationNote": payload["escalationNote"],
        "escalationType": payload["escalationType"],
        "seOwner": payload["seOwner"],
        "metaData": payload["metaData"],
    }

    history.extend(
        build_update_history_entries(
            existing,
            update_payload,
            actor["displayName"],
            field_labels={
                "description": "Description",
                "previousStatus": "Previous Status",
                "closeDate": "Close Date",
                "status": "Status",
                "priority": "Priority",
                "category": "Category",
                "caseOwner": "Case Owner",
                "product": "Product",
                "account": "Account",
                "project": "Project",
                "nfrRecordId": "NFR",
                "knockRecordId": "Knock",
                "knockId": "Knock ID",
                "mantisId": "Mantis ID",
                "escalationNote": "Escalation Note",
                "escalationType": "Escalation Type",
                "seOwner": "SE Owner",
                "metaData": "Metadata",
            },
        )
    )

    if not history:
        history.append(build_history_entry("Updated", "Case updated", user=actor["displayName"]))
    
    
    sql = """
        UPDATE cases SET
            description = %s, previousStatus = %s, closeDate = %s,
            status = %s, priority = %s, category = %s,
            caseOwner = %s, product = %s, account = %s, project = %s,
            nfrRecordId = %s, knockRecordId = %s, knockId = %s,
            mantisId = %s, escalationNote = %s,
            escalationType = %s, seOwner = %s, metaData = %s,
            updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        payload["description"],
        payload["previousStatus"],
        payload["closeDate"],
        payload["status"],
        payload["priority"],
        payload["category"],
        payload["caseOwner"],
        payload["product"],
        payload["account"],
        payload["project"],
        payload["nfrRecordId"],
        payload["knockRecordId"],
        payload["knockId"],
        payload["mantisId"],
        payload["escalationNote"],
        payload["escalationType"],
        payload["seOwner"],
        payload["metaData"],
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
