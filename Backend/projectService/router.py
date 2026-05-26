"""Projects endpoint router."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Query, Request

from authService import require_auth_user, require_manager_or_admin_user
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
from schemas import HistoryEntryCreate, ProjectCreate, ProjectRecord


router = APIRouter(prefix="/projects", tags=["projects"])
logger = logging.getLogger(__name__)

PROJECT_STAGES = (
    "Technical Qualification",
    "Tender - RFP/RFI/RFQ",
    "Technical Validation",
    "Technical Lost",
    "Technical Won",
)

PROJECT_CONFIG = EntityCrudConfig(
    table_name="projects",
    record_prefix="PRJ",
    module_id="MOD-PROJECT",
    entity_label="Project",
    data_fields=("projectName", "accountId", "startDate", "closeDate", "seOwner", "isClosed", "stage", "sfdc", "sfdcValue"),
    field_labels={
        "projectName": "Project Name",
        "accountId": "Account",
        "startDate": "Start Date",
        "closeDate": "Close Date",
        "seOwner": "SE Owner",
        "isClosed": "Is Closed?",
        "stage": "Stage",
        "sfdc": "SFDC",
        "sfdcValue": "SFDC Value",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "projectName", "accountId", "stage", "seOwner", "sfdc", "sfdcValue", "ownedBy"),
    nullable_fields=("accountId", "startDate", "closeDate", "seOwner", "stage", "sfdc", "metaData"),
)


async def _table_exists(table_name: str) -> bool:
    row = await execute_query(
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
    return bool(row)


async def _column_exists(table_name: str, column_name: str) -> bool:
    row = await execute_query(
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
    return bool(row)


async def _column_data_type(table_name: str, column_name: str) -> str | None:
    row = await execute_query(
        """
        SELECT DATA_TYPE AS dataType
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        LIMIT 1
        """,
        [table_name, column_name],
        fetch_one=True,
    )
    return str(row.get("dataType")) if row and row.get("dataType") else None


async def _add_column_if_missing(table_name: str, column_name: str, alter_sql: str) -> None:
    if await _column_exists(table_name, column_name):
        return

    try:
        await execute_mutation(alter_sql)
    except Exception as exc:
        logger.warning("Could not add column %s.%s: %s", table_name, column_name, exc)


async def _drop_column_if_present(table_name: str, column_name: str) -> None:
    if not await _column_exists(table_name, column_name):
        return

    try:
        await execute_mutation(f"ALTER TABLE `{table_name}` DROP COLUMN `{column_name}`")
    except Exception as exc:
        logger.warning("Could not drop column %s.%s: %s", table_name, column_name, exc)


async def ensure_project_schema() -> None:
    """Keep project storage aligned to the current project fields."""

    if not await _table_exists("projects"):
        return

    has_is_closed = await _column_exists("projects", "isClosed")
    await _add_column_if_missing(
        "projects",
        "seOwner",
        "ALTER TABLE projects ADD COLUMN seOwner VARCHAR(120) NULL AFTER closeDate",
    )
    await _add_column_if_missing(
        "projects",
        "isClosed",
        "ALTER TABLE projects ADD COLUMN isClosed TINYINT(1) NOT NULL DEFAULT 0 AFTER seOwner",
    )

    if await _column_exists("projects", "se"):
        await execute_mutation("UPDATE projects SET seOwner = se WHERE seOwner IS NULL AND se IS NOT NULL")

    if await _column_exists("projects", "sfdcValue"):
        await execute_mutation(
            """
            UPDATE projects
            SET sfdcValue = CASE
              WHEN NULLIF(REPLACE(REPLACE(REPLACE(sfdcValue, '$', ''), ',', ''), ' ', ''), '') REGEXP '^[0-9]+$'
                THEN NULLIF(REPLACE(REPLACE(REPLACE(sfdcValue, '$', ''), ',', ''), ' ', ''), '')
              ELSE NULL
            END
            WHERE sfdcValue IS NOT NULL
            """
        )
        data_type = await _column_data_type("projects", "sfdcValue")
        if data_type not in {"int", "bigint"}:
            await execute_mutation("ALTER TABLE projects MODIFY COLUMN sfdcValue BIGINT NULL")

    await execute_mutation(
        """
        UPDATE projects
        SET stage = CASE
          WHEN stage = 'Discovery' THEN 'Technical Qualification'
          WHEN stage = 'Planning' THEN 'Tender - RFP/RFI/RFQ'
          WHEN stage = 'In Progress' THEN 'Technical Validation'
          WHEN stage = 'Completed' THEN 'Technical Won'
          WHEN stage = 'On Hold' THEN 'Technical Qualification'
          ELSE stage
        END
        WHERE stage IS NOT NULL
        """
    )
    await execute_mutation(
        """
        UPDATE projects
        SET stage = 'Technical Qualification'
        WHERE stage IS NOT NULL
          AND stage NOT IN (%s, %s, %s, %s, %s)
        """,
        list(PROJECT_STAGES),
    )
    if not has_is_closed:
        await execute_mutation(
            """
            UPDATE projects
            SET isClosed = 1
            WHERE stage IN ('Technical Lost', 'Technical Won')
            """
        )
    await execute_mutation("UPDATE projects SET isClosed = 0 WHERE isClosed IS NULL")
    await _drop_column_if_present("projects", "se")


@router.get("", response_model=List[ProjectRecord])
async def list_projects(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[ProjectRecord]:
    """List all projects."""
    return await list_entities(PROJECT_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=ProjectRecord)
async def get_project(recordId: str) -> ProjectRecord:
    """Get project detail."""
    return await get_entity_or_404(PROJECT_CONFIG, recordId)


@router.post("", response_model=ProjectRecord)
async def create_project(data: ProjectCreate, request: Request) -> ProjectRecord:
    """Create a new project."""
    actor = await require_auth_user(request)
    return await create_entity(PROJECT_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=ProjectRecord)
async def update_project(recordId: str, data: ProjectCreate, request: Request) -> ProjectRecord:
    """Update a project."""
    actor = await require_auth_user(request)
    return await update_entity(PROJECT_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_project(recordId: str, request: Request) -> dict[str, str]:
    """Delete a project."""
    await require_manager_or_admin_user(request)
    await execute_mutation("UPDATE cases SET project = NULL WHERE project = %s", [recordId])
    return await delete_entity(PROJECT_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=ProjectRecord)
async def add_project_history(recordId: str, entry: HistoryEntryCreate) -> ProjectRecord:
    """Add a history entry."""
    return await add_entity_history(PROJECT_CONFIG, recordId, entry)
