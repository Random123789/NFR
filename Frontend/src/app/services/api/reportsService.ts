import { fetchJson } from './http';
import type {
  CustomReportInput,
  CustomReportRecord,
  ReportBuilderSchema,
  ReportQuerySpec,
  ReportRunResult,
} from './types';

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
