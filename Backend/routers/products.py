"""Products endpoint router."""

from fastapi import APIRouter, HTTPException, Query, Request
from typing import List, Optional
from datetime import datetime
from database import execute_query, execute_mutation, generate_record_id
from auth import require_auth_user
from schemas import ProductRecord, HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, normalize_record
import json

router = APIRouter(prefix="/products", tags=["products"])

SEARCH_FIELDS = ["recordId", "productName", "productFamily", "ownedBy"]


@router.get("", response_model=List[ProductRecord])
async def list_products(
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[ProductRecord]:
    """List all products."""
    
    where_parts = ["1=1"]
    params = []
    
    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])
    
    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM products WHERE {where_clause} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    
    results = await execute_query(sql, params)
    return [normalize_record(r) for r in results]


@router.get("/{recordId}", response_model=ProductRecord)
async def get_product(recordId: str) -> ProductRecord:
    """Get product detail."""
    
    result = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return normalize_record(result)


@router.post("", response_model=ProductRecord)
async def create_product(data: dict) -> ProductRecord:
    """Create a new product."""
    
    record_id = generate_record_id("PRD", "products")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    history = [build_history_entry("Created", "Product created")]
    
    sql = """
        INSERT INTO products (
            recordId, moduleId, recordRevision, metaData, ownedBy,
            createdAt, createdBy, updatedAt, updatedBy,
            productFamily, productName, productUrl, history
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    params = [
        record_id, "MOD-PRODUCT", "1.0", data.get("metaData"),
        data.get("ownedBy", "System"), now, "System", now, "System",
        data.get("productFamily"), data.get("productName"),
        data.get("productUrl"), json.dumps(history),
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [record_id],
        fetch_one=True
    )
    return normalize_record(result)


@router.put("/{recordId}", response_model=ProductRecord)
async def update_product(recordId: str, data: dict, request: Request) -> ProductRecord:
    """Update a product."""
    actor = await require_auth_user(request)
    
    existing = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.extend(
        build_update_history_entries(
            existing,
            {
                "productFamily": data.get("productFamily"),
                "productName": data.get("productName"),
                "productUrl": data.get("productUrl"),
                "metaData": data.get("metaData"),
            },
            actor["displayName"],
            field_labels={
                "productFamily": "Product Family",
                "productName": "Product Name",
                "productUrl": "Product URL",
                "metaData": "Metadata",
            },
        )
    )

    if not history:
        history.append(build_history_entry("Updated", "Product updated", user=actor["displayName"]))
    
    sql = """
        UPDATE products SET
            productFamily = %s, productName = %s, productUrl = %s,
            metaData = %s, updatedAt = %s, updatedBy = %s, history = %s
        WHERE recordId = %s
    """
    
    params = [
        data.get("productFamily"), data.get("productName"),
        data.get("productUrl"), data.get("metaData"),
        now, actor["displayName"], json.dumps(history), recordId,
    ]
    
    await execute_mutation(sql, params)
    
    result = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)


@router.delete("/{recordId}")
async def delete_product(recordId: str):
    """Delete a product."""
    
    existing = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    await execute_mutation("DELETE FROM products WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.post("/{recordId}/history", response_model=ProductRecord)
async def add_product_history(recordId: str, entry: HistoryEntryCreate) -> ProductRecord:
    """Add a history entry."""
    
    existing = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    history = json.loads(existing.get("history", "[]")) if isinstance(existing.get("history"), str) else existing.get("history", [])
    history.append(build_history_entry(entry.action, entry.changes, entry.user))
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    await execute_mutation(
        "UPDATE products SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), now, entry.user, recordId]
    )
    
    result = await execute_query(
        "SELECT * FROM products WHERE recordId = %s",
        [recordId],
        fetch_one=True
    )
    return normalize_record(result)
