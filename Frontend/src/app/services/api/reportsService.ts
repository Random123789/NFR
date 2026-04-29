import { fetchJson } from './http';
import type {
  CustomReportInput,
  CustomReportRecord,
  ReportBuilderSchema,
  ReportQuerySpec,
  ReportRunResult,
  ReportSummary,
  ReportTimelineValue,
  ReportValue,
} from './types';

function withRange(endpoint: string, range?: string) {
  if (!range) return endpoint;
  return `${endpoint}?range=${encodeURIComponent(range)}`;
}

export async function getReportSummary(range?: string) {
  return fetchJson<ReportSummary>(withRange('/reports/summary', range));
}

export async function getCasesByStatusReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange('/reports/cases-by-status', range));
}

export async function getCasesByPriorityReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange('/reports/cases-by-priority', range));
}

export async function getCasesByProductReport(range?: string) {
  return fetchJson<ReportValue[]>(withRange('/reports/cases-by-product', range));
}

export async function getCasesOverTimeReport(range?: string) {
  return fetchJson<ReportTimelineValue[]>(withRange('/reports/cases-over-time', range));
}

export async function getCustomReports() {
  return fetchJson<CustomReportRecord[]>('/reports/custom');
}

export async function getReportBuilderSchema() {
  return fetchJson<ReportBuilderSchema>('/reports/builder/schema');
}

export async function previewReportQuery(querySpec: ReportQuerySpec) {
  return fetchJson<ReportRunResult>('/reports/preview', {
    method: 'POST',
    body: JSON.stringify(querySpec),
  });
}

export async function runCustomReport(id: number) {
  return fetchJson<ReportRunResult>(`/reports/custom/${id}/run`);
}

export async function createCustomReport(data: CustomReportInput) {
  return fetchJson<CustomReportRecord>('/reports/custom', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomReport(id: number, data: CustomReportInput) {
  return fetchJson<CustomReportRecord>(`/reports/custom/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomReport(id: number) {
  return fetchJson<{ status: string; id: number }>(`/reports/custom/${id}`, {
    method: 'DELETE',
  });
}
