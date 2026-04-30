"""Accounts endpoint router."""

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
from schemas import AccountCreate, AccountRecord, HistoryEntryCreate


router = APIRouter(prefix="/accounts", tags=["accounts"])

ACCOUNT_CONFIG = EntityCrudConfig(
    table_name="accounts",
    record_prefix="ACC",
    module_id="MOD-ACCOUNT",
    entity_label="Account",
    data_fields=("accountName", "website", "type", "vertical"),
    field_labels={
        "accountName": "Account Name",
        "website": "Website",
        "type": "Type",
        "vertical": "Vertical",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "accountName", "type", "vertical", "ownedBy"),
    nullable_fields=("website", "type", "vertical", "metaData"),
)


@router.get("", response_model=List[AccountRecord])
async def list_accounts(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[AccountRecord]:
    """List all accounts with optional search and pagination."""
    return await list_entities(ACCOUNT_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=AccountRecord)
async def get_account(recordId: str) -> AccountRecord:
    """Get account detail."""
    return await get_entity_or_404(ACCOUNT_CONFIG, recordId)


@router.post("", response_model=AccountRecord)
async def create_account(data: AccountCreate, request: Request) -> AccountRecord:
    """Create a new account."""
    actor = await require_auth_user(request)
    return await create_entity(ACCOUNT_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=AccountRecord)
async def update_account(recordId: str, data: AccountCreate, request: Request) -> AccountRecord:
    """Update an account."""
    actor = await require_auth_user(request)
    return await update_entity(ACCOUNT_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_account(recordId: str) -> dict[str, str]:
    """Delete an account."""
    return await delete_entity(ACCOUNT_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=AccountRecord)
async def add_account_history(recordId: str, entry: HistoryEntryCreate) -> AccountRecord:
    """Add a history entry to an account."""
    return await add_entity_history(ACCOUNT_CONFIG, recordId, entry)
