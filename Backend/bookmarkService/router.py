"""Per-user bookmark endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from authService import ensure_auth_tables, require_auth_user
from database import execute_mutation, execute_query
from utils import current_timestamp

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


class BookmarkItem(BaseModel):
    id: str
    type: str
    title: str
    subtitle: Optional[str] = None
    timestamp: Optional[int] = None


class BookmarkResponse(BaseModel):
    id: str
    type: str
    title: str
    subtitle: Optional[str] = None
    timestamp: int


ALLOWED_TYPES = {"case", "project", "account", "mantis", "knock", "product"}


async def ensure_bookmark_tables() -> None:
    await ensure_auth_tables()
    await execute_mutation("UPDATE user_bookmarks SET entityType = 'mantis' WHERE entityType = 'nfr'")


def _to_timestamp(value: object) -> int:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)

    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                return int(datetime.strptime(value, fmt).timestamp() * 1000)
            except ValueError:
                continue

        try:
            return int(datetime.fromisoformat(value).timestamp() * 1000)
        except ValueError:
            pass

    return int(datetime.now().timestamp() * 1000)


@router.get("", response_model=List[BookmarkResponse])
async def list_bookmarks(request: Request) -> List[BookmarkResponse]:
    user = await require_auth_user(request)

    rows = await execute_query(
        """
        SELECT entityId, entityType, title, subtitle, createdAt
        FROM user_bookmarks
        WHERE userId = %s
        ORDER BY createdAt DESC
        """,
        [user["id"]],
    )

    return [
        BookmarkResponse(
            id=row["entityId"],
            type=row["entityType"],
            title=row["title"],
            subtitle=row.get("subtitle"),
            timestamp=_to_timestamp(row["createdAt"]),
        )
        for row in rows
    ]


@router.post("", response_model=dict)
async def add_bookmark(request: Request, item: BookmarkItem):
    user = await require_auth_user(request)

    if item.type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid bookmark type")

    await execute_mutation(
        """
        INSERT INTO user_bookmarks (userId, entityType, entityId, title, subtitle, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE title = VALUES(title), subtitle = VALUES(subtitle), createdAt = VALUES(createdAt)
        """,
        [user["id"], item.type, item.id, item.title, item.subtitle, current_timestamp()],
    )

    return {"success": True}


@router.delete("/{entity_type}/{entity_id}")
async def remove_bookmark(request: Request, entity_type: str, entity_id: str):
    user = await require_auth_user(request)

    if entity_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid bookmark type")

    await execute_mutation(
        "DELETE FROM user_bookmarks WHERE userId = %s AND entityType = %s AND entityId = %s",
        [user["id"], entity_type, entity_id],
    )

    return {"success": True}
