"""Pydantic models for all domain entities."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class HistoryEntry(BaseModel):
    """Audit trail entry."""
    timestamp: str
    user: str
    action: str
    changes: str
    field: Optional[str] = None
    previousValue: Optional[str] = None
    newValue: Optional[str] = None


class BaseRecord(BaseModel):
    """Base record with common fields."""
    recordId: str
    moduleId: str
    recordRevision: str
    metaData: Optional[str] = None
    ownedBy: Optional[str] = None
    createdAt: str
    createdBy: Optional[str] = None
    updatedAt: str
    updatedBy: Optional[str] = None
    history: List[HistoryEntry] = Field(default_factory=list)


class AccountRecord(BaseRecord):
    """Account entity."""
    accountName: str
    website: Optional[str] = None
    type: Optional[str] = None
    vertical: Optional[str] = None


class ProductRecord(BaseRecord):
    """Product entity."""
    productFamily: Optional[str] = None
    productName: str
    productUrl: Optional[str] = None


class ProjectRecord(BaseRecord):
    """Project entity."""
    projectName: str
    accountId: Optional[str] = None
    startDate: Optional[str] = None
    closeDate: Optional[str] = None
    stage: Optional[str] = None
    sfdc: Optional[str] = None
    sfdcValue: Optional[str] = None
    se: Optional[str] = None


class NfrRecord(BaseRecord):
    """Non-functional requirement entity."""
    description: str
    mantisId: Optional[str] = None
    mantisUrl: Optional[str] = None
    nfrStatus: Optional[str] = None
    nfrRequestDate: Optional[str] = None
    nfrTargetDate: Optional[str] = None


class KnockRecord(BaseRecord):
    """Feature request entity."""
    description: str
    knockId: Optional[str] = None
    knockUrl: Optional[str] = None
    status: Optional[str] = None
    requestDate: Optional[str] = None
    targetDate: Optional[str] = None


class CaseRecord(BaseRecord):
    """Case/opportunity entity."""
    description: str
    previousStatus: Optional[str] = None
    closeDate: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    caseOwner: Optional[str] = None
    product: Optional[str] = None
    account: Optional[str] = None
    project: Optional[str] = None
    knockId: Optional[str] = None
    mantisId: Optional[str] = None
    escalationNote: Optional[str] = None
    escalationType: Optional[str] = None
    seOwner: Optional[str] = None


class ReportValue(BaseModel):
    """Report data point."""
    id: str
    label: str
    value: int


class ReportSummary(BaseModel):
    """Report summary statistics."""
    totalCases: int = 0
    openCases: int = 0
    inProgressCases: int = 0
    escalatedCases: int = 0
    closedCases: int = 0
    highPriorityCases: int = 0
    totalAccounts: int = 0
    totalProjects: int = 0


class ReportFilters(BaseModel):
    """Saved report filter configuration."""
    dateRange: str = "last-30-days"
    owner: str = ""
    status: str = ""
    priority: str = ""
    category: str = ""
    product: str = ""


class CustomReportCreate(BaseModel):
    """Create or update a custom report configuration."""
    title: str
    chartType: str
    metric: str
    layoutSpan: int = 1
    sortOrder: int = 0
    filters: ReportFilters = Field(default_factory=ReportFilters)


class CustomReportRecord(CustomReportCreate):
    """Persisted custom report configuration."""
    id: int
    userId: int
    createdAt: datetime
    updatedAt: datetime


# Create request models (without timestamp/user fields)
class AccountCreate(BaseModel):
    accountName: str
    website: Optional[str] = None
    type: Optional[str] = None
    vertical: Optional[str] = None
    metaData: Optional[str] = None


class CaseCreate(BaseModel):
    description: str
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    caseOwner: Optional[str] = None
    product: Optional[str] = None
    account: Optional[str] = None
    project: Optional[str] = None
    knockId: Optional[str] = None
    mantisId: Optional[str] = None
    metaData: Optional[str] = None


class HistoryEntryCreate(BaseModel):
    """Request model for adding history entry."""
    action: str
    changes: str
    user: Optional[str] = "System"
    field: Optional[str] = None
    previousValue: Optional[str] = None
    newValue: Optional[str] = None
