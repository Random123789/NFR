const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const AUTH_TOKEN_KEY = 'nfr_auth_token';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
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
  isActive: number;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  password: string;
}

export interface UpdateManagedUserRoleRequest {
  role: 'admin' | 'user';
}

export interface BookmarkedItem {
  id: string;
  type: 'case' | 'project' | 'account' | 'nfr' | 'knock' | 'product';
  title: string;
  subtitle?: string;
  timestamp: number;
}

// Types matching the backend
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

export type CaseLinkEntityType = 'account' | 'product' | 'project' | 'nfr' | 'knock';

export interface CaseLinksResponse {
  accounts: AccountRecord[];
  products: ProductRecord[];
  projects: ProjectRecord[];
  nfrs: NfrRecord[];
  knocks: KnockRecord[];
}

export interface ReportSummary {
  totalCases: number;
  openCases: number;
  escalatedCases: number;
  closedCases: number;
}

export interface ReportValue {
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

export interface CustomReportInput {
  title: string;
  chartType: 'bar' | 'line' | 'pie' | 'table';
  metric: 'status' | 'priority' | 'product' | 'owner' | 'category' | 'monthCreated';
  layoutSpan: 1 | 2;
  sortOrder: number;
  filters: ReportFilters;
}

export interface CustomReportRecord extends CustomReportInput {
  id: number;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Initialize data with fallback to empty arrays
export let accounts: AccountRecord[] = [];
export let products: ProductRecord[] = [];
export let projects: ProjectRecord[] = [];
export let nfrs: NfrRecord[] = [];
export let knocks: KnockRecord[] = [];
export let cases: CaseRecord[] = [];

// Load all data from backend on startup
export async function initializeData() {
  try {
    const [accountsData, productsData, projectsData, nfrsData, knocksData, casesData] = await Promise.all([
      fetchJson<AccountRecord[]>(`${API_BASE}/accounts`),
      fetchJson<ProductRecord[]>(`${API_BASE}/products`),
      fetchJson<ProjectRecord[]>(`${API_BASE}/projects`),
      fetchJson<NfrRecord[]>(`${API_BASE}/nfrs`),
      fetchJson<KnockRecord[]>(`${API_BASE}/knocks`),
      fetchJson<CaseRecord[]>(`${API_BASE}/cases`),
    ]);

    accounts = accountsData;
    products = productsData;
    projects = projectsData;
    nfrs = nfrsData;
    knocks = knocksData;
    cases = casesData;

    console.log('Data initialized from backend');
  } catch (error) {
    console.error('Failed to initialize data from backend:', error);
  }
}

// Helper to fetch JSON
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options?.headers || {});

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredAuth();
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const payload = await response.clone().json() as { detail?: string; message?: string; error?: string };
      message = payload.detail || payload.message || payload.error || message;
    } catch {
      try {
        const textPayload = await response.text();
        if (textPayload?.trim()) {
          message = textPayload;
        }
      } catch {
        // Keep default message when response body cannot be read.
      }
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function login(email: string, password: string) {
  return fetchJson<AuthResponse>(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser() {
  const response = await fetchJson<{ user: AuthUser }>(`${API_BASE}/auth/me`);
  return response.user;
}

export async function logout() {
  return fetchJson<{ success: boolean }>(`${API_BASE}/auth/logout`, {
    method: 'POST',
  });
}

export async function updateCurrentUser(data: UpdateProfileRequest) {
  return fetchJson<{ user: AuthUser }>(`${API_BASE}/auth/me`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCurrentUser() {
  return fetchJson<{ success: boolean }>(`${API_BASE}/auth/me`, {
    method: 'DELETE',
  });
}

export async function updateCurrentUserProfile(data: UpdateProfileRequest) {
  return fetchJson<{ user: AuthUser }>(`${API_BASE}/auth/me`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function listManagedUsers() {
  return fetchJson<ManagedUser[]>(`${API_BASE}/auth/users`);
}

export async function createManagedUser(data: CreateUserRequest) {
  return fetchJson<{ user: ManagedUser }>(`${API_BASE}/auth/users`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateManagedUserRole(userId: number, data: UpdateManagedUserRoleRequest) {
  return fetchJson<{ user: ManagedUser }>(`${API_BASE}/auth/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getUserBookmarks() {
  return fetchJson<BookmarkedItem[]>(`${API_BASE}/bookmarks`);
}

export async function addUserBookmark(item: BookmarkedItem) {
  return fetchJson<{ success: boolean }>(`${API_BASE}/bookmarks`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function removeUserBookmark(id: string, type: string) {
  return fetchJson<void>(`${API_BASE}/bookmarks/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Getter functions that match mockData.ts interface
export const getAccountById = (id: string | null) => {
  if (!id) return undefined;
  return accounts.find(a => a.recordId === id);
};

export const getProductById = (id: string | null) => {
  if (!id) return undefined;
  return products.find(p => p.recordId === id);
};

export const getProjectById = (id: string | null) => {
  if (!id) return undefined;
  return projects.find(p => p.recordId === id);
};

export const getNfrById = (id: string | null) => {
  if (!id) return undefined;
  return nfrs.find(n => n.recordId === id);
};

export const getNfrByMantisId = (mantisId: string | null) => {
  if (!mantisId) return undefined;
  return nfrs.find(n => n.mantisId === mantisId);
};

export const getKnockById = (id: string | null) => {
  if (!id) return undefined;
  return knocks.find(k => k.recordId === id);
};

export const getKnockByKnockId = (knockId: string | null) => {
  if (!knockId) return undefined;
  return knocks.find(k => k.knockId === knockId);
};

export const getCaseById = (id: string | null) => {
  if (!id) return undefined;
  return cases.find(c => c.recordId === id);
};

export const getCasesByAccountId = (accountId: string) => {
  return cases.filter(c => c.account === accountId);
};

export const getCasesByProductId = (productId: string) => {
  return cases.filter(c => c.product === productId);
};

export const getCasesByProjectId = (projectId: string) => {
  return cases.filter(c => c.project === projectId);
};

export const getCasesByMantisId = (mantisId: string) => {
  return cases.filter(c => c.mantisId === mantisId);
};

export const getCasesByKnockId = (knockId: string) => {
  return cases.filter(c => c.knockId === knockId);
};

export const getCasesByNfrId = (nfrId: string) => {
  return cases.filter(c => {
    const nfr = getNfrById(nfrId);
    return nfr && c.mantisId === nfr.mantisId;
  });
};

export const getProjectsByAccountId = (accountId: string) => {
  return projects.filter(p => p.accountId === accountId);
};

// API mutation methods
export async function createAccount(data: Omit<AccountRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<AccountRecord>(`${API_BASE}/accounts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAccount(id: string, data: Partial<AccountRecord>) {
  return fetchJson<AccountRecord>(`${API_BASE}/accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(id: string) {
  await fetchJson<void>(`${API_BASE}/accounts/${id}`, { method: 'DELETE' });
}

export async function addAccountHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<AccountRecord>(`${API_BASE}/accounts/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

// Similar methods for other entities
export async function createCase(data: Omit<CaseRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<CaseRecord>(`${API_BASE}/cases`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCase(id: string, data: Partial<CaseRecord>) {
  return fetchJson<CaseRecord>(`${API_BASE}/cases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addCaseHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<CaseRecord>(`${API_BASE}/cases/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function getCase(id: string) {
  return fetchJson<CaseRecord>(`${API_BASE}/cases/${id}`);
}

export async function getCaseLinks(id: string) {
  return fetchJson<CaseLinksResponse>(`${API_BASE}/cases/${id}/links`);
}

export async function getLinkedCasesByEntity(entityType: CaseLinkEntityType, entityRecordId: string) {
  const query = new URLSearchParams({ entityType, entityRecordId });
  return fetchJson<CaseRecord[]>(`${API_BASE}/cases/linked?${query.toString()}`);
}

export async function addCaseLink(id: string, entityType: CaseLinkEntityType, entityRecordId: string) {
  return fetchJson<CaseLinksResponse>(`${API_BASE}/cases/${id}/links`, {
    method: 'POST',
    body: JSON.stringify({ entityType, entityRecordId }),
  });
}

export async function removeCaseLink(id: string, entityType: CaseLinkEntityType, entityRecordId: string) {
  return fetchJson<CaseLinksResponse>(`${API_BASE}/cases/${id}/links/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRecordId)}`, {
    method: 'DELETE',
  });
}

export async function createProject(data: Omit<ProjectRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<ProjectRecord>(`${API_BASE}/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<ProjectRecord>) {
  return fetchJson<ProjectRecord>(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addProjectHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<ProjectRecord>(`${API_BASE}/projects/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function createProduct(data: Omit<ProductRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<ProductRecord>(`${API_BASE}/products`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(id: string, data: Partial<ProductRecord>) {
  return fetchJson<ProductRecord>(`${API_BASE}/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addProductHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<ProductRecord>(`${API_BASE}/products/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function createNfr(data: Omit<NfrRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<NfrRecord>(`${API_BASE}/nfrs`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNfr(id: string, data: Partial<NfrRecord>) {
  return fetchJson<NfrRecord>(`${API_BASE}/nfrs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addNfrHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<NfrRecord>(`${API_BASE}/nfrs/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function createKnock(data: Omit<KnockRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<KnockRecord>(`${API_BASE}/knocks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateKnock(id: string, data: Partial<KnockRecord>) {
  return fetchJson<KnockRecord>(`${API_BASE}/knocks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addKnockHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<KnockRecord>(`${API_BASE}/knocks/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

function withRange(endpoint: string, range?: string) {
  if (!range) return endpoint;
  return `${endpoint}?range=${encodeURIComponent(range)}`;
}

export async function getReportSummary(range?: string) {
  return fetchJson<ReportSummary>(withRange(`${API_BASE}/reports/summary`, range));
}

export async function getCasesByStatusReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange(`${API_BASE}/reports/cases-by-status`, range));
}

export async function getCasesByPriorityReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange(`${API_BASE}/reports/cases-by-priority`, range));
}

export async function getCasesByProductReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange(`${API_BASE}/reports/cases-by-product`, range));
}

export async function getCasesOverTimeReport(range?: string) {
  return fetchJson<ReportTimelineValue[]>(withRange(`${API_BASE}/reports/cases-over-time`, range));
}

export async function getCustomReports() {
  return fetchJson<CustomReportRecord[]>(`${API_BASE}/reports/custom`);
}

export async function createCustomReport(data: CustomReportInput) {
  return fetchJson<CustomReportRecord>(`${API_BASE}/reports/custom`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomReport(id: number, data: CustomReportInput) {
  return fetchJson<CustomReportRecord>(`${API_BASE}/reports/custom/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomReport(id: number) {
  return fetchJson<{ status: string; id: number }>(`${API_BASE}/reports/custom/${id}`, {
    method: 'DELETE',
  });
}
