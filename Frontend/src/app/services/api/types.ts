export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  vertical?: AccountVertical | null;
}

export interface AssignableUser extends AuthUser {
  isActive: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface ManagedUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  vertical?: AccountVertical | null;
  isActive: number;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'user';
  vertical?: AccountVertical | null;
  password: string;
}

export interface UpdateManagedUserRoleRequest {
  role: 'admin' | 'manager' | 'user';
  vertical?: AccountVertical | null;
}

export interface UpdateManagedUserPasswordRequest {
  password: string;
}

export interface BookmarkedItem {
  id: string;
  type: 'case' | 'project' | 'account' | 'mantis' | 'knock' | 'product';
  title: string;
  subtitle?: string;
  timestamp: number;
}

export interface HistoryEntry {
  timestamp: string;
  user: string;
  action: string;
  changes: string;
  field?: string;
  previousValue?: string | null;
  newValue?: string | null;
}

export interface BaseRecord {
  recordId: string;
  moduleId: string;
  recordRevision: string;
  metaData: string | null;
  ownedBy: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  history: HistoryEntry[];
}

export type AccountType = 'Customer' | 'Distributor' | 'Reseller';
export type AccountVertical = 'Channel' | 'Commercial' | 'Enterprise' | 'Government' | 'FSI' | 'Telco';

export interface AccountRecord extends BaseRecord {
  accountName: string;
  website: string | null;
  type: AccountType | null;
  vertical: AccountVertical | null;
}

export interface ProductRecord extends BaseRecord {
  productFamily: string | null;
  productName: string;
  productUrl: string | null;
  description: string | null;
}

export type ProjectStage =
  | 'Technical Qualification'
  | 'Tender - RFP/RFI/RFQ'
  | 'Technical Validation'
  | 'Technical Lost'
  | 'Technical Won';

export interface ProjectRecord extends BaseRecord {
  projectName: string;
  accountId: string | null;
  startDate: string | null;
  closeDate: string | null;
  seOwner: string | null;
  isClosed: boolean;
  stage: ProjectStage | null;
  sfdc: string | null;
  sfdcValue: number | null;
}

export interface MantisRecord extends BaseRecord {
  description: string;
  mantisId: string | null;
  mantisUrl: string | null;
  category: string | null;
  mantisStatus: string | null;
  mantisRequestDate: string | null;
  mantisTargetDate: string | null;
}

export interface KnockRecord extends BaseRecord {
  description: string;
  knockId: string | null;
  knockUrl: string | null;
  status: string | null;
  requestDate: string | null;
  targetDate: string | null;
}

export interface CaseRecord {
  recordId: string;
  account: string | null;
  project: string | null;
  category: CaseCategory | null;
  escalationType: CaseEscalationType | null;
  escalationNote: string | null;
  product: string | null;
  closeDate: string | null;
  description: string;
  seOwner: string | null;
  assignedTo: string | null;
  priority: CasePriority | null;
  status: CaseStatus | null;
  knockId: string | null;
  mantisId: string | null;
  history: HistoryEntry[];
}

export type CaseCategory = 'Pre-Sales' | 'Post-Sales' | 'Bug' | 'NFR' | 'Others';
export type CaseEscalationType = 'Escalation' | 'Monitoring' | 'Re-Escalation' | 'Drop' | 'Others';
export type CasePriority = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
export type CaseStatus = 'New' | 'Acknowledged' | 'Escalated' | 'Monitoring' | 'Closed-Resolved' | 'Closed-Dead';

export type CaseLinkEntityType = 'account' | 'product' | 'project' | 'mantis' | 'knock';

export interface CaseLinksResponse {
  accounts: AccountRecord[];
  products: ProductRecord[];
  projects: ProjectRecord[];
  mantis: MantisRecord[];
  knocks: KnockRecord[];
}

export interface ReportSummary {
  totalCases: number;
  openCases: number;
  inProgressCases?: number;
  escalatedCases: number;
  closedCases: number;
  highPriorityCases?: number;
  totalAccounts?: number;
  totalProjects?: number;
}

export interface ReportValue {
  id?: string;
  label: string;
  value: number;
}

export interface ReportTimelineValue {
  monthLabel: string;
  created: number;
  closed: number;
}

export interface ReportFilters {
  dateRange: string;
  owner: string;
  status: string;
  priority: string;
  category: string;
  product: string;
}

export type ReportChartType = 'bar' | 'line' | 'pie' | 'table';
export type ReportQueryMode = 'aggregate' | 'table';
export type ReportJoinType = 'left' | 'inner';
export type ReportSortDirection = 'asc' | 'desc';

export interface ReportJoinSpec {
  source: string;
  joinType: ReportJoinType;
}

export interface ReportFilterRule {
  field: string;
  operator: string;
  value?: string;
}

export interface ReportMetricSpec {
  type: 'count';
  field?: string;
}

export interface ReportQuerySpec {
  base: string;
  joins: ReportJoinSpec[];
  mode: ReportQueryMode;
  fields: string[];
  filters: ReportFilterRule[];
  groupBy?: string | null;
  metric: ReportMetricSpec;
  limit: number;
  sortBy?: string | null;
  sortDirection: ReportSortDirection;
}

export interface ReportBuilderFieldOption {
  key: string;
  label: string;
  source: string;
  type: string;
}

export interface ReportBuilderJoinOption {
  source: string;
  label: string;
  defaultJoinType: ReportJoinType;
}

export interface ReportBuilderSource {
  key: string;
  label: string;
  fields: ReportBuilderFieldOption[];
  joins: ReportBuilderJoinOption[];
}

export interface ReportBuilderOperator {
  key: string;
  label: string;
}

export interface ReportBuilderSchema {
  sources: ReportBuilderSource[];
  operators: ReportBuilderOperator[];
}

export interface ReportResultColumn {
  key: string;
  label: string;
  type: string;
}

export interface ReportRunResult {
  mode: ReportQueryMode;
  columns: ReportResultColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface CustomReportInput {
  title: string;
  chartType: ReportChartType;
  metric: string;
  layoutSpan: 1 | 2;
  sortOrder: number;
  filters: ReportFilters;
  querySpec?: ReportQuerySpec;
}

export interface CustomReportRecord extends CustomReportInput {
  id: number;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  entityType?: 'project' | 'case' | 'account' | 'mantis' | 'knock' | 'product';
  entityId?: string;
}
