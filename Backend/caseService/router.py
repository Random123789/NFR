"""Cases endpoint router."""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import List, Optional
import json
import logging

from authService import require_auth_user
from database import execute_mutation, execute_query, generate_record_id
from schemas import CaseCreate, CaseRecord, HistoryEntryCreate
from utils import build_history_entry, build_update_history_entries, current_timestamp, normalize_record

router = APIRouter(prefix="/cases", tags=["cases"])
logger = logging.getLogger(__name__)

CASE_FIELDS = [
    "recordId",
    "project",
    "category",
    "escalationType",
    "escalationNote",
    "closeDate",
    "description",
    "seOwner",
    "assignedTo",
    "priority",
    "status",
]
CASE_DATA_FIELDS = [field for field in CASE_FIELDS if field != "recordId"]
CASE_SELECT = ", ".join(f"`{field}`" for field in [*CASE_FIELDS, "history"])
SEARCH_FIELDS = CASE_FIELDS
CASE_LINK_TARGET_TABLES = {
    "account": "accounts",
    "product": "products",
    "mantis": "mantis",
    "knock": "knocks",
}
CASE_LINK_ENTITY_TYPES = {*CASE_LINK_TARGET_TABLES, "project"}
CASE_FIELD_LABELS = {
    "project": "Project",
    "category": "Category",
    "escalationType": "Escalation Type",
    "escalationNote": "Escalation Note",
    "closeDate": "Close Date",
    "description": "Description",
    "seOwner": "SE Owner",
    "assignedTo": "Assigned To",
    "priority": "Priority",
    "status": "Escalation Status",
}

CASE_LINK_ARRAY_FIELDS = {
    "account": "accountIds",
    "product": "productIds",
    "mantis": "mantisRecordIds",
    "knock": "knockRecordIds",
}


class CaseLinkRequest(BaseModel):
    entityType: str
    entityRecordId: str


async def _column_exists(table_name: str, column_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        """,
        [table_name, column_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _index_exists(table_name: str, index_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND INDEX_NAME = %s
        """,
        [table_name, index_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _foreign_key_exists(constraint_name: str) -> bool:
    row = await execute_query(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = %s
        """,
        [constraint_name],
        fetch_one=True,
    )
    return bool(row and row.get("count", 0) > 0)


async def _add_index_if_missing(table_name: str, index_name: str, create_sql: str) -> None:
    if await _index_exists(table_name, index_name):
        return

    try:
        await execute_mutation(create_sql)
    except Exception as exc:
        logger.warning("Could not add index %s on %s: %s", index_name, table_name, exc)


async def _add_column_if_missing(table_name: str, column_name: str, alter_sql: str) -> None:
    if await _column_exists(table_name, column_name):
        return

    try:
        await execute_mutation(alter_sql)
    except Exception as exc:
        logger.warning("Could not add column %s.%s: %s", table_name, column_name, exc)


async def _add_foreign_key_if_missing(constraint_name: str, alter_sql: str) -> None:
    if await _foreign_key_exists(constraint_name):
        return

    try:
        await execute_mutation(alter_sql)
    except Exception as exc:
        logger.warning("Could not add foreign key %s: %s", constraint_name, exc)


async def _drop_foreign_key_if_present(table_name: str, constraint_name: str) -> None:
    if not await _foreign_key_exists(constraint_name):
        return

    try:
        await execute_mutation(f"ALTER TABLE `{table_name}` DROP FOREIGN KEY `{constraint_name}`")
    except Exception as exc:
        logger.warning("Could not drop foreign key %s: %s", constraint_name, exc)


async def _drop_index_if_present(table_name: str, index_name: str) -> None:
    if not await _index_exists(table_name, index_name):
        return

    try:
        await execute_mutation(f"ALTER TABLE `{table_name}` DROP INDEX `{index_name}`")
    except Exception as exc:
        logger.warning("Could not drop index %s on %s: %s", index_name, table_name, exc)


async def _drop_column_if_present(table_name: str, column_name: str) -> None:
    if not await _column_exists(table_name, column_name):
        return

    try:
        await execute_mutation(f"ALTER TABLE `{table_name}` DROP COLUMN `{column_name}`")
    except Exception as exc:
        logger.warning("Could not drop column %s.%s: %s", table_name, column_name, exc)


def _blank_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _case_payload(data: CaseCreate) -> dict:
    return {
        "project": _blank_to_none(data.project),
        "category": _blank_to_none(data.category),
        "escalationType": _blank_to_none(data.escalationType),
        "escalationNote": _blank_to_none(data.escalationNote),
        "closeDate": _blank_to_none(data.closeDate),
        "description": data.description,
        "seOwner": _blank_to_none(data.seOwner),
        "assignedTo": _blank_to_none(data.assignedTo),
        "priority": _blank_to_none(data.priority),
        "status": _blank_to_none(data.status),
    }


def _unique_clean_ids(values: Optional[list[str]]) -> list[str]:
    if not values:
        return []

    cleaned: list[str] = []
    seen = set()
    for value in values:
        if not value:
            continue
        normalized = value.strip()
        if normalized and normalized not in seen:
            cleaned.append(normalized)
            seen.add(normalized)
    return cleaned


def _history_from_record(record: dict) -> list[dict]:
    normalized = normalize_record(dict(record))
    history = normalized.get("history")
    return list(history) if isinstance(history, list) else []


async def _normalize_foreign_key_values() -> None:
    for table_name, column_name in (
        ("cases", "project"),
        ("cases", "assignedTo"),
        ("projects", "accountId"),
        ("mantis", "mantisId"),
        ("knocks", "knockId"),
    ):
        if not await _column_exists(table_name, column_name):
            continue
        await execute_mutation(
            f"UPDATE {table_name} SET {column_name} = NULL WHERE {column_name} IS NOT NULL AND TRIM({column_name}) = ''"
        )

    await execute_mutation(
        """
        UPDATE cases c
        LEFT JOIN projects p ON c.project = p.recordId
        SET c.project = NULL
        WHERE c.project IS NOT NULL AND p.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        UPDATE projects p
        LEFT JOIN accounts a ON p.accountId = a.recordId
        SET p.accountId = NULL
        WHERE p.accountId IS NOT NULL AND a.recordId IS NULL
        """
    )


async def ensure_case_schema() -> None:
    """Keep the cases table aligned to the minimal case field set."""

    await _add_column_if_missing(
        "cases",
        "assignedTo",
        "ALTER TABLE cases ADD COLUMN assignedTo VARCHAR(120) NULL AFTER seOwner",
    )
    await _add_column_if_missing(
        "cases",
        "history",
        "ALTER TABLE cases ADD COLUMN history JSON NULL",
    )

    for constraint_name in ("fk_cases_nfr", "fk_cases_knock", "fk_cases_account", "fk_cases_product"):
        await _drop_foreign_key_if_present("cases", constraint_name)

    for index_name in ("idx_cases_nfrRecordId", "idx_cases_knockRecordId"):
        await _drop_index_if_present("cases", index_name)

    for column_name in (
        "moduleId",
        "recordRevision",
        "metaData",
        "ownedBy",
        "createdAt",
        "createdBy",
        "updatedAt",
        "updatedBy",
        "previousStatus",
        "caseOwner",
        "nfrRecordId",
        "knockRecordId",
    ):
        await _drop_column_if_present("cases", column_name)

    await _normalize_foreign_key_values()

    await _add_index_if_missing("cases", "idx_cases_project", "CREATE INDEX idx_cases_project ON cases (project)")
    await _add_index_if_missing("cases", "idx_cases_seOwner", "CREATE INDEX idx_cases_seOwner ON cases (seOwner)")
    await _add_index_if_missing("cases", "idx_cases_assignedTo", "CREATE INDEX idx_cases_assignedTo ON cases (assignedTo)")
    await _add_index_if_missing("mantis", "uniq_mantis_mantisId", "CREATE UNIQUE INDEX uniq_mantis_mantisId ON mantis (mantisId)")
    await _add_index_if_missing("knocks", "uniq_knocks_knockId", "CREATE UNIQUE INDEX uniq_knocks_knockId ON knocks (knockId)")

    await _add_foreign_key_if_missing(
        "fk_projects_account",
        """
        ALTER TABLE projects
          ADD CONSTRAINT fk_projects_account
          FOREIGN KEY (accountId) REFERENCES accounts(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )


async def drop_legacy_case_link_columns() -> None:
    for index_name in ("idx_cases_account", "idx_cases_product", "idx_cases_mantisId", "idx_cases_knockId"):
        await _drop_index_if_present("cases", index_name)

    for column_name in ("account", "product", "mantisId", "knockId"):
        await _drop_column_if_present("cases", column_name)
    await _add_foreign_key_if_missing(
        "fk_cases_project",
        """
        ALTER TABLE cases
          ADD CONSTRAINT fk_cases_project
          FOREIGN KEY (project) REFERENCES projects(recordId)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        """,
    )


async def ensure_case_link_tables() -> None:
    await ensure_case_schema()
    backfill_created_at = current_timestamp()

    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS case_entity_links (
          caseRecordId VARCHAR(32) NOT NULL,
          entityType VARCHAR(16) NOT NULL,
          entityRecordId VARCHAR(32) NOT NULL,
          createdAt DATETIME NOT NULL,
          createdBy VARCHAR(120) NULL,
          PRIMARY KEY (caseRecordId, entityType, entityRecordId),
          INDEX idx_case_entity_links_case (caseRecordId),
          INDEX idx_case_entity_links_entity (entityType, entityRecordId)
        )
        """
    )
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS case_watchers (
          caseRecordId VARCHAR(32) NOT NULL,
          userId INT NULL,
          displayName VARCHAR(120) NOT NULL,
          watchedAt DATETIME NOT NULL,
          watchedBy VARCHAR(120) NULL,
          PRIMARY KEY (caseRecordId, displayName),
          INDEX idx_case_watchers_case (caseRecordId),
          INDEX idx_case_watchers_userId (userId),
          FOREIGN KEY (caseRecordId) REFERENCES cases(recordId) ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    await execute_mutation("UPDATE case_entity_links SET entityType = 'mantis' WHERE entityType = 'nfr'")
    await cleanup_case_entity_links()
    await _add_foreign_key_if_missing(
        "fk_case_entity_links_case",
        """
        ALTER TABLE case_entity_links
          ADD CONSTRAINT fk_case_entity_links_case
          FOREIGN KEY (caseRecordId) REFERENCES cases(recordId)
          ON DELETE CASCADE
          ON UPDATE CASCADE
        """,
    )

    if await _column_exists("cases", "account"):
        await execute_mutation(
            """
            INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
            SELECT c.recordId, 'account', c.account, %s, c.seOwner
            FROM cases c
            INNER JOIN accounts a ON a.recordId = c.account
            WHERE c.account IS NOT NULL AND TRIM(c.account) <> ''
            """,
            [backfill_created_at],
        )
    if await _column_exists("cases", "product"):
        await execute_mutation(
            """
            INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
            SELECT c.recordId, 'product', c.product, %s, c.seOwner
            FROM cases c
            INNER JOIN products p ON p.recordId = c.product
            WHERE c.product IS NOT NULL AND TRIM(c.product) <> ''
            """,
            [backfill_created_at],
        )
    if await _column_exists("cases", "mantisId"):
        await execute_mutation(
            """
            INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
            SELECT c.recordId, 'mantis', m.recordId, %s, c.seOwner
            FROM cases c
            INNER JOIN mantis m ON m.mantisId = c.mantisId
            WHERE c.mantisId IS NOT NULL AND TRIM(c.mantisId) <> ''
            """,
            [backfill_created_at],
        )
    if await _column_exists("cases", "knockId"):
        await execute_mutation(
            """
            INSERT IGNORE INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
            SELECT c.recordId, 'knock', k.recordId, %s, c.seOwner
            FROM cases c
            INNER JOIN knocks k ON k.knockId = c.knockId
            WHERE c.knockId IS NOT NULL AND TRIM(c.knockId) <> ''
            """,
            [backfill_created_at],
        )

    await drop_legacy_case_link_columns()


async def cleanup_case_entity_links() -> None:
    await execute_mutation(
        """
        DELETE cel
        FROM case_entity_links cel
        LEFT JOIN cases c ON c.recordId = cel.caseRecordId
        WHERE c.recordId IS NULL
        """
    )
    await execute_mutation(
        """
        DELETE FROM case_entity_links
        WHERE entityType NOT IN ('account', 'product', 'mantis', 'knock')
        """
    )

    for entity_type, table_name in CASE_LINK_TARGET_TABLES.items():
        await execute_mutation(
            f"""
            DELETE cel
            FROM case_entity_links cel
            LEFT JOIN `{table_name}` target_entity ON target_entity.recordId = cel.entityRecordId
            WHERE cel.entityType = %s
              AND target_entity.recordId IS NULL
            """,
            [entity_type],
        )


async def _lookup_mantis_record_id(mantis_id: Optional[str]) -> Optional[str]:
    if not mantis_id:
        return None

    mantis = await execute_query(
        "SELECT recordId FROM mantis WHERE mantisId = %s LIMIT 1",
        [mantis_id],
        fetch_one=True,
    )
    return mantis["recordId"] if mantis else None


async def _lookup_knock_record_id(knock_id: Optional[str]) -> Optional[str]:
    if not knock_id:
        return None

    knock = await execute_query(
        "SELECT recordId FROM knocks WHERE knockId = %s LIMIT 1",
        [knock_id],
        fetch_one=True,
    )
    return knock["recordId"] if knock else None


async def _upsert_case_entity_link(record_id: str, entity_type: str, entity_record_id: str, actor_display_name: str) -> None:
    await execute_mutation(
        """
        INSERT INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE createdAt = VALUES(createdAt), createdBy = VALUES(createdBy)
        """,
        [record_id, entity_type, entity_record_id, current_timestamp(), actor_display_name],
    )


async def _case_link_ids_from_data(data: CaseCreate) -> dict[str, list[str]]:
    account_ids = _unique_clean_ids(data.accountIds)
    if data.account:
        account_ids = _unique_clean_ids([*account_ids, data.account])

    product_ids = _unique_clean_ids(data.productIds)
    if data.product:
        product_ids = _unique_clean_ids([*product_ids, data.product])

    mantis_ids = _unique_clean_ids(data.mantisRecordIds)
    legacy_mantis_record_id = await _lookup_mantis_record_id(data.mantisId)
    if legacy_mantis_record_id:
        mantis_ids = _unique_clean_ids([*mantis_ids, legacy_mantis_record_id])

    knock_ids = _unique_clean_ids(data.knockRecordIds)
    legacy_knock_record_id = await _lookup_knock_record_id(data.knockId)
    if legacy_knock_record_id:
        knock_ids = _unique_clean_ids([*knock_ids, legacy_knock_record_id])

    return {
        "account": account_ids,
        "product": product_ids,
        "mantis": mantis_ids,
        "knock": knock_ids,
    }


def _case_link_field_was_provided(data: CaseCreate, entity_type: str) -> bool:
    fields = data.__fields_set__
    if entity_type == "account":
        return "accountIds" in fields or "account" in fields
    if entity_type == "product":
        return "productIds" in fields or "product" in fields
    if entity_type == "mantis":
        return "mantisRecordIds" in fields or "mantisId" in fields
    if entity_type == "knock":
        return "knockRecordIds" in fields or "knockId" in fields
    return False


async def _replace_case_links_from_data(record_id: str, data: CaseCreate, actor_display_name: str, replace_all: bool) -> None:
    link_ids = await _case_link_ids_from_data(data)

    for entity_type, entity_record_ids in link_ids.items():
        if not replace_all and not _case_link_field_was_provided(data, entity_type):
            continue

        await execute_mutation(
            "DELETE FROM case_entity_links WHERE caseRecordId = %s AND entityType = %s",
            [record_id, entity_type],
        )
        for entity_record_id in entity_record_ids:
            await _upsert_case_entity_link(record_id, entity_type, entity_record_id, actor_display_name)


async def get_case_or_404(record_id: str) -> dict:
    case_row = await execute_query(
        f"SELECT {CASE_SELECT} FROM cases WHERE recordId = %s",
        [record_id],
        fetch_one=True,
    )
    if not case_row:
        raise HTTPException(status_code=404, detail="Case not found")
    return case_row


async def enrich_case_records(case_rows: list[dict]) -> list[dict]:
    normalized_rows = [normalize_record(row) for row in case_rows]
    case_ids = [row["recordId"] for row in normalized_rows if row.get("recordId")]

    for row in normalized_rows:
        for array_field in CASE_LINK_ARRAY_FIELDS.values():
            row[array_field] = []
        row["watcherNames"] = []

    if not case_ids:
        return normalized_rows

    placeholders = ", ".join(["%s"] * len(case_ids))
    link_rows = await execute_query(
        f"""
        SELECT caseRecordId, entityType, entityRecordId
        FROM case_entity_links
        WHERE caseRecordId IN ({placeholders})
          AND entityType IN ('account', 'product', 'mantis', 'knock')
        ORDER BY createdAt ASC
        """,
        case_ids,
    )
    by_case = {row["recordId"]: row for row in normalized_rows}
    for link in link_rows:
        array_field = CASE_LINK_ARRAY_FIELDS.get(link.get("entityType"))
        case_record = by_case.get(link.get("caseRecordId"))
        entity_record_id = link.get("entityRecordId")
        if not array_field or not case_record or not entity_record_id:
            continue
        if entity_record_id not in case_record[array_field]:
            case_record[array_field].append(entity_record_id)

    watcher_rows = await execute_query(
        f"""
        SELECT caseRecordId, displayName
        FROM case_watchers
        WHERE caseRecordId IN ({placeholders})
        ORDER BY watchedAt ASC
        """,
        case_ids,
    )
    for watcher in watcher_rows:
        case_record = by_case.get(watcher.get("caseRecordId"))
        display_name = (watcher.get("displayName") or "").strip()
        if case_record and display_name and display_name not in case_record["watcherNames"]:
            case_record["watcherNames"].append(display_name)

    return normalized_rows


async def enrich_case_record(case_row: dict) -> dict:
    rows = await enrich_case_records([case_row])
    return rows[0]


async def build_case_links_payload(record_id: str) -> dict:
    linked_accounts = await execute_query(
        """
        SELECT a.*
        FROM case_entity_links cel
        INNER JOIN accounts a ON a.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'account'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_products = await execute_query(
        """
        SELECT p.*
        FROM case_entity_links cel
        INNER JOIN products p ON p.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'product'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_projects = await execute_query(
        """
        SELECT p.*
        FROM cases c
        INNER JOIN projects p ON p.recordId = c.project
        WHERE c.recordId = %s
        """,
        [record_id],
    )
    linked_mantis = await execute_query(
        """
        SELECT m.*
        FROM case_entity_links cel
        INNER JOIN mantis m ON m.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'mantis'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )
    linked_knocks = await execute_query(
        """
        SELECT k.*
        FROM case_entity_links cel
        INNER JOIN knocks k ON k.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s AND cel.entityType = 'knock'
        ORDER BY cel.createdAt DESC
        """,
        [record_id],
    )

    return {
        "accounts": [normalize_record(row) for row in linked_accounts],
        "products": [normalize_record(row) for row in linked_products],
        "projects": [normalize_record(row) for row in linked_projects],
        "mantis": [normalize_record(row) for row in linked_mantis],
        "knocks": [normalize_record(row) for row in linked_knocks],
    }


async def build_linked_cases_payload(entity_type: str, entity_record_id: str, actor: dict) -> list[dict]:
    if entity_type == "project":
        cases_rows = await execute_query(
            f"""
            SELECT {CASE_SELECT}
            FROM cases c
            WHERE c.project = %s
            ORDER BY c.recordId DESC
            """,
            [entity_record_id],
        )
    else:
        cases_rows = await execute_query(
            f"""
            SELECT {CASE_SELECT}
            FROM case_entity_links cel
            INNER JOIN cases c ON c.recordId = cel.caseRecordId
            WHERE cel.entityType = %s AND cel.entityRecordId = %s
            ORDER BY c.recordId DESC
            """,
            [entity_type, entity_record_id],
        )

    visible_cases = []
    for row in cases_rows:
        if await _case_is_visible_to_actor(row, actor):
            visible_cases.append(row)
    return await enrich_case_records(visible_cases)


def _case_visibility_clause(actor: dict, case_alias: str = "") -> tuple[str, list[str]]:
    if actor.get("role") in {"admin", "manager"}:
        return "1=1", []

    actor_name = (actor.get("displayName") or "").strip().lower()
    actor_id = actor.get("id")
    actor_vertical = (actor.get("vertical") or "").strip()
    qualifier = f"{case_alias}." if case_alias else ""
    conditions = []
    params: list[str] = []

    if actor_name:
        conditions.append(f"(LOWER(TRIM({qualifier}`seOwner`)) = %s OR LOWER(TRIM({qualifier}`assignedTo`)) = %s)")
        params.extend([actor_name, actor_name])

    if actor_id:
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM case_watchers visible_watcher
                WHERE visible_watcher.caseRecordId = {qualifier}`recordId`
                  AND visible_watcher.userId = %s
            )
            """
        )
        params.append(actor_id)

    if actor_vertical:
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM case_entity_links visible_link
                INNER JOIN accounts linked_account ON linked_account.recordId = visible_link.entityRecordId
                WHERE visible_link.caseRecordId = {qualifier}`recordId`
                  AND visible_link.entityType = 'account'
                  AND linked_account.vertical = %s
            )
            """
        )
        params.append(actor_vertical)

    if not conditions:
        return "1=0", []

    return f"({' OR '.join(conditions)})", params


async def _case_is_visible_to_actor(case_record: dict, actor: dict) -> bool:
    if actor.get("role") in {"admin", "manager"}:
        return True

    actor_name = (actor.get("displayName") or "").strip().lower()
    if actor_name:
        visible_values = [case_record.get("seOwner"), case_record.get("assignedTo")]
        if any((value or "").strip().lower() == actor_name for value in visible_values):
            return True

    actor_id = actor.get("id")
    if actor_id:
        visible_watcher = await execute_query(
            """
            SELECT 1
            FROM case_watchers
            WHERE caseRecordId = %s
              AND userId = %s
            LIMIT 1
            """,
            [case_record.get("recordId"), actor_id],
            fetch_one=True,
        )
        if visible_watcher:
            return True

    actor_vertical = (actor.get("vertical") or "").strip()
    if not actor_vertical:
        return False

    visible_linked_account = await execute_query(
        """
        SELECT 1
        FROM case_entity_links cel
        INNER JOIN accounts a ON a.recordId = cel.entityRecordId
        WHERE cel.caseRecordId = %s
          AND cel.entityType = 'account'
          AND a.vertical = %s
        LIMIT 1
        """,
        [case_record.get("recordId"), actor_vertical],
        fetch_one=True,
    )
    return bool(visible_linked_account)


async def _add_case_watcher(record_id: str, actor: dict) -> None:
    display_name = (actor.get("displayName") or "").strip()
    if not display_name:
        return

    now = current_timestamp()
    await execute_mutation(
        """
        INSERT INTO case_watchers (caseRecordId, userId, displayName, watchedAt, watchedBy)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          userId = VALUES(userId),
          watchedAt = VALUES(watchedAt),
          watchedBy = VALUES(watchedBy)
        """,
        [record_id, actor.get("id"), display_name, now, display_name],
    )


@router.get("", response_model=List[CaseRecord])
async def list_cases(
    request: Request,
    q: Optional[str] = Query(None),
    limit: int = Query(10),
    offset: int = Query(0),
) -> List[CaseRecord]:
    """List all cases with optional search and pagination."""

    actor = await require_auth_user(request)
    where_parts = ["1=1"]
    params = []

    visibility_clause, visibility_params = _case_visibility_clause(actor)
    where_parts.append(visibility_clause)
    params.extend(visibility_params)

    if q:
        search_conditions = [f"`{field}` LIKE %s" for field in SEARCH_FIELDS]
        where_parts.append(f"({' OR '.join(search_conditions)})")
        params.extend([f"%{q}%" for _ in SEARCH_FIELDS])

    for field, value in request.query_params.items():
        if field in CASE_FIELDS and value is not None:
            where_parts.append(f"`{field}` = %s")
            params.append(value)

    where_clause = " AND ".join(where_parts)
    sql = f"""
        SELECT {CASE_SELECT}
        FROM cases
        WHERE {where_clause}
        ORDER BY recordId DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    results = await execute_query(sql, params)
    return await enrich_case_records(results)


@router.get("/linked")
async def get_linked_cases(request: Request, entityType: str = Query(...), entityRecordId: str = Query(...)) -> list[dict]:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    entity_type = entityType.strip().lower()
    if entity_type == "nfr":
        entity_type = "mantis"
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    entity_record_id = entityRecordId.strip()
    if not entity_record_id:
        raise HTTPException(status_code=400, detail="entityRecordId is required")

    return await build_linked_cases_payload(entity_type, entity_record_id, actor)


@router.get("/{recordId}", response_model=CaseRecord)
async def get_case(recordId: str, request: Request) -> CaseRecord:
    """Get case detail."""

    actor = await require_auth_user(request)
    result = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(result, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    return await enrich_case_record(result)


@router.post("", response_model=CaseRecord)
async def create_case(data: CaseCreate, request: Request) -> CaseRecord:
    """Create a new case."""

    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    record_id = generate_record_id("REC", "cases")
    payload = _case_payload(data)

    sql = f"""
        INSERT INTO cases (
            recordId, project, category, escalationType, escalationNote,
            closeDate, description, seOwner, assignedTo, priority, status, history
        ) VALUES ({', '.join(['%s'] * (len(CASE_FIELDS) + 1))})
    """
    history = [build_history_entry("Created", "Case created", user=actor["displayName"])]
    params = [record_id, *[payload[field] for field in CASE_DATA_FIELDS], json.dumps(history)]

    await execute_mutation(sql, params)
    await _replace_case_links_from_data(record_id, data, actor["displayName"], replace_all=True)

    result = await get_case_or_404(record_id)
    return await enrich_case_record(result)


@router.put("/{recordId}", response_model=CaseRecord)
async def update_case(recordId: str, data: CaseCreate, request: Request) -> CaseRecord:
    """Update a case."""

    actor = await require_auth_user(request)
    existing = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(existing, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    payload = _case_payload(data)
    status_changed = (existing.get("status") or "") != (payload.get("status") or "")
    history = _history_from_record(existing)
    history.extend(
        build_update_history_entries(
            existing,
            payload,
            actor["displayName"],
            field_labels=CASE_FIELD_LABELS,
        )
    )

    update_fields = [*CASE_DATA_FIELDS, "history"]
    assignments = ", ".join(f"`{field}` = %s" for field in update_fields)
    sql = f"UPDATE cases SET {assignments} WHERE recordId = %s"
    params = [payload[field] for field in CASE_DATA_FIELDS]
    params.append(json.dumps(history))
    params.append(recordId)

    await execute_mutation(sql, params)
    if status_changed:
        await _add_case_watcher(recordId, actor)
    await _replace_case_links_from_data(recordId, data, actor["displayName"], replace_all=False)

    result = await get_case_or_404(recordId)
    return await enrich_case_record(result)


@router.post("/{recordId}/history", response_model=CaseRecord)
async def add_case_history(recordId: str, entry: HistoryEntryCreate, request: Request) -> CaseRecord:
    """Append a comment/history entry to a visible case."""

    actor = await require_auth_user(request)
    existing = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(existing, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    history = _history_from_record(existing)
    history.append(
        build_history_entry(
            action=entry.action,
            changes=entry.changes,
            user=entry.user or actor["displayName"],
            field=entry.field,
            previous_value=entry.previousValue,
            new_value=entry.newValue,
        )
    )

    await execute_mutation(
        "UPDATE cases SET history = %s WHERE recordId = %s",
        [json.dumps(history), recordId],
    )

    result = await get_case_or_404(recordId)
    return await enrich_case_record(result)


@router.delete("/{recordId}")
async def delete_case(recordId: str, request: Request):
    """Delete a case."""

    actor = await require_auth_user(request)
    existing = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(existing, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    await execute_mutation("DELETE FROM case_entity_links WHERE caseRecordId = %s", [recordId])
    await execute_mutation("DELETE FROM cases WHERE recordId = %s", [recordId])
    return {"status": "deleted", "recordId": recordId}


@router.get("/{recordId}/links")
async def get_case_links(recordId: str, request: Request) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    return await build_case_links_payload(recordId)


@router.post("/{recordId}/links")
async def add_case_link(recordId: str, request: Request, payload: CaseLinkRequest) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    entity_type = payload.entityType.strip().lower()
    if entity_type == "nfr":
        entity_type = "mantis"
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    entity_record_id = payload.entityRecordId.strip()
    if not entity_record_id:
        raise HTTPException(status_code=400, detail="entityRecordId is required")

    table_map = {
        "account": "accounts",
        "product": "products",
        "project": "projects",
        "mantis": "mantis",
        "knock": "knocks",
    }
    target = await execute_query(
        f"SELECT recordId FROM {table_map[entity_type]} WHERE recordId = %s LIMIT 1",
        [entity_record_id],
        fetch_one=True,
    )
    if not target:
        raise HTTPException(status_code=404, detail="Linked entity not found")

    if entity_type == "project":
        await execute_mutation("UPDATE cases SET project = %s WHERE recordId = %s", [entity_record_id, recordId])
    else:
        await _upsert_case_entity_link(recordId, entity_type, entity_record_id, actor["displayName"])

    return await build_case_links_payload(recordId)


@router.delete("/{recordId}/links/{entityType}/{entityRecordId}")
async def remove_case_link(recordId: str, entityType: str, entityRecordId: str, request: Request) -> dict:
    actor = await require_auth_user(request)
    await ensure_case_link_tables()

    case_row = await get_case_or_404(recordId)
    if not await _case_is_visible_to_actor(case_row, actor):
        raise HTTPException(status_code=404, detail="Case not found")

    entity_type = entityType.strip().lower()
    if entity_type == "nfr":
        entity_type = "mantis"
    if entity_type not in CASE_LINK_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type")

    if entity_type == "project":
        await execute_mutation(
            "UPDATE cases SET project = NULL WHERE recordId = %s AND project = %s",
            [recordId, entityRecordId],
        )
    else:
        await execute_mutation(
            """
            DELETE FROM case_entity_links
            WHERE caseRecordId = %s AND entityType = %s AND entityRecordId = %s
            """,
            [recordId, entity_type, entityRecordId],
        )

    return await build_case_links_payload(recordId)
