"""Products endpoint router."""

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
from schemas import HistoryEntryCreate, ProductCreate, ProductRecord


router = APIRouter(prefix="/products", tags=["products"])

PRODUCT_CONFIG = EntityCrudConfig(
    table_name="products",
    record_prefix="PRD",
    module_id="MOD-PRODUCT",
    entity_label="Product",
    data_fields=("productFamily", "productName", "productVersion", "productUrl", "description"),
    field_labels={
        "productFamily": "Product Family",
        "productName": "Product Name",
        "productVersion": "Version",
        "productUrl": "Product URL",
        "description": "Description",
        "metaData": "Metadata",
    },
    search_fields=("recordId", "productName", "productFamily", "productVersion", "description", "ownedBy"),
    nullable_fields=("productFamily", "productVersion", "productUrl", "description", "metaData"),
    duplicate_fields=("productFamily", "productName", "productVersion"),
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


async def ensure_product_schema() -> None:
    """Ensure product-specific columns exist for existing deployments."""

    if not await _table_exists("products"):
        return

    if not await _column_exists("products", "description"):
        await execute_mutation("ALTER TABLE products ADD COLUMN description TEXT NULL AFTER productUrl")

    if not await _column_exists("products", "productVersion"):
        await execute_mutation("ALTER TABLE products ADD COLUMN productVersion VARCHAR(120) NULL AFTER productName")


@router.get("", response_model=List[ProductRecord])
async def list_products(
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[ProductRecord]:
    """List all products."""
    await require_auth_user(request)
    return await list_entities(PRODUCT_CONFIG, q, limit, offset)


@router.get("/{recordId}", response_model=ProductRecord)
async def get_product(recordId: str, request: Request) -> ProductRecord:
    """Get product detail."""
    await require_auth_user(request)
    return await get_entity_or_404(PRODUCT_CONFIG, recordId)


@router.post("", response_model=ProductRecord)
async def create_product(data: ProductCreate, request: Request) -> ProductRecord:
    """Create a new product."""
    actor = await require_auth_user(request)
    return await create_entity(PRODUCT_CONFIG, data, actor["displayName"])


@router.put("/{recordId}", response_model=ProductRecord)
async def update_product(recordId: str, data: ProductCreate, request: Request) -> ProductRecord:
    """Update a product."""
    actor = await require_auth_user(request)
    return await update_entity(PRODUCT_CONFIG, recordId, data, actor["displayName"])


@router.delete("/{recordId}")
async def delete_product(recordId: str, request: Request) -> dict[str, str]:
    """Delete a product."""
    await require_manager_or_admin_user(request)
    await execute_mutation(
        "DELETE FROM case_entity_links WHERE entityType = 'product' AND entityRecordId = %s",
        [recordId],
    )
    return await delete_entity(PRODUCT_CONFIG, recordId)


@router.post("/{recordId}/history", response_model=ProductRecord)
async def add_product_history(recordId: str, entry: HistoryEntryCreate, request: Request) -> ProductRecord:
    """Add a history entry."""
    await require_auth_user(request)
    return await add_entity_history(PRODUCT_CONFIG, recordId, entry)
