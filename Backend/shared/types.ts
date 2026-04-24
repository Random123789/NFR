export interface HistoryEntry {
  timestamp: string;
  user: string;
  action: string;
  changes: string;
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
  history?: HistoryEntry[];
}

export interface AccountRecord extends BaseRecord {
  accountName: string;
  website: string | null;
  type: string | null;
  vertical: string | null;
}

export interface ProductRecord extends BaseRecord {
  productFamily: string | null;
  productName: string;
  productUrl: string | null;
}

export interface ProjectRecord extends BaseRecord {
  projectName: string;
  accountId: string | null;
  startDate: string | null;
  closeDate: string | null;
  stage: string | null;
  sfdc: string | null;
  sfdcValue: string | null;
  se: string | null;
}

export interface NfrRecord extends BaseRecord {
  description: string;
  mantisId: string | null;
  mantisUrl: string | null;
  nfrStatus: string | null;
  nfrRequestDate: string | null;
  nfrTargetDate: string | null;
}

export interface KnockRecord extends BaseRecord {
  description: string;
  knockId: string | null;
  knockUrl: string | null;
  status: string | null;
  requestDate: string | null;
  targetDate: string | null;
}

export interface CaseRecord extends BaseRecord {
  description: string;
  previousStatus: string | null;
  closeDate: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  caseOwner: string | null;
  product: string | null;
  account: string | null;
  project: string | null;
  knockId: string | null;
  mantisId: string | null;
  escalationNote: string | null;
  escalationType: string | null;
  seOwner: string | null;
}

export interface ReportValue {
  label: string;
  value: number;
}

export interface ReportSummary {
  totalCases: number;
  openCases: number;
  escalatedCases: number;
  closedCases: number;
}
