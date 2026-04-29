"""Knocks (Feature Requests) endpoint router."""

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
from schemas import HistoryEntryCreate, KnockCreate, KnockRecord


router = APIRouter(prefix="/knocks", tags=["knocks"])

KNOCK_CONFIG = EntityCrudConfig(
    table_name="knocks",
    record_prefix="KNOCK",
    module_id="MOD-KNOCK",
    entity_label="Knock",
    data_fields=("description", "knockId", "knockUrl", "status", "requestDate", "targetDate"),
    field_labels={
        "description": "Description",
        "knockId": "Knock ID",
        "knockUrl": "Knock URL",
        "status": "Status",
        "requestDate": "Request Date",
        "targetDate": "Target Date",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "description", "knockId", "status", "ownedBy"),
    nullable_fields=("knockId", "knockUrl", "status", "requestDate", "targetDate", "metaData"),
    unique_fields=("knockId",),
)


@router.get("", response_model=List[KnockRecord])
async def list_knocks(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[KnockRecord]:
    """List all knocks."""
    return await list_entities(KNOCK_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=KnockRecord)
async def get_knock(recordId: str) -> KnockRecord:
    """Get knock detail."""
    return await get_entity_or_404(KNOCK_CONFIG, recordId)


@router.post("", response_model=KnockRecord)
async def create_knock(data: KnockCreate) -> KnockRecord:
    """Create a new knock."""
    return await create_entity(KNOCK_CONFIG, data)


@router.put("/{recordId}", response_model=KnockRecord)
async def update_knock(recordId: str, data: KnockCreate, request: Request) -> KnockRecord:
    """Update a knock."""
    actor = await require_auth_user(request)
    return await update_entity(KNOCK_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_knock(recordId: str) -> dict[str, str]:
    """Delete a knock."""
    return await delete_entity(KNOCK_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=KnockRecord)
async def add_knock_history(recordId: str, entry: HistoryEntryCreate) -> KnockRecord:
    """Add a history entry."""
    return await add_entity_history(KNOCK_CONFIG, recordId, entry)
