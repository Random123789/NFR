"""Safe SQL compiler for visual custom reports."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from fastapi import HTTPException

from database import execute_query
from schemas import ReportJoinSpec, ReportQuerySpec, ReportRunResult


@dataclass(frozen=True)
class ReportField:
    key: str
    label: str
    expression: str
    source: str
    type: str = "text"


@dataclass(frozen=True)
class ReportJoin:
    source: str
    label: str
    sql: str


@dataclass(frozen=True)
class ReportSource:
    key: str
    label: str
    table: str
    alias: str
    primary_field: str
    fields: Tuple[ReportField, ...]
    joins: Tuple[ReportJoin, ...] = ()


def _field(source: str, alias: str, name: str, label: str, type_name: str = "text") -> ReportField:
    return ReportField(
        key=f"{source}.{name}",
        label=label,
        expression=f"{alias}.{name}",
        source=source,
        type=type_name,
    )


SOURCE_DEFS: Dict[str, ReportSource] = {
    "cases": ReportSource(
        key="cases",
        label="Cases",
        table="cases",
        alias="c",
        primary_field="c.recordId",
        fields=(
            _field("cases", "c", "recordId", "Case ID"),
            _field("cases", "c", "description", "Case Description"),
            _field("cases", "c", "status", "Case Status"),
            _field("cases", "c", "priority", "Priority"),
            _field("cases", "c", "category", "Category"),
            _field("cases", "c", "caseOwner", "Case Owner"),
            _field("cases", "c", "seOwner", "SE Owner"),
            _field("cases", "c", "createdAt", "Case Created", "date"),
            _field("cases", "c", "updatedAt", "Case Updated", "date"),
            _field("cases", "c", "closeDate", "Case Close Date", "date"),
            _field("cases", "c", "account", "Account ID"),
            _field("cases", "c", "project", "Project ID"),
            _field("cases", "c", "product", "Product ID"),
            _field("cases", "c", "nfrRecordId", "NFR Record ID"),
            _field("cases", "c", "knockRecordId", "Knock Record ID"),
            _field("cases", "c", "mantisId", "Mantis ID"),
            _field("cases", "c", "knockId", "Knock ID"),
        ),
        joins=(
            ReportJoin("accounts", "Accounts", "JOIN accounts a ON c.account = a.recordId"),
            ReportJoin("projects", "Projects", "JOIN projects p ON c.project = p.recordId"),
            ReportJoin("products", "Products", "JOIN products prd ON c.product = prd.recordId"),
            ReportJoin("nfrs", "NFRs", "JOIN nfrs n ON c.nfrRecordId = n.recordId"),
            ReportJoin("knocks", "Knocks", "JOIN knocks k ON c.knockRecordId = k.recordId"),
        ),
    ),
    "accounts": ReportSource(
        key="accounts",
        label="Accounts",
        table="accounts",
        alias="a",
        primary_field="a.recordId",
        fields=(
            _field("accounts", "a", "recordId", "Account ID"),
            _field("accounts", "a", "accountName", "Account Name"),
            _field("accounts", "a", "type", "Account Type"),
            _field("accounts", "a", "vertical", "Vertical"),
            _field("accounts", "a", "website", "Website"),
            _field("accounts", "a", "ownedBy", "Account Owner"),
            _field("accounts", "a", "createdAt", "Account Created", "date"),
            _field("accounts", "a", "updatedAt", "Account Updated", "date"),
        ),
        joins=(
            ReportJoin("cases", "Cases", "JOIN cases c ON c.account = a.recordId"),
            ReportJoin("projects", "Projects", "JOIN projects p ON p.accountId = a.recordId"),
        ),
    ),
    "projects": ReportSource(
        key="projects",
        label="Projects",
        table="projects",
        alias="p",
        primary_field="p.recordId",
        fields=(
            _field("projects", "p", "recordId", "Project ID"),
            _field("projects", "p", "projectName", "Project Name"),
            _field("projects", "p", "accountId", "Project Account ID"),
            _field("projects", "p", "stage", "Project Stage"),
            _field("projects", "p", "sfdc", "SFDC"),
            _field("projects", "p", "sfdcValue", "SFDC Value"),
            _field("projects", "p", "se", "Project SE"),
            _field("projects", "p", "startDate", "Project Start", "date"),
            _field("projects", "p", "closeDate", "Project Close", "date"),
            _field("projects", "p", "createdAt", "Project Created", "date"),
            _field("projects", "p", "updatedAt", "Project Updated", "date"),
        ),
        joins=(
            ReportJoin("accounts", "Accounts", "JOIN accounts a ON p.accountId = a.recordId"),
            ReportJoin("cases", "Cases", "JOIN cases c ON c.project = p.recordId"),
        ),
    ),
    "products": ReportSource(
        key="products",
        label="Products",
        table="products",
        alias="prd",
        primary_field="prd.recordId",
        fields=(
            _field("products", "prd", "recordId", "Product ID"),
            _field("products", "prd", "productFamily", "Product Family"),
            _field("products", "prd", "productName", "Product Name"),
            _field("products", "prd", "productUrl", "Product URL"),
            _field("products", "prd", "createdAt", "Product Created", "date"),
            _field("products", "prd", "updatedAt", "Product Updated", "date"),
        ),
        joins=(ReportJoin("cases", "Cases", "JOIN cases c ON c.product = prd.recordId"),),
    ),
    "nfrs": ReportSource(
        key="nfrs",
        label="NFRs",
        table="nfrs",
        alias="n",
        primary_field="n.recordId",
        fields=(
            _field("nfrs", "n", "recordId", "NFR ID"),
            _field("nfrs", "n", "description", "NFR Description"),
            _field("nfrs", "n", "mantisId", "Mantis ID"),
            _field("nfrs", "n", "nfrStatus", "NFR Status"),
            _field("nfrs", "n", "nfrRequestDate", "NFR Request Date", "date"),
            _field("nfrs", "n", "nfrTargetDate", "NFR Target Date", "date"),
            _field("nfrs", "n", "createdAt", "NFR Created", "date"),
            _field("nfrs", "n", "updatedAt", "NFR Updated", "date"),
        ),
        joins=(ReportJoin("cases", "Cases", "JOIN cases c ON c.nfrRecordId = n.recordId"),),
    ),
    "knocks": ReportSource(
        key="knocks",
        label="Knocks",
        table="knocks",
        alias="k",
        primary_field="k.recordId",
        fields=(
            _field("knocks", "k", "recordId", "Knock Record ID"),
            _field("knocks", "k", "description", "Knock Description"),
            _field("knocks", "k", "knockId", "Knock ID"),
            _field("knocks", "k", "status", "Knock Status"),
            _field("knocks", "k", "requestDate", "Knock Request Date", "date"),
            _field("knocks", "k", "targetDate", "Knock Target Date", "date"),
            _field("knocks", "k", "createdAt", "Knock Created", "date"),
            _field("knocks", "k", "updatedAt", "Knock Updated", "date"),
        ),
        joins=(ReportJoin("cases", "Cases", "JOIN cases c ON c.knockRecordId = k.recordId"),),
    ),
}

FIELD_MAP: Dict[str, ReportField] = {
    field.key: field
    for source in SOURCE_DEFS.values()
    for field in source.fields
}

FILTER_OPERATORS = {
    "eq",
    "neq",
    "contains",
    "startsWith",
    "endsWith",
    "empty",
    "notEmpty",
    "gt",
    "gte",
    "lt",
    "lte",
}

JOIN_TYPES = {"left": "LEFT JOIN", "inner": "INNER JOIN"}


def build_report_schema() -> dict:
    """Return visual-builder metadata for the frontend."""
    return {
        "sources": [
            {
                "key": source.key,
                "label": source.label,
                "fields": [
                    {
                        "key": field.key,
                        "label": field.label,
                        "source": field.source,
                        "type": field.type,
                    }
                    for field in source.fields
                ],
                "joins": [
                    {
                        "source": join.source,
                        "label": join.label,
                        "defaultJoinType": "left",
                    }
                    for join in source.joins
                ],
            }
            for source in SOURCE_DEFS.values()
        ],
        "operators": [
            {"key": "eq", "label": "is"},
            {"key": "neq", "label": "is not"},
            {"key": "contains", "label": "contains"},
            {"key": "startsWith", "label": "starts with"},
            {"key": "endsWith", "label": "ends with"},
            {"key": "empty", "label": "is empty"},
            {"key": "notEmpty", "label": "is not empty"},
            {"key": "gt", "label": "greater than"},
            {"key": "gte", "label": "at least"},
            {"key": "lt", "label": "less than"},
            {"key": "lte", "label": "at most"},
        ],
    }


def build_legacy_query_spec(metric: str, filters: dict) -> dict:
    """Translate older saved report settings into the visual query model."""
    group_map = {
        "status": "cases.status",
        "priority": "cases.priority",
        "product": "products.productName",
        "owner": "cases.caseOwner",
        "category": "cases.category",
        "monthCreated": "cases.createdAt",
    }
    joins = [{"source": "products", "joinType": "left"}] if metric == "product" else []
    field = group_map.get(metric, "cases.status")

    rules = []
    for legacy_key, field_key in (
        ("owner", "cases.caseOwner"),
        ("status", "cases.status"),
        ("priority", "cases.priority"),
        ("category", "cases.category"),
        ("product", "cases.product"),
    ):
        value = filters.get(legacy_key)
        if value:
            rules.append({"field": field_key, "operator": "eq", "value": value})

    return {
        "base": "cases",
        "joins": joins,
        "mode": "aggregate",
        "fields": ["cases.recordId", field],
        "filters": rules,
        "groupBy": field,
        "metric": {"type": "count"},
        "limit": 50,
        "sortBy": "value",
        "sortDirection": "desc",
    }


def _get_source(source_key: str) -> ReportSource:
    source = SOURCE_DEFS.get(source_key)
    if not source:
        raise HTTPException(status_code=400, detail="Unsupported report source")
    return source


def _get_field(field_key: str) -> ReportField:
    field = FIELD_MAP.get(field_key)
    if not field:
        raise HTTPException(status_code=400, detail=f"Unsupported report field: {field_key}")
    return field


def _requested_joins(spec: ReportQuerySpec, required_sources: Iterable[str]) -> List[ReportJoinSpec]:
    join_map = {
        join.source: ReportJoinSpec(source=join.source, joinType=join.joinType)
        for join in spec.joins
    }
    for source in required_sources:
        if source != spec.base and source not in join_map:
            join_map[source] = ReportJoinSpec(source=source, joinType="left")
    return list(join_map.values())


def _build_join_sql(base: ReportSource, joins: List[ReportJoinSpec]) -> Tuple[List[str], Set[str]]:
    allowed = {join.source: join for join in base.joins}
    join_sql: List[str] = []
    active_sources = {base.key}

    for selected in joins:
        if selected.source == base.key:
            continue

        join = allowed.get(selected.source)
        if not join:
            raise HTTPException(status_code=400, detail=f"{selected.source} cannot be joined from {base.key}")

        join_type = JOIN_TYPES.get(selected.joinType)
        if not join_type:
            raise HTTPException(status_code=400, detail="Unsupported join type")

        join_sql.append(join.sql.replace("JOIN", join_type, 1))
        active_sources.add(selected.source)

    return join_sql, active_sources


def _validate_sources(fields: Iterable[ReportField], active_sources: Set[str]) -> None:
    for field in fields:
        if field.source not in active_sources:
            raise HTTPException(status_code=400, detail=f"{field.label} needs {field.source} joined first")


def _build_filter_sql(spec: ReportQuerySpec, active_sources: Set[str]) -> Tuple[List[str], List[Any]]:
    where_parts: List[str] = []
    params: List[Any] = []

    for rule in spec.filters:
        field = _get_field(rule.field)
        _validate_sources([field], active_sources)

        operator = rule.operator
        if operator not in FILTER_OPERATORS:
            raise HTTPException(status_code=400, detail="Unsupported filter operator")

        if operator == "empty":
            where_parts.append(f"({field.expression} IS NULL OR TRIM(CAST({field.expression} AS CHAR)) = '')")
            continue
        if operator == "notEmpty":
            where_parts.append(f"({field.expression} IS NOT NULL AND TRIM(CAST({field.expression} AS CHAR)) <> '')")
            continue

        value = rule.value or ""
        if operator == "eq":
            where_parts.append(f"{field.expression} = %s")
            params.append(value)
        elif operator == "neq":
            where_parts.append(f"({field.expression} IS NULL OR {field.expression} <> %s)")
            params.append(value)
        elif operator == "contains":
            where_parts.append(f"{field.expression} LIKE %s")
            params.append(f"%{value}%")
        elif operator == "startsWith":
            where_parts.append(f"{field.expression} LIKE %s")
            params.append(f"{value}%")
        elif operator == "endsWith":
            where_parts.append(f"{field.expression} LIKE %s")
            params.append(f"%{value}")
        elif operator == "gt":
            where_parts.append(f"{field.expression} > %s")
            params.append(value)
        elif operator == "gte":
            where_parts.append(f"{field.expression} >= %s")
            params.append(value)
        elif operator == "lt":
            where_parts.append(f"{field.expression} < %s")
            params.append(value)
        elif operator == "lte":
            where_parts.append(f"{field.expression} <= %s")
            params.append(value)

    return where_parts, params


def _apply_case_visibility(where_parts: List[str], params: List[Any], active_sources: Set[str], actor: Optional[dict]) -> None:
    if not actor or actor.get("role") == "admin" or "cases" not in active_sources:
        return

    where_parts.append(
        "(c.seOwner = %s OR c.caseOwner = %s OR c.ownedBy = %s OR c.createdBy = %s OR c.updatedBy = %s)"
    )
    params.extend([actor["displayName"]] * 5)


def _limit(value: int) -> int:
    return min(max(value or 100, 1), 500)


async def execute_report_query(spec: ReportQuerySpec, actor: Optional[dict] = None) -> ReportRunResult:
    """Compile a visual query spec into safe SQL and execute it."""
    base = _get_source(spec.base)
    mode = spec.mode if spec.mode in {"aggregate", "table"} else "aggregate"

    selected_fields = [_get_field(field_key) for field_key in spec.fields]
    group_field = _get_field(spec.groupBy or "cases.status") if mode == "aggregate" else None
    filter_fields = [_get_field(rule.field) for rule in spec.filters]
    required_sources = {field.source for field in selected_fields + filter_fields}
    if group_field:
        required_sources.add(group_field.source)

    joins = _requested_joins(spec, required_sources)
    join_sql, active_sources = _build_join_sql(base, joins)

    _validate_sources(selected_fields, active_sources)
    if group_field:
        _validate_sources([group_field], active_sources)

    where_parts, params = _build_filter_sql(spec, active_sources)
    _apply_case_visibility(where_parts, params, active_sources, actor)
    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    joins_clause = "\n".join(join_sql)
    limit = _limit(spec.limit)

    if mode == "table":
        fields = selected_fields or [base.fields[0]]
        _validate_sources(fields, active_sources)
        columns = [{"key": field.key, "label": field.label, "type": field.type} for field in fields]
        select_clause = ", ".join(f"{field.expression} AS `{field.key}`" for field in fields)

        sort_field = FIELD_MAP.get(spec.sortBy or "")
        order_clause = ""
        if sort_field and sort_field.source in active_sources:
            direction = "ASC" if spec.sortDirection == "asc" else "DESC"
            order_clause = f"ORDER BY {sort_field.expression} {direction}"

        rows = await execute_query(
            f"""
            SELECT {select_clause}
            FROM {base.table} {base.alias}
            {joins_clause}
            {where_clause}
            {order_clause}
            LIMIT %s
            """,
            [*params, limit],
        )
        return ReportRunResult(mode="table", columns=columns, rows=rows)

    if not group_field:
        raise HTTPException(status_code=400, detail="Group by is required for summary reports")

    direction = "ASC" if spec.sortDirection == "asc" else "DESC"
    order_clause = "ORDER BY value DESC"
    if spec.sortBy == "label":
        order_clause = f"ORDER BY label {direction}"
    elif spec.sortBy == "value":
        order_clause = f"ORDER BY value {direction}"

    rows = await execute_query(
        f"""
        SELECT
          COALESCE(NULLIF(CAST({group_field.expression} AS CHAR), ''), 'Unassigned') AS label,
          COUNT(DISTINCT {base.primary_field}) AS value
        FROM {base.table} {base.alias}
        {joins_clause}
        {where_clause}
        GROUP BY COALESCE(NULLIF(CAST({group_field.expression} AS CHAR), ''), 'Unassigned')
        {order_clause}
        LIMIT %s
        """,
        [*params, limit],
    )
    return ReportRunResult(
        mode="aggregate",
        columns=[
            {"key": "label", "label": group_field.label, "type": "text"},
            {"key": "value", "label": "Count", "type": "number"},
        ],
        rows=rows,
    )
