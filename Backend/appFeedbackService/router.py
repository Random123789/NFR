"""Application feedback endpoint router."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

from authService import ensure_auth_tables, require_admin_user, require_auth_user
from database import execute_mutation, execute_query
from utils import current_timestamp, format_datetime_minute

router = APIRouter(prefix="/app-feedback", tags=["app-feedback"])

ALLOWED_CATEGORIES = {"bug", "improvement", "feature"}
MAX_IMAGE_COUNT = 5
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class AppFeedbackImageMeta(BaseModel):
    id: int
    fileName: str
    contentType: str
    fileSize: int


class AppFeedbackRecord(BaseModel):
    id: int
    category: str
    status: str = "open"
    title: str
    description: str
    createdByName: str
    createdByEmail: str
    createdAt: str
    doneAt: Optional[str] = None
    doneByName: Optional[str] = None
    images: List[AppFeedbackImageMeta] = []


async def ensure_app_feedback_tables() -> None:
    await ensure_auth_tables()
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS app_feedback (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          category VARCHAR(32) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          createdByUserId INT NULL,
          createdByName VARCHAR(120) NOT NULL,
          createdByEmail VARCHAR(255) NOT NULL,
          createdAt DATETIME NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'open',
          doneAt DATETIME NULL,
          doneByUserId INT NULL,
          doneByName VARCHAR(120) NULL,
          INDEX idx_app_feedback_createdAt (createdAt),
          INDEX idx_app_feedback_category (category),
          INDEX idx_app_feedback_status (status),
          INDEX idx_app_feedback_createdByUserId (createdByUserId),
          FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (doneByUserId) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS app_feedback_images (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          feedbackId BIGINT NOT NULL,
          fileName VARCHAR(255) NOT NULL,
          contentType VARCHAR(120) NOT NULL,
          fileSize INT NOT NULL,
          imageData LONGBLOB NOT NULL,
          createdAt DATETIME NOT NULL,
          INDEX idx_app_feedback_images_feedbackId (feedbackId),
          FOREIGN KEY (feedbackId) REFERENCES app_feedback(id) ON DELETE CASCADE
        )
        """
    )

    for column_name, alter_sql in (
        ("status", "ALTER TABLE app_feedback ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open' AFTER createdAt"),
        ("doneAt", "ALTER TABLE app_feedback ADD COLUMN doneAt DATETIME NULL AFTER status"),
        ("doneByUserId", "ALTER TABLE app_feedback ADD COLUMN doneByUserId INT NULL AFTER doneAt"),
        ("doneByName", "ALTER TABLE app_feedback ADD COLUMN doneByName VARCHAR(120) NULL AFTER doneByUserId"),
    ):
        column_check = await execute_query(
            """
            SELECT COUNT(*) AS count
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'app_feedback'
              AND COLUMN_NAME = %s
            """,
            [column_name],
            fetch_one=True,
        )
        if not column_check or column_check.get("count", 0) == 0:
            await execute_mutation(alter_sql)

    index_check = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'app_feedback'
          AND INDEX_NAME = 'idx_app_feedback_status'
        """,
        fetch_one=True,
    )
    if not index_check or index_check.get("count", 0) == 0:
        await execute_mutation("CREATE INDEX idx_app_feedback_status ON app_feedback (status)")


def _format_timestamp(value) -> str:
    return format_datetime_minute(value)


async def _get_images_for_feedback(feedback_ids: list[int]) -> dict[int, list[AppFeedbackImageMeta]]:
    if not feedback_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(feedback_ids))
    rows = await execute_query(
        f"""
        SELECT id, feedbackId, fileName, contentType, fileSize
        FROM app_feedback_images
        WHERE feedbackId IN ({placeholders})
        ORDER BY id ASC
        """,
        feedback_ids,
    )

    images_by_feedback: dict[int, list[AppFeedbackImageMeta]] = {feedback_id: [] for feedback_id in feedback_ids}
    for row in rows:
        images_by_feedback.setdefault(row["feedbackId"], []).append(
            AppFeedbackImageMeta(
                id=row["id"],
                fileName=row["fileName"],
                contentType=row["contentType"],
                fileSize=row["fileSize"],
            )
        )
    return images_by_feedback


async def _build_feedback_record(feedback_id: int) -> AppFeedbackRecord:
    row = await execute_query(
        """
        SELECT id, category, status, title, description, createdByName, createdByEmail, createdAt, doneAt, doneByName
        FROM app_feedback
        WHERE id = %s
        LIMIT 1
        """,
        [feedback_id],
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")

    images_by_feedback = await _get_images_for_feedback([feedback_id])
    return AppFeedbackRecord(
        id=row["id"],
        category=row["category"],
        status=row.get("status") or "open",
        title=row["title"],
        description=row["description"],
        createdByName=row["createdByName"],
        createdByEmail=row["createdByEmail"],
        createdAt=_format_timestamp(row["createdAt"]),
        doneAt=_format_timestamp(row["doneAt"]) if row.get("doneAt") else None,
        doneByName=row.get("doneByName"),
        images=images_by_feedback.get(feedback_id, []),
    )


@router.post("", response_model=AppFeedbackRecord)
async def create_app_feedback(
    request: Request,
    category: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    images: Optional[List[UploadFile]] = File(None),
) -> AppFeedbackRecord:
    user = await require_auth_user(request)
    normalized_category = category.strip().lower()
    clean_title = title.strip()
    clean_description = description.strip()
    upload_files = images or []

    if normalized_category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid feedback category")
    if not clean_title:
        raise HTTPException(status_code=400, detail="Summary is required")
    if not clean_description:
        raise HTTPException(status_code=400, detail="Description is required")
    if len(upload_files) > MAX_IMAGE_COUNT:
        raise HTTPException(status_code=400, detail=f"Upload up to {MAX_IMAGE_COUNT} images")

    prepared_images: list[tuple[str, str, bytes]] = []
    for upload in upload_files:
        if not upload.filename:
            continue

        content_type = upload.content_type or "application/octet-stream"
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"{upload.filename} is not an image")

        content = await upload.read()
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail=f"{upload.filename} exceeds 5 MB")
        if not content:
            continue

        prepared_images.append((upload.filename, content_type, content))

    now = current_timestamp()
    feedback_id = await execute_mutation(
        """
        INSERT INTO app_feedback (
          category, title, description, createdByUserId, createdByName, createdByEmail, createdAt
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            normalized_category,
            clean_title,
            clean_description,
            user.get("id"),
            user.get("displayName") or user.get("email") or "Unknown user",
            user.get("email") or "",
            now,
        ],
    )

    for file_name, content_type, content in prepared_images:
        await execute_mutation(
            """
            INSERT INTO app_feedback_images (
              feedbackId, fileName, contentType, fileSize, imageData, createdAt
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [feedback_id, file_name[:255], content_type[:120], len(content), content, now],
        )

    return await _build_feedback_record(feedback_id)


@router.get("", response_model=List[AppFeedbackRecord])
async def list_app_feedback(request: Request, limit: int = 100) -> list[AppFeedbackRecord]:
    await require_admin_user(request)
    safe_limit = max(1, min(limit, 200))
    rows = await execute_query(
        """
        SELECT id, category, status, title, description, createdByName, createdByEmail, createdAt, doneAt, doneByName
        FROM app_feedback
        WHERE COALESCE(status, 'open') = 'open'
        ORDER BY createdAt DESC, id DESC
        LIMIT %s
        """,
        [safe_limit],
    )

    feedback_ids = [row["id"] for row in rows]
    images_by_feedback = await _get_images_for_feedback(feedback_ids)

    return [
        AppFeedbackRecord(
            id=row["id"],
            category=row["category"],
            status=row.get("status") or "open",
            title=row["title"],
            description=row["description"],
            createdByName=row["createdByName"],
            createdByEmail=row["createdByEmail"],
            createdAt=_format_timestamp(row["createdAt"]),
            doneAt=_format_timestamp(row["doneAt"]) if row.get("doneAt") else None,
            doneByName=row.get("doneByName"),
            images=images_by_feedback.get(row["id"], []),
        )
        for row in rows
    ]


@router.put("/{feedback_id}/done", response_model=AppFeedbackRecord)
async def mark_app_feedback_done(request: Request, feedback_id: int) -> AppFeedbackRecord:
    admin = await require_admin_user(request)
    existing = await execute_query(
        "SELECT id FROM app_feedback WHERE id = %s LIMIT 1",
        [feedback_id],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Feedback not found")

    await execute_mutation(
        """
        UPDATE app_feedback
        SET status = 'done',
            doneAt = %s,
            doneByUserId = %s,
            doneByName = %s
        WHERE id = %s
        """,
        [
            current_timestamp(),
            admin.get("id"),
            admin.get("displayName") or admin.get("email") or "Admin",
            feedback_id,
        ],
    )

    return await _build_feedback_record(feedback_id)


@router.get("/images/{image_id}")
async def get_app_feedback_image(request: Request, image_id: int) -> Response:
    await require_admin_user(request)
    row = await execute_query(
        """
        SELECT fileName, contentType, imageData
        FROM app_feedback_images
        WHERE id = %s
        LIMIT 1
        """,
        [image_id],
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")

    content = row["imageData"]
    if isinstance(content, bytearray):
        content = bytes(content)

    file_name = str(row.get("fileName") or "feedback-image").replace('"', "")
    return Response(
        content=content,
        media_type=row.get("contentType") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )
