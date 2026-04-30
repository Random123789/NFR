"""NFRs (Non-Functional Requirements) endpoint router."""

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
from schemas import HistoryEntryCreate, NfrCreate, NfrRecord


router = APIRouter(prefix="/nfrs", tags=["nfrs"])

NFR_CONFIG = EntityCrudConfig(
    table_name="nfrs",
    record_prefix="NFR",
    module_id="MOD-NFR",
    entity_label="NFR",
    data_fields=("description", "mantisId", "mantisUrl", "nfrStatus", "nfrRequestDate", "nfrTargetDate"),
    field_labels={
        "description": "Description",
        "mantisId": "Mantis ID",
        "mantisUrl": "Mantis URL",
        "nfrStatus": "Status",
        "nfrRequestDate": "Request Date",
        "nfrTargetDate": "Target Date",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "description", "mantisId", "nfrStatus", "ownedBy"),
    nullable_fields=("mantisId", "mantisUrl", "nfrStatus", "nfrRequestDate", "nfrTargetDate", "metaData"),
    unique_fields=("mantisId",),
)


@router.get("", response_model=List[NfrRecord])
async def list_nfrs(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[NfrRecord]:
    """List all NFRs."""
    return await list_entities(NFR_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=NfrRecord)
async def get_nfr(recordId: str) -> NfrRecord:
    """Get NFR detail."""
    return await get_entity_or_404(NFR_CONFIG, recordId)


@router.post("", response_model=NfrRecord)
async def create_nfr(data: NfrCreate, request: Request) -> NfrRecord:
    """Create a new NFR."""
    actor = await require_auth_user(request)
    return await create_entity(NFR_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=NfrRecord)
async def update_nfr(recordId: str, data: NfrCreate, request: Request) -> NfrRecord:
    """Update an NFR."""
    actor = await require_auth_user(request)
    return await update_entity(NFR_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_nfr(recordId: str) -> dict[str, str]:
    """Delete an NFR."""
    return await delete_entity(NFR_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=NfrRecord)
async def add_nfr_history(recordId: str, entry: HistoryEntryCreate) -> NfrRecord:
    """Add a history entry."""
    return await add_entity_history(NFR_CONFIG, recordId, entry)
