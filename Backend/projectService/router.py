"""Projects endpoint router."""

from typing import List, Optional

from fastapi import APIRouter, Query, Request

from authService import require_auth_user
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

PROJECT_CONFIG = EntityCrudConfig(
    table_name="projects",
    record_prefix="PRJ",
    module_id="MOD-PROJECT",
    entity_label="Project",
    data_fields=("projectName", "accountId", "startDate", "closeDate", "stage", "sfdc", "sfdcValue", "se"),
    field_labels={
        "projectName": "Project Name",
        "accountId": "Account",
        "startDate": "Start Date",
        "closeDate": "Close Date",
        "stage": "Stage",
        "sfdc": "SFDC",
        "sfdcValue": "SFDC Value",
        "se": "SE",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "projectName", "accountId", "stage", "se", "ownedBy"),
    nullable_fields=("accountId", "startDate", "closeDate", "stage", "sfdc", "sfdcValue", "se", "metaData"),
)


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
async def delete_project(recordId: str) -> dict[str, str]:
    """Delete a project."""
    return await delete_entity(PROJECT_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=ProjectRecord)
async def add_project_history(recordId: str, entry: HistoryEntryCreate) -> ProjectRecord:
    """Add a history entry."""
    return await add_entity_history(PROJECT_CONFIG, recordId, entry)
