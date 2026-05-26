"""Per-user read-state endpoints for domain records."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from authService import ensure_auth_tables, require_auth_user
from database import execute_mutation, execute_query
from utils import current_timestamp, format_datetime_minute

router = APIRouter(prefix="/record-reads", tags=["record-reads"])

ALLOWED_ENTITY_TYPES = {"case", "project", "account", "mantis", "knock", "product"}


class MarkRecordReadRequest(BaseModel):
    entityType: str
    entityId: str


class RecordReadEntry(BaseModel):
    entityType: str
    entityId: str
    lastSeenAt: str


class RecordReadStateResponse(BaseModel):
    baselineAt: str
    reads: List[RecordReadEntry]


async def ensure_record_read_tables() -> None:
    await ensure_auth_tables()
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS user_record_read_state (
          userId INT PRIMARY KEY,
          baselineAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS user_record_reads (
          userId INT NOT NULL,
          entityType VARCHAR(32) NOT NULL,
          entityId VARCHAR(64) NOT NULL,
          lastSeenAt DATETIME NOT NULL,
          PRIMARY KEY (userId, entityType, entityId),
          INDEX idx_user_record_reads_userId (userId),
          INDEX idx_user_record_reads_entity (entityType, entityId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )


def _normalize_entity_type(value: str) -> str:
    entity_type = value.strip().lower()
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    return entity_type


def _normalize_entity_id(value: str) -> str:
    entity_id = value.strip()
    if not entity_id:
        raise HTTPException(status_code=400, detail="Entity ID is required")
    return entity_id


async def _get_or_create_user_read_state(user_id: int) -> str:
    state = await execute_query(
        """
        SELECT baselineAt
        FROM user_record_read_state
        WHERE userId = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )
    if state and state.get("baselineAt"):
        return format_datetime_minute(state["baselineAt"])

    now = current_timestamp()
    await execute_mutation(
        """
        INSERT INTO user_record_read_state (userId, baselineAt, updatedAt)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE updatedAt = VALUES(updatedAt)
        """,
        [user_id, now, now],
    )
    return now


@router.get("", response_model=RecordReadStateResponse)
async def get_record_read_state(request: Request) -> RecordReadStateResponse:
    user = await require_auth_user(request)

    baseline_at = await _get_or_create_user_read_state(user["id"])
    rows = await execute_query(
        """
        SELECT entityType, entityId, lastSeenAt
        FROM user_record_reads
        WHERE userId = %s
        """,
        [user["id"]],
    )

    return RecordReadStateResponse(
        baselineAt=baseline_at,
        reads=[
            RecordReadEntry(
                entityType=row["entityType"],
                entityId=row["entityId"],
                lastSeenAt=format_datetime_minute(row["lastSeenAt"]),
            )
            for row in rows
        ],
    )


@router.post("/mark-read", response_model=RecordReadEntry)
async def mark_record_read(request: Request, payload: MarkRecordReadRequest) -> RecordReadEntry:
    user = await require_auth_user(request)

    entity_type = _normalize_entity_type(payload.entityType)
    entity_id = _normalize_entity_id(payload.entityId)
    seen_at = current_timestamp()

    await _get_or_create_user_read_state(user["id"])
    await execute_mutation(
        """
        INSERT INTO user_record_reads (userId, entityType, entityId, lastSeenAt)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE lastSeenAt = VALUES(lastSeenAt)
        """,
        [user["id"], entity_type, entity_id, seen_at],
    )
    await execute_mutation(
        """
        UPDATE user_record_read_state
        SET updatedAt = %s
        WHERE userId = %s
        """,
        [seen_at, user["id"]],
    )

    return RecordReadEntry(entityType=entity_type, entityId=entity_id, lastSeenAt=seen_at)
