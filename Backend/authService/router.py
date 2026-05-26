"""Authentication helpers and endpoints."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from config import settings
from database import execute_mutation, execute_query
from schemas import AccountVertical
from utils import current_timestamp

router = APIRouter(prefix="/auth", tags=["auth"])

DEFAULT_USER_EMAIL = "admin@local"
LEGACY_DEFAULT_USER_EMAIL = "admin@mantis.local"
DEFAULT_USER_PASSWORD = "Admin123!"
DEFAULT_USER_NAME = "Admin User"
DEFAULT_USER_ROLE = "admin"
TOKEN_TTL_DAYS = 7
ACCOUNT_VERTICALS = ("Channel", "Commercial", "Enterprise", "Government", "FSI", "Telco")


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthUser(BaseModel):
    id: int
    email: str
    displayName: str
    role: str
    vertical: Optional[AccountVertical] = None


class AssignableUser(AuthUser):
    isActive: int


class LoginResponse(BaseModel):
    token: str
    user: AuthUser


class MeResponse(BaseModel):
    user: AuthUser


class UpdateMeRequest(BaseModel):
    displayName: Optional[str] = None
    email: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: Optional[str] = None


class CreateUserRequest(BaseModel):
    email: str
    displayName: str
    role: str = "user"
    vertical: Optional[AccountVertical] = None
    password: str


class UpdateUserRoleRequest(BaseModel):
    role: str
    vertical: Optional[AccountVertical] = None


class UpdateManagedUserRequest(BaseModel):
    displayName: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    vertical: Optional[AccountVertical] = None


class UpdateUserPasswordRequest(BaseModel):
    password: str


class ManagedUser(BaseModel):
    id: int
    email: str
    displayName: str
    role: str
    vertical: Optional[AccountVertical] = None
    isActive: int
    createdAt: str
    lastLoginAt: Optional[str] = None


class CreateUserResponse(BaseModel):
    user: ManagedUser


class UpdateUserRoleResponse(BaseModel):
    user: ManagedUser


class UpdateManagedUserResponse(BaseModel):
    user: ManagedUser


class UpdateUserPasswordResponse(BaseModel):
    success: bool


def _hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return f"{salt}:{digest}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split(":", 1)
    except ValueError:
        return False

    actual = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return hmac.compare_digest(actual, expected)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_role(role: str) -> str:
    normalized = role.strip().lower()
    aliases = {
        "administrator": "admin",
        "admin": "admin",
        "manager": "manager",
        "sales manager": "manager",
        "se manager": "manager",
        "se user": "user",
        "se_user": "user",
        "user": "user",
    }
    return aliases.get(normalized, normalized)


def _normalize_vertical(vertical: Optional[str]) -> Optional[str]:
    if vertical is None:
        return None

    normalized = vertical.strip()
    if not normalized:
        return None
    if normalized not in ACCOUNT_VERTICALS:
        raise HTTPException(status_code=400, detail="Vertical must match an account vertical")
    return normalized


def _now() -> str:
    return current_timestamp()


async def ensure_auth_tables() -> None:
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          displayName VARCHAR(120) NOT NULL,
          role VARCHAR(64) NOT NULL DEFAULT 'user',
          vertical VARCHAR(120) NULL,
          passwordHash VARCHAR(255) NOT NULL,
          isActive TINYINT(1) NOT NULL DEFAULT 1,
          createdAt DATETIME NOT NULL,
                    updatedAt DATETIME NOT NULL,
          lastLoginAt DATETIME NULL
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL,
          tokenHash VARCHAR(128) NOT NULL UNIQUE,
          expiresAt DATETIME NOT NULL,
          createdAt DATETIME NOT NULL,
          INDEX idx_user_sessions_userId (userId),
          INDEX idx_user_sessions_expiresAt (expiresAt),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS user_bookmarks (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL,
          entityType VARCHAR(32) NOT NULL,
          entityId VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          subtitle VARCHAR(255) NULL,
          createdAt DATETIME NOT NULL,
          UNIQUE KEY uniq_user_bookmark (userId, entityType, entityId),
          INDEX idx_user_bookmarks_userId (userId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          userId INT NULL,
          userEmail VARCHAR(255) NOT NULL,
          action VARCHAR(64) NOT NULL,
          entityType VARCHAR(64) NOT NULL,
          entityId VARCHAR(120) NOT NULL,
          details JSON NULL,
          createdAt DATETIME NOT NULL,
          INDEX idx_audit_logs_createdAt (createdAt),
          INDEX idx_audit_logs_entity (entityType, entityId),
          INDEX idx_audit_logs_userId (userId)
        )
        """
    )

    updated_at_column = await execute_query(
        """
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'updatedAt'
        LIMIT 1
        """,
        [settings.db_name],
        fetch_one=True,
    )
    if not updated_at_column:
        await execute_mutation("ALTER TABLE users ADD COLUMN updatedAt DATETIME NULL")
        await execute_mutation("UPDATE users SET updatedAt = %s WHERE updatedAt IS NULL", [_now()])

    vertical_column = await execute_query(
        """
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'vertical'
        LIMIT 1
        """,
        [settings.db_name],
        fetch_one=True,
    )
    if not vertical_column:
        await execute_mutation("ALTER TABLE users ADD COLUMN vertical VARCHAR(120) NULL AFTER role")

    await execute_mutation(
        """
        UPDATE users
        SET vertical = CASE
          WHEN vertical IN ('Channel', 'Commercial', 'Enterprise', 'Government', 'FSI', 'Telco') THEN vertical
          WHEN vertical IN ('Financial Services', 'Finance', 'Banking') THEN 'FSI'
          WHEN vertical IN ('Public Sector') THEN 'Government'
          WHEN vertical IN ('Telecommunications', 'Telecom') THEN 'Telco'
          WHEN vertical IS NULL OR TRIM(vertical) = '' THEN NULL
          ELSE NULL
        END
        WHERE vertical IS NOT NULL
        """
    )


async def _active_admin_exists() -> bool:
    admin = await execute_query(
        """
        SELECT id
        FROM users
        WHERE isActive = 1
          AND LOWER(TRIM(role)) IN ('admin', 'administrator')
        LIMIT 1
        """,
        fetch_one=True,
    )
    return bool(admin)


async def ensure_default_user() -> None:
    await ensure_auth_tables()
    if await _active_admin_exists():
        return

    existing = await execute_query("SELECT id FROM users WHERE email = %s LIMIT 1", [DEFAULT_USER_EMAIL], fetch_one=True)
    legacy = await execute_query("SELECT id FROM users WHERE email = %s LIMIT 1", [LEGACY_DEFAULT_USER_EMAIL], fetch_one=True)
    if existing:
        if legacy:
            await execute_mutation("DELETE FROM users WHERE id = %s", [legacy["id"]])
        await execute_mutation(
            """
            UPDATE users
            SET role = %s,
                passwordHash = %s,
                isActive = 1,
                updatedAt = %s
            WHERE id = %s
            """,
            [DEFAULT_USER_ROLE, _hash_password(DEFAULT_USER_PASSWORD), _now(), existing["id"]],
        )
        return

    if legacy:
        await execute_mutation(
            """
            UPDATE users
            SET email = %s,
                role = %s,
                passwordHash = %s,
                isActive = 1,
                updatedAt = %s
            WHERE id = %s
            """,
            [DEFAULT_USER_EMAIL, DEFAULT_USER_ROLE, _hash_password(DEFAULT_USER_PASSWORD), _now(), legacy["id"]],
        )
        return

    await execute_mutation(
        """
        INSERT INTO users (email, displayName, role, passwordHash, isActive, createdAt, updatedAt)
        VALUES (%s, %s, %s, %s, 1, %s, %s)
        """,
        [DEFAULT_USER_EMAIL, DEFAULT_USER_NAME, DEFAULT_USER_ROLE, _hash_password(DEFAULT_USER_PASSWORD), _now(), _now()],
    )


def _get_token_from_request(request: Request) -> Optional[str]:
    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        return None
    return header.split(" ", 1)[1].strip() or None


async def _get_user_from_token(token: str) -> Optional[dict]:
    token_hash = _hash_token(token)
    row = await execute_query(
        """
        SELECT u.id, u.email, u.displayName, u.role, u.vertical
        FROM user_sessions s
        INNER JOIN users u ON u.id = s.userId
        WHERE s.tokenHash = %s
          AND s.expiresAt > NOW()
          AND u.isActive = 1
        LIMIT 1
        """,
        [token_hash],
        fetch_one=True,
    )
    if row:
        row["role"] = _normalize_role(row.get("role") or "user")
    return row


async def require_auth_user(request: Request) -> dict:
    token = _get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    user = await _get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    return user


async def require_admin_user(request: Request) -> dict:
    user = await require_auth_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_manager_or_admin_user(request: Request) -> dict:
    user = await require_auth_user(request)
    if user.get("role") not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Manager access required")
    return user


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest) -> LoginResponse:
    identifier = data.email.strip().lower()
    matching_users = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, passwordHash, isActive
        FROM users
        WHERE LOWER(email) = %s
           OR LOWER(TRIM(displayName)) = %s
        ORDER BY CASE
          WHEN LOWER(email) = %s THEN 0
          WHEN LOWER(TRIM(displayName)) = %s THEN 1
          ELSE 2
        END, id ASC
        LIMIT 2
        """,
        [identifier, identifier, identifier, identifier],
    )

    if len(matching_users) != 1:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user = matching_users[0]

    if not user.get("isActive"):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not _verify_password(data.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    expires_at = current_timestamp(datetime.now() + timedelta(days=TOKEN_TTL_DAYS))
    await execute_mutation(
        """
        INSERT INTO user_sessions (userId, tokenHash, expiresAt, createdAt)
        VALUES (%s, %s, %s, %s)
        """,
        [user["id"], _hash_token(token), expires_at, _now()],
    )
    await execute_mutation("UPDATE users SET lastLoginAt = %s WHERE id = %s", [_now(), user["id"]])

    return LoginResponse(
        token=token,
        user=AuthUser(
            id=user["id"],
            email=user["email"],
            displayName=user["displayName"],
            role=_normalize_role(user.get("role") or "user"),
            vertical=user.get("vertical"),
        ),
    )


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    user = await require_auth_user(request)
    return MeResponse(user=AuthUser(**user))


@router.get("/assignees", response_model=list[AssignableUser])
async def list_assignable_users(request: Request) -> list[AssignableUser]:
    await require_auth_user(request)

    rows = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive
        FROM users
        WHERE isActive = 1
          AND LOWER(TRIM(role)) IN ('user', 'se user', 'se_user', 'manager', 'sales manager', 'se manager')
        ORDER BY displayName ASC, email ASC
        """,
    )
    return [AssignableUser(**{**row, "role": _normalize_role(row.get("role") or "user")}) for row in rows]


@router.put("/me", response_model=MeResponse)
async def update_me(request: Request, data: UpdateMeRequest) -> MeResponse:
    user = await require_auth_user(request)

    updates = []
    params = []

    if data.displayName is not None:
        display_name = data.displayName.strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        updates.append("displayName = %s")
        params.append(display_name)

    if data.email is not None:
        email = data.email.strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email cannot be empty")

        existing = await execute_query(
            "SELECT id FROM users WHERE email = %s AND id <> %s LIMIT 1",
            [email, user["id"]],
            fetch_one=True,
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")

        updates.append("email = %s")
        params.append(email)

    password_change_requested = data.newPassword is not None
    if password_change_requested:
        if not data.currentPassword:
            raise HTTPException(status_code=400, detail="Current password is required")
        stored = await execute_query(
            "SELECT passwordHash FROM users WHERE id = %s LIMIT 1",
            [user["id"]],
            fetch_one=True,
        )
        if not stored or not _verify_password(data.currentPassword, stored["passwordHash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        new_password = data.newPassword.strip()
        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
        updates.append("passwordHash = %s")
        params.append(_hash_password(new_password))

    if not updates:
        raise HTTPException(status_code=400, detail="No profile changes provided")

    updates.append("updatedAt = %s")
    params.append(_now())

    await execute_mutation(
        f"UPDATE users SET {', '.join(updates)} WHERE id = %s",
        [*params, user["id"]],
    )

    refreshed = await execute_query(
        "SELECT id, email, displayName, role, vertical FROM users WHERE id = %s LIMIT 1",
        [user["id"]],
        fetch_one=True,
    )
    return MeResponse(user=AuthUser(**refreshed))


@router.delete("/me")
async def delete_me(request: Request):
    user = await require_auth_user(request)

    await execute_mutation("DELETE FROM user_sessions WHERE userId = %s", [user["id"]])
    await execute_mutation("DELETE FROM user_bookmarks WHERE userId = %s", [user["id"]])
    await execute_mutation("DELETE FROM users WHERE id = %s", [user["id"]])

    return {"success": True}


@router.post("/logout")
async def logout(request: Request):
    token = _get_token_from_request(request)
    if token:
        await execute_mutation("DELETE FROM user_sessions WHERE tokenHash = %s", [_hash_token(token)])
    return {"success": True}


@router.get("/users", response_model=list[ManagedUser])
async def list_users(request: Request):
    await require_admin_user(request)

    rows = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
             DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
             DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        ORDER BY createdAt DESC
        """,
    )
    return [ManagedUser(**{**row, "role": _normalize_role(row.get("role") or "user")}) for row in rows]


@router.post("/users", response_model=CreateUserResponse)
async def create_user(request: Request, data: CreateUserRequest) -> CreateUserResponse:
    admin = await require_admin_user(request)

    email = data.email.strip().lower()
    display_name = data.displayName.strip()
    role = _normalize_role(data.role or "user")
    vertical = _normalize_vertical(data.vertical)
    password = data.password.strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required")
    if role not in {"admin", "manager", "user"}:
        raise HTTPException(status_code=400, detail="Role must be SE user, Manager, or Administrator")
    if role in {"admin", "manager"}:
        vertical = None
    elif not vertical:
        raise HTTPException(status_code=400, detail="Vertical is required for SE users")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await execute_query("SELECT id FROM users WHERE email = %s LIMIT 1", [email], fetch_one=True)
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    now = _now()
    await execute_mutation(
        """
        INSERT INTO users (email, displayName, role, vertical, passwordHash, isActive, createdAt, updatedAt)
        VALUES (%s, %s, %s, %s, %s, 1, %s, %s)
        """,
        [email, display_name, role, vertical, _hash_password(password), now, now],
    )

    created = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
             DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
             DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        WHERE email = %s
        LIMIT 1
        """,
        [email],
        fetch_one=True,
    )

    await execute_mutation(
        """
        INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            admin["id"],
            admin["email"],
            "CREATE_USER",
            "users",
            email,
            json.dumps({"createdByAdmin": True, "vertical": vertical}),
            now,
        ],
    )

    return CreateUserResponse(user=ManagedUser(**created))


@router.put("/users/{user_id}", response_model=UpdateManagedUserResponse)
async def update_managed_user(request: Request, user_id: int, data: UpdateManagedUserRequest) -> UpdateManagedUserResponse:
    admin = await require_admin_user(request)

    existing = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
               DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
               DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        WHERE id = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    updates = []
    params = []
    audit_details = {}

    if data.displayName is not None:
        display_name = data.displayName.strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name is required")
        if display_name != existing["displayName"]:
            updates.append("displayName = %s")
            params.append(display_name)
            audit_details["displayName"] = display_name

    if data.email is not None:
        email = data.email.strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if email != existing["email"]:
            duplicate = await execute_query(
                "SELECT id FROM users WHERE email = %s AND id <> %s LIMIT 1",
                [email, user_id],
                fetch_one=True,
            )
            if duplicate:
                raise HTTPException(status_code=409, detail="Email already in use")
            updates.append("email = %s")
            params.append(email)
            audit_details["email"] = email

    role = _normalize_role(data.role) if data.role is not None else _normalize_role(existing.get("role") or "user")
    if role not in {"admin", "manager", "user"}:
        raise HTTPException(status_code=400, detail="Role must be SE user, Manager, or Administrator")

    requested_vertical = _normalize_vertical(data.vertical)
    current_vertical = existing.get("vertical") if role == "user" else None
    next_vertical = None if role in {"admin", "manager"} else requested_vertical or current_vertical
    if role == "user" and not next_vertical:
        raise HTTPException(status_code=400, detail="Vertical is required for SE users")

    current_role = _normalize_role(existing.get("role") or "user")
    if role != current_role:
        updates.append("role = %s")
        params.append(role)
        audit_details["role"] = role
    if next_vertical != existing.get("vertical"):
        updates.append("vertical = %s")
        params.append(next_vertical)
        audit_details["vertical"] = next_vertical

    if not updates:
        return UpdateManagedUserResponse(user=ManagedUser(**{**existing, "role": current_role}))

    now = _now()
    updates.append("updatedAt = %s")
    params.append(now)

    await execute_mutation(
        f"UPDATE users SET {', '.join(updates)} WHERE id = %s",
        [*params, user_id],
    )

    refreshed = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
               DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
               DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        WHERE id = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )

    await execute_mutation(
        """
        INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            admin["id"],
            admin["email"],
            "UPDATE_USER",
            "users",
            str(user_id),
            json.dumps(audit_details),
            now,
        ],
    )

    return UpdateManagedUserResponse(user=ManagedUser(**{**refreshed, "role": _normalize_role(refreshed.get("role") or "user")}))


@router.put("/users/{user_id}/role", response_model=UpdateUserRoleResponse)
async def update_user_role(request: Request, user_id: int, data: UpdateUserRoleRequest) -> UpdateUserRoleResponse:
    admin = await require_admin_user(request)

    role = _normalize_role(data.role)
    requested_vertical = _normalize_vertical(data.vertical)
    if role not in {"admin", "manager", "user"}:
        raise HTTPException(status_code=400, detail="Role must be SE user, Manager, or Administrator")

    existing = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
               DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
               DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        WHERE id = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    next_vertical = None if role in {"admin", "manager"} else requested_vertical or existing.get("vertical")
    if role == "user" and not next_vertical:
        raise HTTPException(status_code=400, detail="Vertical is required for SE users")

    if existing["role"] == role and existing.get("vertical") == next_vertical:
        return UpdateUserRoleResponse(user=ManagedUser(**existing))

    now = _now()
    await execute_mutation(
        "UPDATE users SET role = %s, vertical = %s, updatedAt = %s WHERE id = %s",
        [role, next_vertical, now, user_id],
    )

    refreshed = await execute_query(
        """
        SELECT id, email, displayName, role, vertical, isActive,
               DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS createdAt,
               DATE_FORMAT(lastLoginAt, '%Y-%m-%d %H:%i') AS lastLoginAt
        FROM users
        WHERE id = %s
        LIMIT 1
        """,
        [user_id],
        fetch_one=True,
    )

    await execute_mutation(
        """
        INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            admin["id"],
            admin["email"],
            "UPDATE_USER_ROLE",
            "users",
            str(user_id),
            json.dumps({"role": role, "vertical": next_vertical}),
            now,
        ],
    )

    return UpdateUserRoleResponse(user=ManagedUser(**refreshed))


@router.put("/users/{user_id}/password", response_model=UpdateUserPasswordResponse)
async def update_user_password(request: Request, user_id: int, data: UpdateUserPasswordRequest) -> UpdateUserPasswordResponse:
    admin = await require_admin_user(request)

    password = data.password.strip()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await execute_query(
        "SELECT id, email FROM users WHERE id = %s LIMIT 1",
        [user_id],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    now = _now()
    await execute_mutation(
        "UPDATE users SET passwordHash = %s, updatedAt = %s WHERE id = %s",
        [_hash_password(password), now, user_id],
    )

    await execute_mutation(
        """
        INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        [
            admin["id"],
            admin["email"],
            "RESET_USER_PASSWORD",
            "users",
            str(user_id),
            json.dumps({"targetEmail": existing["email"]}),
            now,
        ],
    )

    return UpdateUserPasswordResponse(success=True)
