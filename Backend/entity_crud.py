"""Shared CRUD helpers for simple record-backed FastAPI services."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Mapping, Optional, Sequence, Union

from fastapi import HTTPException
from pydantic import BaseModel

from database import execute_mutation, execute_query, generate_record_id
from schemas import HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, current_timestamp, normalize_record


_DUPLICATE_NULL_SENTINEL = "__nfr_duplicate_null__"


@dataclass(frozen=True)
class EntityCrudConfig:
    """Configuration for a simple entity table with common record metadata."""

    table_name: str
    record_prefix: str
    module_id: str
    entity_label: str
    data_fields: Sequence[str]
    field_labels: Mapping[str, str]
    search_fields: Sequence[str]
    nullable_fields: Sequence[str] = ()
    unique_fields: Sequence[str] = ()
    duplicate_fields: Optional[Sequence[str]] = None


def _now() -> str:
    return current_timestamp()


Payload = Union[BaseModel, Mapping[str, Any]]


def _payload_value(data: Payload, field: str, default: Any = None) -> Any:
    if isinstance(data, BaseModel):
        return getattr(data, field, default)
    return data.get(field, default)


def _db_value(config: EntityCrudConfig, data: Payload, field: str, default: Any = None) -> Any:
    value = _payload_value(data, field, default)
    if field in config.nullable_fields and isinstance(value, str) and not value.strip():
        return None
    return value


def _payload_to_update(config: EntityCrudConfig, data: Payload) -> dict[str, Any]:
    payload = {field: _db_value(config, data, field) for field in config.data_fields}
    payload["metaData"] = _db_value(config, data, "metaData")
    return payload


def _history_from_record(record: Mapping[str, Any]) -> list[dict[str, Any]]:
    history = record.get("history", [])
    if isinstance(history, str):
        return json.loads(history) if history else []
    return list(history or [])


def _canonical_duplicate_value(value: Any) -> str:
    if value is None:
        return _DUPLICATE_NULL_SENTINEL

    if isinstance(value, bool):
        return "1" if value else "0"

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned.lower() if cleaned else _DUPLICATE_NULL_SENTINEL

    return json.dumps(value, sort_keys=True, default=str).strip().lower()


def _duplicate_field_condition(field: str) -> str:
    return f"COALESCE(NULLIF(LOWER(TRIM(CAST(`{field}` AS CHAR))), ''), %s) = %s"


async def _ensure_no_duplicate_record(
    config: EntityCrudConfig,
    data: Payload,
    record_id: Optional[str] = None,
) -> None:
    conditions = []
    params: list[Any] = []

    duplicate_fields = config.duplicate_fields or config.data_fields
    for field in duplicate_fields:
        conditions.append(_duplicate_field_condition(field))
        params.extend([_DUPLICATE_NULL_SENTINEL, _canonical_duplicate_value(_db_value(config, data, field))])

    if not conditions:
        return

    where_clause = " AND ".join(conditions)
    if record_id:
        where_clause += " AND recordId <> %s"
        params.append(record_id)

    existing = await execute_query(
        f"SELECT recordId FROM {config.table_name} WHERE {where_clause} LIMIT 1",
        params,
        fetch_one=True,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate {config.entity_label} found ({existing['recordId']}).",
        )


async def _ensure_unique_fields(
    config: EntityCrudConfig,
    data: Payload,
    record_id: Optional[str] = None,
) -> None:
    for field in config.unique_fields:
        value = _db_value(config, data, field)
        if value is None:
            continue

        params = [value]
        where_clause = f"{field} = %s"
        if record_id:
            where_clause += " AND recordId <> %s"
            params.append(record_id)

        existing = await execute_query(
            f"SELECT recordId FROM {config.table_name} WHERE {where_clause} LIMIT 1",
            params,
            fetch_one=True,
        )
        if existing:
            label = config.field_labels.get(field, field)
            raise HTTPException(status_code=400, detail=f"{label} must be unique")


async def list_entities(
    config: EntityCrudConfig,
    q: Optional[str],
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    """List records with optional text search across configured fields."""
    where_parts = ["1=1"]
    params: list[Any] = []

    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in config.search_fields]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in config.search_fields])

    where_clause = " AND ".join(where_parts)
    sql = f"SELECT * FROM {config.table_name} WHERE {where_clause} ORDER BY createdAt DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    results = await execute_query(sql, params)
    return [normalize_record(row) for row in results]


async def get_entity_or_404(config: EntityCrudConfig, record_id: str) -> dict[str, Any]:
    """Fetch one record or raise a consistent 404."""
    result = await execute_query(
        f"SELECT * FROM {config.table_name} WHERE recordId = %s",
        [record_id],
        fetch_one=True,
    )

    if not result:
        raise HTTPException(status_code=404, detail=f"{config.entity_label} not found")

    return normalize_record(result)


async def create_entity(
    config: EntityCrudConfig,
    data: Payload,
    actor_display_name: str = "System",
) -> dict[str, Any]:
    """Create a standard entity record."""
    await _ensure_unique_fields(config, data)
    await _ensure_no_duplicate_record(config, data)

    record_id = generate_record_id(config.record_prefix, config.table_name)
    now = _now()
    actor = actor_display_name or "System"
    history = [build_history_entry("Created", f"{config.entity_label} created", user=actor)]

    columns = [
        "recordId",
        "moduleId",
        "recordRevision",
        "metaData",
        "ownedBy",
        "createdAt",
        "createdBy",
        "updatedAt",
        "updatedBy",
        *config.data_fields,
        "history",
    ]
    placeholders = ", ".join(["%s"] * len(columns))
    column_sql = ", ".join(columns)

    params = [
        record_id,
        config.module_id,
        "1.0",
        _db_value(config, data, "metaData"),
        actor,
        now,
        actor,
        now,
        actor,
        *[_db_value(config, data, field) for field in config.data_fields],
        json.dumps(history),
    ]

    await execute_mutation(
        f"INSERT INTO {config.table_name} ({column_sql}) VALUES ({placeholders})",
        params,
    )
    return await get_entity_or_404(config, record_id)


async def update_entity(
    config: EntityCrudConfig,
    record_id: str,
    data: Payload,
    actor_display_name: str,
) -> dict[str, Any]:
    """Update a standard entity record and append field-level history entries."""
    existing = await get_entity_or_404(config, record_id)
    await _ensure_unique_fields(config, data, record_id)
    await _ensure_no_duplicate_record(config, data, record_id)

    now = _now()
    update_payload = _payload_to_update(config, data)
    history = _history_from_record(existing)

    history.extend(
        build_update_history_entries(
            existing,
            update_payload,
            actor_display_name,
            field_labels=config.field_labels,
        )
    )

    if not history:
        history.append(
            build_history_entry(
                "Updated",
                f"{config.entity_label} updated",
                user=actor_display_name,
            )
        )

    update_fields = [*config.data_fields, "metaData", "updatedAt", "updatedBy", "history"]
    set_clause = ", ".join(f"{field} = %s" for field in update_fields)
    params = [
        *[_db_value(config, data, field) for field in config.data_fields],
        _db_value(config, data, "metaData"),
        now,
        actor_display_name,
        json.dumps(history),
        record_id,
    ]

    await execute_mutation(
        f"UPDATE {config.table_name} SET {set_clause} WHERE recordId = %s",
        params,
    )
    return await get_entity_or_404(config, record_id)


async def delete_entity(config: EntityCrudConfig, record_id: str) -> dict[str, str]:
    """Delete a standard entity record."""
    await get_entity_or_404(config, record_id)
    await execute_mutation(f"DELETE FROM {config.table_name} WHERE recordId = %s", [record_id])
    return {"status": "deleted", "recordId": record_id}


async def add_entity_history(
    config: EntityCrudConfig,
    record_id: str,
    entry: HistoryEntryCreate,
) -> dict[str, Any]:
    """Append a manual history entry to a standard entity record."""
    existing = await get_entity_or_404(config, record_id)
    history = _history_from_record(existing)
    actor = entry.user or "System"

    history.append(
        build_history_entry(
            action=entry.action,
            changes=entry.changes,
            user=actor,
            field=entry.field,
            previous_value=entry.previousValue,
            new_value=entry.newValue,
        )
    )

    await execute_mutation(
        f"UPDATE {config.table_name} SET history = %s, updatedAt = %s, updatedBy = %s WHERE recordId = %s",
        [json.dumps(history), _now(), actor, record_id],
    )
    return await get_entity_or_404(config, record_id)
