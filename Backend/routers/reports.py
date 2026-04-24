"""Reports aggregation endpoint router."""

from fastapi import APIRouter
from typing import List
from database import execute_query
from schemas import ReportValue, ReportSummary

router = APIRouter(prefix="/reports", tags=["reports"])


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
            name=row.get("name", "Unknown"),
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
            name=row.get("name", "Unknown"),
            value=row.get("value", 0)
        ))
    return report


@router.get("/cases-by-product", response_model=List[ReportValue])
async def get_cases_by_product() -> List[ReportValue]:
    """Get case count breakdown by product."""
    
    sql = """
        SELECT c.product, p.productName as name, COUNT(*) as value
        FROM cases c
        LEFT JOIN products p ON c.product = p.recordId
        WHERE c.product IS NOT NULL
        GROUP BY c.product
    """
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"product-{idx}",
            name=row.get("name", "Unknown"),
            value=row.get("value", 0)
        ))
    return report


@router.get("/cases-over-time", response_model=List[ReportValue])
async def get_cases_over_time() -> List[ReportValue]:
    """Get case creation trend over time."""
    
    sql = """
        SELECT DATE(createdAt) as date, COUNT(*) as value
        FROM cases
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
        LIMIT 30
    """
    results = await execute_query(sql)
    
    report = []
    for idx, row in enumerate(results):
        report.append(ReportValue(
            id=f"date-{idx}",
            name=str(row.get("date", "Unknown")),
            value=row.get("value", 0)
        ))
    return report
