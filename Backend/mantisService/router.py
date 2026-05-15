"""Mantis endpoint router."""

from typing import List, Optional

from fastapi import APIRouter, Query, Request

from authService import require_auth_user
from database import execute_mutation, execute_query
from entity_crud import (
    EntityCrudConfig,
    add_entity_history,
    create_entity,
    delete_entity,
    get_entity_or_404,
    list_entities,
    update_entity,
)
from schemas import HistoryEntryCreate, MantisCreate, MantisRecord


router = APIRouter(prefix="/mantis", tags=["mantis"])

MANTIS_CONFIG = EntityCrudConfig(
    table_name="mantis",
    record_prefix="MANTIS",
    module_id="MOD-MANTIS",
    entity_label="Mantis",
    data_fields=("description", "mantisId", "mantisUrl", "category", "mantisStatus", "mantisRequestDate", "mantisTargetDate"),
    field_labels={
        "description": "Description",
        "mantisId": "Mantis ID",
        "mantisUrl": "Mantis URL",
        "category": "Category",
        "mantisStatus": "NFR Status",
        "mantisRequestDate": "NFR Request Date",
        "mantisTargetDate": "NFR Target Date",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "description", "mantisId", "mantisUrl", "category", "mantisStatus", "ownedBy"),
    nullable_fields=("mantisId", "mantisUrl", "category", "mantisStatus", "mantisRequestDate", "mantisTargetDate", "metaData"),
    unique_fields=("mantisId",),
)


async def _table_exists(table_name: str) -> bool:
    result = await execute_query(
        """
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
        LIMIT 1
        """,
        [table_name],
        fetch_one=True,
    )
    return bool(result)


async def _column_exists(table_name: str, column_name: str) -> bool:
    result = await execute_query(
        """
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        LIMIT 1
        """,
        [table_name, column_name],
        fetch_one=True,
    )
    return bool(result)


async def _index_exists(table_name: str, index_name: str) -> bool:
    result = await execute_query(
        """
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND INDEX_NAME = %s
        LIMIT 1
        """,
        [table_name, index_name],
        fetch_one=True,
    )
    return bool(result)


async def ensure_mantis_schema() -> None:
    """Migrate the former NFR table/columns to Mantis naming."""

    nfrs_exists = await _table_exists("nfrs")
    mantis_exists = await _table_exists("mantis")

    if nfrs_exists and not mantis_exists:
        await execute_mutation("RENAME TABLE nfrs TO mantis")
        mantis_exists = True

    if not mantis_exists:
        return

    rename_columns = [
        ("nfrStatus", "mantisStatus", "VARCHAR(120)"),
        ("nfrRequestDate", "mantisRequestDate", "VARCHAR(32)"),
        ("nfrTargetDate", "mantisTargetDate", "VARCHAR(32)"),
    ]
    for old_name, new_name, column_type in rename_columns:
        if await _column_exists("mantis", old_name) and not await _column_exists("mantis", new_name):
            await execute_mutation(f"ALTER TABLE mantis CHANGE COLUMN {old_name} {new_name} {column_type}")

    if not await _column_exists("mantis", "category"):
        await execute_mutation("ALTER TABLE mantis ADD COLUMN category VARCHAR(120) NULL AFTER mantisUrl")

    await execute_mutation(
        """
        UPDATE mantis
        SET category = 'Feature Request'
        WHERE category IS NULL OR TRIM(category) = ''
        """
    )
    await execute_mutation(
        """
        UPDATE mantis
        SET category = CASE category
            WHEN 'bugs' THEN 'Bugs'
            WHEN 'feature request' THEN 'Feature Request'
            WHEN 'vulnerabilities' THEN 'Vulnerabilities'
            WHEN 'others' THEN 'Others'
            ELSE category
        END
        WHERE category IN ('bugs', 'feature request', 'vulnerabilities', 'others')
        """
    )
    await execute_mutation(
        """
        UPDATE mantis
        SET mantisStatus = CASE mantisStatus
            WHEN 'new' THEN 'New'
            WHEN 'concept commit' THEN 'Concept Commit'
            WHEN 'scheduled' THEN 'Scheduled'
            WHEN 'completed' THEN 'Completed'
            WHEN 'dead' THEN 'Dead'
            WHEN 'Pending' THEN 'New'
            WHEN 'In Review' THEN 'Concept Commit'
            WHEN 'Approved' THEN 'Scheduled'
            WHEN 'Rejected' THEN 'Dead'
            WHEN 'Implemented' THEN 'Completed'
            ELSE mantisStatus
        END
        WHERE mantisStatus IN ('new', 'concept commit', 'scheduled', 'completed', 'dead', 'Pending', 'In Review', 'Approved', 'Rejected', 'Implemented')
        """
    )

    if await _index_exists("mantis", "uniq_nfrs_mantisId"):
        await execute_mutation("DROP INDEX uniq_nfrs_mantisId ON mantis")
    if not await _index_exists("mantis", "uniq_mantis_mantisId"):
        await execute_mutation("CREATE UNIQUE INDEX uniq_mantis_mantisId ON mantis (mantisId)")

    await execute_mutation("UPDATE mantis SET moduleId = 'MOD-MANTIS' WHERE moduleId = 'MOD-NFR'")
    if await _table_exists("case_entity_links"):
        await execute_mutation("UPDATE case_entity_links SET entityType = 'mantis' WHERE entityType = 'nfr'")


@router.get("", response_model=List[MantisRecord])
async def list_mantis(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[MantisRecord]:
    """List all Mantis records."""
    return await list_entities(MANTIS_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=MantisRecord)
async def get_mantis(recordId: str) -> MantisRecord:
    """Get Mantis detail."""
    return await get_entity_or_404(MANTIS_CONFIG, recordId)


@router.post("", response_model=MantisRecord)
async def create_mantis(data: MantisCreate, request: Request) -> MantisRecord:
    """Create a new Mantis record."""
    actor = await require_auth_user(request)
    return await create_entity(MANTIS_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=MantisRecord)
async def update_mantis(recordId: str, data: MantisCreate, request: Request) -> MantisRecord:
    """Update a Mantis record."""
    actor = await require_auth_user(request)
    return await update_entity(MANTIS_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_mantis(recordId: str) -> dict[str, str]:
    """Delete a Mantis record."""
    existing = await get_entity_or_404(MANTIS_CONFIG, recordId)
    if existing.get("mantisId"):
        await execute_mutation("UPDATE cases SET mantisId = NULL WHERE mantisId = %s", [existing["mantisId"]])
    await execute_mutation(
        "DELETE FROM case_entity_links WHERE entityType = 'mantis' AND entityRecordId = %s",
        [recordId],
    )
    return await delete_entity(MANTIS_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=MantisRecord)
async def add_mantis_history(recordId: str, entry: HistoryEntryCreate) -> MantisRecord:
    """Add a history entry."""
    return await add_entity_history(MANTIS_CONFIG, recordId, entry)
