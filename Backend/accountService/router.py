"""Accounts endpoint router."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from authService import require_auth_user
from database import execute_mutation, execute_query
from entity_crud import (
    EntityCrudConfig,
    add_entity_history,
    create_entity,
    delete_entity,
    get_entity_or_404,
    update_entity,
)
from schemas import AccountCreate, AccountRecord, HistoryEntryCreate
from utils import normalize_record


router = APIRouter(prefix="/accounts", tags=["accounts"])
logger = logging.getLogger(__name__)

ACCOUNT_TYPES = ("Customer", "Distributor", "Reseller")
ACCOUNT_VERTICALS = ("Channel", "Commercial", "Enterprise", "Government", "FSI", "Telco")

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
    search_fields=("recordId", "accountName", "type", "vertical", "website"),
    nullable_fields=("website", "type", "vertical", "metaData"),
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


async def ensure_account_schema() -> None:
    """Keep account option values aligned with the current account fields."""

    if not await _table_exists("accounts"):
        return

    try:
        await execute_mutation(
            """
            UPDATE accounts
            SET type = CASE
              WHEN type IN ('Customer', 'Distributor', 'Reseller') THEN type
              WHEN type IS NULL OR TRIM(type) = '' THEN NULL
              ELSE 'Customer'
            END
            WHERE type IS NOT NULL
            """
        )
        await execute_mutation(
            """
            UPDATE accounts
            SET vertical = CASE
              WHEN vertical IN ('Channel', 'Commercial', 'Enterprise', 'Government', 'FSI', 'Telco') THEN vertical
              WHEN vertical IN ('Financial Services', 'Finance', 'Banking') THEN 'FSI'
              WHEN vertical IN ('Public Sector') THEN 'Government'
              WHEN vertical IN ('Telecommunications', 'Telecom') THEN 'Telco'
              WHEN vertical IS NULL OR TRIM(vertical) = '' THEN NULL
              ELSE 'Commercial'
            END
            WHERE vertical IS NOT NULL
            """
        )
    except Exception as exc:
        logger.warning("Could not normalize account option values: %s", exc)


def _account_is_visible_to_actor(account_record: dict, actor: dict) -> bool:
    if actor.get("role") in {"admin", "manager"}:
        return True

    actor_vertical = (actor.get("vertical") or "").strip()
    if not actor_vertical:
        return False

    return (account_record.get("vertical") or "").strip() == actor_vertical


def _account_visibility_where(actor: dict) -> tuple[str, list[str]]:
    if actor.get("role") in {"admin", "manager"}:
        return "1=1", []

    actor_vertical = (actor.get("vertical") or "").strip()
    if not actor_vertical:
        return "1=0", []

    return "`vertical` = %s", [actor_vertical]


async def _get_visible_account_or_404(record_id: str, actor: dict) -> AccountRecord:
    account = await get_entity_or_404(ACCOUNT_CONFIG, record_id)
    if not _account_is_visible_to_actor(account, actor):
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("", response_model=List[AccountRecord])
async def list_accounts(
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[AccountRecord]:
    """List all accounts with optional search and pagination."""
    actor = await require_auth_user(request)
    where_parts = ["1=1"]
    params = []

    visibility_clause, visibility_params = _account_visibility_where(actor)
    where_parts.append(visibility_clause)
    params.extend(visibility_params)

    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in ACCOUNT_CONFIG.search_fields]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in ACCOUNT_CONFIG.search_fields])

    where_clause = " AND ".join(where_parts)
    results = await execute_query(
        f"SELECT * FROM accounts WHERE {where_clause} ORDER BY createdAt DESC LIMIT %s OFFSET %s",
        [*params, limit, offset],
    )
    return [normalize_record(row) for row in results]


@router.get("/{recordId}", response_model=AccountRecord)
async def get_account(recordId: str, request: Request) -> AccountRecord:
    """Get account detail."""
    actor = await require_auth_user(request)
    return await _get_visible_account_or_404(recordId, actor)


@router.post("", response_model=AccountRecord)
async def create_account(data: AccountCreate, request: Request) -> AccountRecord:
    """Create a new account."""
    actor = await require_auth_user(request)
    return await create_entity(ACCOUNT_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=AccountRecord)
async def update_account(recordId: str, data: AccountCreate, request: Request) -> AccountRecord:
    """Update an account."""
    actor = await require_auth_user(request)
    await _get_visible_account_or_404(recordId, actor)
    return await update_entity(ACCOUNT_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_account(recordId: str, request: Request) -> dict[str, str]:
    """Delete an account."""
    actor = await require_auth_user(request)
    await _get_visible_account_or_404(recordId, actor)
    await execute_mutation("UPDATE cases SET account = NULL WHERE account = %s", [recordId])
    await execute_mutation("UPDATE projects SET accountId = NULL WHERE accountId = %s", [recordId])
    await execute_mutation(
        "DELETE FROM case_entity_links WHERE entityType = 'account' AND entityRecordId = %s",
        [recordId],
    )
    return await delete_entity(ACCOUNT_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=AccountRecord)
async def add_account_history(recordId: str, entry: HistoryEntryCreate, request: Request) -> AccountRecord:
    """Add a history entry to an account."""
    actor = await require_auth_user(request)
    await _get_visible_account_or_404(recordId, actor)
    return await add_entity_history(ACCOUNT_CONFIG, recordId, entry)
