"""Pydantic models for all domain entities."""

from typing import Any, Dict, Optional, List, Literal
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


AccountType = Literal["Customer", "Distributor", "Reseller"]
AccountVertical = Literal["Channel", "Commercial", "Enterprise", "Government", "FSI", "Telco"]


class AccountRecord(BaseRecord):
    """Account entity."""
    accountName: str
    website: Optional[str] = None
    type: Optional[AccountType] = None
    vertical: Optional[AccountVertical] = None


class ProductRecord(BaseRecord):
    """Product entity."""
    productFamily: Optional[str] = None
    productName: str
    productVersion: Optional[str] = None
    productUrl: Optional[str] = None
    description: Optional[str] = None


ProjectStage = Literal[
    "Technical Qualification",
    "Tender - RFP/RFI/RFQ",
    "Technical Validation",
    "Technical Lost",
    "Technical Won",
]


class ProjectRecord(BaseRecord):
    """Project entity."""
    projectName: str
    accountId: Optional[str] = None
    startDate: Optional[str] = None
    closeDate: Optional[str] = None
    seOwner: Optional[str] = None
    isClosed: bool = False
    stage: Optional[ProjectStage] = None
    sfdc: Optional[str] = None
    sfdcValue: Optional[int] = None


class MantisRecord(BaseRecord):
    """Mantis entity."""
    description: str
    mantisId: Optional[str] = None
    mantisUrl: Optional[str] = None
    category: Optional[str] = None
    mantisStatus: Optional[str] = None
    mantisRequestDate: Optional[str] = None
    mantisTargetDate: Optional[str] = None


class KnockRecord(BaseRecord):
    """Feature request entity."""
    description: str
    knockId: Optional[str] = None
    knockUrl: Optional[str] = None
    status: Optional[str] = None
    requestDate: Optional[str] = None
    targetDate: Optional[str] = None


CaseCategory = Literal["Pre-Sales", "Post-Sales", "Bug", "NFR", "Others"]
CaseEscalationType = Literal["Escalation", "Monitoring", "Re-Escalation", "Drop", "Others"]
CasePriority = Literal["Low", "Medium", "High"]
CaseStatus = Literal["New", "Acknowledged", "Escalated", "Monitoring", "Closed-Resolved", "Closed-Dead"]


class CaseRecord(BaseModel):
    """Case/opportunity entity."""
    recordId: str
    createdAt: str
    project: Optional[str] = None
    category: Optional[CaseCategory] = None
    escalationType: Optional[CaseEscalationType] = None
    escalationNote: Optional[str] = None
    description: str
    seOwner: Optional[str] = None
    assignedTo: Optional[str] = None
    priority: Optional[CasePriority] = None
    status: Optional[CaseStatus] = None
    accountIds: List[str] = Field(default_factory=list)
    productIds: List[str] = Field(default_factory=list)
    mantisRecordIds: List[str] = Field(default_factory=list)
    knockRecordIds: List[str] = Field(default_factory=list)
    watcherNames: List[str] = Field(default_factory=list)
    history: List[HistoryEntry] = Field(default_factory=list)


class ReportFilters(BaseModel):
    """Saved report filter configuration."""
    dateRange: str = "last-30-days"
    owner: str = ""
    status: str = ""
    priority: str = ""
    category: str = ""
    product: str = ""


class ReportJoinSpec(BaseModel):
    """One whitelisted join selected by the visual report builder."""
    source: str
    joinType: str = "left"


class ReportFilterRule(BaseModel):
    """One filter selected by the visual report builder."""
    field: str
    operator: str = "eq"
    value: Optional[str] = None


class ReportMetricSpec(BaseModel):
    """Aggregate metric selected by the visual report builder."""
    type: str = "count"
    field: Optional[str] = None


class ReportQuerySpec(BaseModel):
    """Safe, serializable report-builder definition."""
    base: str = "cases"
    joins: List[ReportJoinSpec] = Field(default_factory=list)
    mode: str = "aggregate"
    fields: List[str] = Field(default_factory=list)
    filters: List[ReportFilterRule] = Field(default_factory=list)
    groupBy: Optional[str] = "cases.status"
    metric: ReportMetricSpec = Field(default_factory=ReportMetricSpec)
    limit: int = 100
    sortBy: Optional[str] = None
    sortDirection: str = "desc"


class ReportResultColumn(BaseModel):
    """Column returned by a report run."""
    key: str
    label: str
    type: str = "text"


class ReportRunResult(BaseModel):
    """Chart/table-ready report result."""
    mode: str
    columns: List[ReportResultColumn] = Field(default_factory=list)
    rows: List[Dict[str, Any]] = Field(default_factory=list)


class CustomReportCreate(BaseModel):
    """Create or update a custom report configuration."""
    title: str
    chartType: str
    metric: str
    layoutSpan: int = 1
    sortOrder: int = 0
    filters: ReportFilters = Field(default_factory=ReportFilters)
    querySpec: Optional[ReportQuerySpec] = None


class CustomReportRecord(CustomReportCreate):
    """Persisted custom report configuration."""
    id: int
    userId: int
    createdAt: str
    updatedAt: str


# Create request models (without timestamp/user fields)
class AccountCreate(BaseModel):
    accountName: str
    website: Optional[str] = None
    type: Optional[AccountType] = None
    vertical: Optional[AccountVertical] = None
    metaData: Optional[str] = None


class ProductCreate(BaseModel):
    productFamily: Optional[str] = None
    productName: str
    productVersion: Optional[str] = None
    productUrl: Optional[str] = None
    description: Optional[str] = None
    metaData: Optional[str] = None
    ownedBy: Optional[str] = None


class ProjectCreate(BaseModel):
    projectName: str
    accountId: Optional[str] = None
    startDate: Optional[str] = None
    closeDate: Optional[str] = None
    seOwner: Optional[str] = None
    isClosed: bool = False
    stage: Optional[ProjectStage] = None
    sfdc: Optional[str] = None
    sfdcValue: Optional[int] = None
    metaData: Optional[str] = None
    ownedBy: Optional[str] = None


class MantisCreate(BaseModel):
    description: str
    mantisId: Optional[str] = None
    mantisUrl: Optional[str] = None
    category: Optional[str] = None
    mantisStatus: Optional[str] = None
    mantisRequestDate: Optional[str] = None
    mantisTargetDate: Optional[str] = None
    metaData: Optional[str] = None
    ownedBy: Optional[str] = None


class KnockCreate(BaseModel):
    description: str
    knockId: Optional[str] = None
    knockUrl: Optional[str] = None
    status: Optional[str] = None
    requestDate: Optional[str] = None
    targetDate: Optional[str] = None
    metaData: Optional[str] = None
    ownedBy: Optional[str] = None


class CaseCreate(BaseModel):
    accountIds: Optional[List[str]] = None
    project: Optional[str] = None
    category: Optional[CaseCategory] = None
    escalationType: Optional[CaseEscalationType] = None
    escalationNote: Optional[str] = None
    productIds: Optional[List[str]] = None
    description: str
    seOwner: Optional[str] = None
    assignedTo: Optional[str] = None
    priority: Optional[CasePriority] = None
    status: Optional[CaseStatus] = None
    knockRecordIds: Optional[List[str]] = None
    mantisRecordIds: Optional[List[str]] = None


class HistoryEntryCreate(BaseModel):
    """Request model for adding history entry."""
    action: str
    changes: str
    user: Optional[str] = "System"
    field: Optional[str] = None
    previousValue: Optional[str] = None
    newValue: Optional[str] = None
