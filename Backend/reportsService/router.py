"""Reports aggregation endpoint router."""

import json
import logging
from typing import List
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from authService import ensure_auth_tables, require_auth_user
from database import execute_mutation, execute_query
from report_builder import build_legacy_query_spec, build_report_schema, execute_report_query
from schemas import (
    CustomReportCreate,
    CustomReportRecord,
    ReportFilters,
    ReportQuerySpec,
    ReportRunResult,
    ReportSummary,
    ReportValue,
)
from utils import current_timestamp, format_datetime_minute, trim_timestamp_seconds

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger(__name__)


async def ensure_custom_report_tables() -> None:
    await ensure_auth_tables()
    await execute_mutation(
        """
        CREATE TABLE IF NOT EXISTS custom_reports (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          chartType VARCHAR(16) NOT NULL,
          metric VARCHAR(32) NOT NULL,
          layoutSpan TINYINT NOT NULL DEFAULT 1,
          sortOrder INT NOT NULL DEFAULT 0,
          filters LONGTEXT NOT NULL,
          querySpec LONGTEXT NULL,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL,
          INDEX idx_custom_reports_userId (userId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    for column_name, alter_sql in (
        ("layoutSpan", "ALTER TABLE custom_reports ADD COLUMN layoutSpan TINYINT NOT NULL DEFAULT 1"),
        ("sortOrder", "ALTER TABLE custom_reports ADD COLUMN sortOrder INT NOT NULL DEFAULT 0"),
        ("querySpec", "ALTER TABLE custom_reports ADD COLUMN querySpec LONGTEXT NULL"),
    ):
        column_check = await execute_query(
            """
            SELECT COUNT(*) AS count
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'custom_reports'
              AND COLUMN_NAME = %s
            """,
            [column_name],
            fetch_one=True,
        )
        if not column_check or column_check.get("count", 0) == 0:
            await execute_mutation(alter_sql)


def _serialize_filters(filters: ReportFilters) -> str:
    return json.dumps(filters.dict())


def _serialize_query_spec(query_spec: ReportQuerySpec | None) -> str | None:
    if not query_spec:
        return None
    return json.dumps(query_spec.dict())


def _deserialize_filters(filters_value: str | dict | None) -> dict:
    if isinstance(filters_value, dict):
        return filters_value
    if not filters_value:
        return ReportFilters().dict()
    try:
        return json.loads(filters_value)
    except (TypeError, json.JSONDecodeError):
        return ReportFilters().dict()


def _deserialize_query_spec(query_spec_value: str | dict | None, metric: str, filters: dict) -> dict:
    if isinstance(query_spec_value, dict):
        return query_spec_value
    if query_spec_value:
        try:
            return json.loads(query_spec_value)
        except (TypeError, json.JSONDecodeError):
            pass
    return build_legacy_query_spec(metric, filters)


def _build_custom_report_record(row: dict) -> CustomReportRecord:
    def _fmt(dt):
        if isinstance(dt, datetime):
            return format_datetime_minute(dt)
        if dt is None:
            return ""
        return str(trim_timestamp_seconds(dt))

    filters = _deserialize_filters(row.get("filters"))
    try:
        report_filters = ReportFilters(**filters)
    except Exception:
        logger.warning("Invalid saved report filters for report %s; using defaults", row.get("id"), exc_info=True)
        report_filters = ReportFilters()

    raw_query_spec = _deserialize_query_spec(row.get("querySpec"), row["metric"], filters)
    try:
        query_spec = ReportQuerySpec(**raw_query_spec)
    except Exception:
        logger.warning("Invalid saved report query spec for report %s; using legacy fallback", row.get("id"), exc_info=True)
        try:
            query_spec = ReportQuerySpec(**build_legacy_query_spec(row["metric"], filters))
        except Exception:
            logger.warning("Legacy report fallback failed for report %s; using default spec", row.get("id"), exc_info=True)
            query_spec = ReportQuerySpec()

    return CustomReportRecord(
        id=row["id"],
        userId=row["userId"],
        title=row["title"],
        chartType=row["chartType"],
        metric=row["metric"],
        layoutSpan=row.get("layoutSpan", 1),
        sortOrder=row.get("sortOrder", 0),
        filters=report_filters,
        querySpec=query_spec,
        createdAt=_fmt(row.get("createdAt")),
        updatedAt=_fmt(row.get("updatedAt")),
    )


@router.get("/summary", response_model=ReportSummary)
async def get_summary() -> ReportSummary:
    """Get key metrics summary."""
    
    cases = await execute_query("SELECT status, priority FROM cases")
    accounts = await execute_query("SELECT COUNT(*) as count FROM accounts")
    projects = await execute_query("SELECT COUNT(*) as count FROM projects")
    
    total_cases = len(cases)
    open_cases = sum(1 for c in cases if c.get("status") == "Open")
    in_progress_cases = sum(1 for c in cases if c.get("status") == "In Progress")
    escalated_cases = sum(1 for c in cases if c.get("status") == "Escalated")
    closed_cases = sum(1 for c in cases if c.get("status") == "Closed")
    high_priority_cases = sum(1 for c in cases if c.get("priority") == "High" or c.get("priority") == "Critical")
    
    return ReportSummary(
        totalCases=total_cases,
        openCases=open_cases,
        inProgressCases=in_progress_cases,
        escalatedCases=escalated_cases,
        closedCases=closed_cases,
        highPriorityCases=high_priority_cases,
        totalAccounts=accounts[0]["count"] if accounts else 0,
        totalProjects=projects[0]["count"] if projects else 0,
    )


@router.get("/cases-by-status", response_model=List[ReportValue])
async def get_cases_by_status() -> List[ReportValue]:
    """Get case count breakdown by status."""
    
    sql = "SELECT status as name, COUNT(*) as value FROM cases GROUP BY status"
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"status-{idx}",
            label=row.get("name", "Unknown"),
            value=row.get("value", 0)
        ))
    return report


@router.get("/cases-by-priority", response_model=List[ReportValue])
async def get_cases_by_priority() -> List[ReportValue]:
    """Get case count breakdown by priority."""
    
    sql = "SELECT priority as name, COUNT(*) as value FROM cases GROUP BY priority"
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"priority-{idx}",
            label=row.get("name", "Unknown"),
            value=row.get("value", 0)
        ))
    return report


@router.get("/cases-by-product", response_model=List[ReportValue])
async def get_cases_by_product() -> List[ReportValue]:
    """Get case count breakdown by product."""
    
    sql = """
        SELECT p.recordId AS product, p.productName as name, COUNT(DISTINCT cel.caseRecordId) as value
        FROM case_entity_links cel
        INNER JOIN products p ON p.recordId = cel.entityRecordId
        WHERE cel.entityType = 'product'
        GROUP BY p.recordId, p.productName
    """
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"product-{idx}",
            label=row.get("name", "Unknown"),
            value=row.get("value", 0)
        ))
    return report


@router.get("/cases-over-time", response_model=List[ReportValue])
async def get_cases_over_time() -> List[ReportValue]:
    """Get case close-date trend over time."""
    
    sql = """
        SELECT DATE(closeDate) as date, COUNT(*) as value
        FROM cases
        WHERE closeDate IS NOT NULL AND TRIM(closeDate) <> ''
        GROUP BY DATE(closeDate)
        ORDER BY date DESC
        LIMIT 30
    """
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"date-{idx}",
            label=str(row.get("date", "Unknown")),
            value=row.get("value", 0)
        ))
    return report


@router.get("/custom", response_model=List[CustomReportRecord])
async def list_custom_reports(request: Request) -> List[CustomReportRecord]:
    actor = await require_auth_user(request)
    await ensure_custom_report_tables()

    rows = await execute_query(
        """
        SELECT id, userId, title, chartType, metric, layoutSpan, sortOrder, filters, querySpec, createdAt, updatedAt
        FROM custom_reports
        WHERE userId = %s
        ORDER BY sortOrder ASC, updatedAt DESC, id DESC
        """,
        [actor["id"]],
    )
    return [_build_custom_report_record(row) for row in rows]


@router.get("/builder/schema")
async def get_report_builder_schema() -> dict:
    return build_report_schema()


@router.post("/preview", response_model=ReportRunResult)
async def preview_report(request: Request, payload: ReportQuerySpec) -> ReportRunResult:
    actor = await require_auth_user(request)
    try:
        return await execute_report_query(payload, actor)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Report preview failed for user %s", actor.get("id"))
        raise HTTPException(
            status_code=400,
            detail="Report query failed. Check the selected dataset, related data, fields, and filters.",
        ) from exc


@router.post("/custom", response_model=CustomReportRecord)
async def create_custom_report(request: Request, payload: CustomReportCreate) -> CustomReportRecord:
    actor = await require_auth_user(request)
    await ensure_custom_report_tables()

    next_order_row = await execute_query(
        """
        SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextSortOrder
        FROM custom_reports
        WHERE userId = %s
        """,
        [actor["id"]],
        fetch_one=True,
    )
    next_sort_order = int((next_order_row or {}).get("nextSortOrder", 0))
    now = current_timestamp()

    inserted_id = await execute_mutation(
        """
        INSERT INTO custom_reports (userId, title, chartType, metric, layoutSpan, filters, querySpec, createdAt, updatedAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            actor["id"],
            payload.title.strip(),
            payload.chartType,
            payload.metric,
            payload.layoutSpan,
            _serialize_filters(payload.filters),
            _serialize_query_spec(payload.querySpec),
            now,
            now,
        ],
    )

    await execute_mutation(
        "UPDATE custom_reports SET sortOrder = %s WHERE id = %s AND userId = %s",
        [next_sort_order, inserted_id, actor["id"]],
    )

    row = await execute_query(
        """
        SELECT id, userId, title, chartType, metric, layoutSpan, sortOrder, filters, querySpec, createdAt, updatedAt
        FROM custom_reports
        WHERE id = %s AND userId = %s
        LIMIT 1
        """,
        [inserted_id, actor["id"]],
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create custom report")
    return _build_custom_report_record(row)


@router.put("/custom/{reportId}", response_model=CustomReportRecord)
async def update_custom_report(reportId: int, request: Request, payload: CustomReportCreate) -> CustomReportRecord:
    actor = await require_auth_user(request)
    await ensure_custom_report_tables()

    existing = await execute_query(
        "SELECT id FROM custom_reports WHERE id = %s AND userId = %s LIMIT 1",
        [reportId, actor["id"]],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Custom report not found")

    await execute_mutation(
        """
        UPDATE custom_reports
        SET title = %s,
            chartType = %s,
            metric = %s,
            layoutSpan = %s,
            sortOrder = %s,
            filters = %s,
            querySpec = %s,
            updatedAt = %s
        WHERE id = %s AND userId = %s
        """,
        [
            payload.title.strip(),
            payload.chartType,
            payload.metric,
            payload.layoutSpan,
            payload.sortOrder,
            _serialize_filters(payload.filters),
            _serialize_query_spec(payload.querySpec),
            current_timestamp(),
            reportId,
            actor["id"],
        ],
    )

    row = await execute_query(
        """
        SELECT id, userId, title, chartType, metric, layoutSpan, sortOrder, filters, querySpec, createdAt, updatedAt
        FROM custom_reports
        WHERE id = %s AND userId = %s
        LIMIT 1
        """,
        [reportId, actor["id"]],
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Custom report not found")
    return _build_custom_report_record(row)


@router.get("/custom/{reportId}/run", response_model=ReportRunResult)
async def run_custom_report(reportId: int, request: Request) -> ReportRunResult:
    actor = await require_auth_user(request)
    await ensure_custom_report_tables()

    row = await execute_query(
        """
        SELECT id, userId, title, chartType, metric, layoutSpan, sortOrder, filters, querySpec, createdAt, updatedAt
        FROM custom_reports
        WHERE id = %s AND userId = %s
        LIMIT 1
        """,
        [reportId, actor["id"]],
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Custom report not found")

    report = _build_custom_report_record(row)
    try:
        return await execute_report_query(report.querySpec, actor)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Saved report %s failed for user %s", reportId, actor.get("id"))
        raise HTTPException(
            status_code=400,
            detail="Saved report query failed. Edit the report and check its related data, fields, and filters.",
        ) from exc


@router.delete("/custom/{reportId}")
async def delete_custom_report(reportId: int, request: Request) -> dict:
    actor = await require_auth_user(request)
    await ensure_custom_report_tables()

    existing = await execute_query(
        "SELECT id FROM custom_reports WHERE id = %s AND userId = %s LIMIT 1",
        [reportId, actor["id"]],
        fetch_one=True,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Custom report not found")

    await execute_mutation(
        "DELETE FROM custom_reports WHERE id = %s AND userId = %s",
        [reportId, actor["id"]],
    )

    return {"status": "deleted", "id": reportId}
