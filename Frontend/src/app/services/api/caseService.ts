import { fetchJson } from './http';
import type { BaseRecord, CaseLinkEntityType, CaseLinksResponse, CaseRecord, HistoryEntry } from './types';

type CaseCreateInput = Pick<CaseRecord, 'description'> & Partial<Omit<CaseRecord, keyof BaseRecord>>;

export async function listCases() {
  return fetchJson<CaseRecord[]>('/cases');
}

export async function createCase(data: CaseCreateInput & Partial<BaseRecord>) {
  return fetchJson<CaseRecord>('/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCase(id: string, data: Partial<CaseRecord>) {
  return fetchJson<CaseRecord>(`/cases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCase(id: string) {
  await fetchJson<void>(`/cases/${id}`, { method: 'DELETE' });
}

export async function addCaseHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<CaseRecord>(`/cases/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function getCase(id: string) {
  return fetchJson<CaseRecord>(`/cases/${id}`);
}

export async function getCaseLinks(id: string) {
  return fetchJson<CaseLinksResponse>(`/cases/${id}/links`);
}

export async function getLinkedCasesByEntity(entityType: CaseLinkEntityType, entityRecordId: string) {
  const query = new URLSearchParams({ entityType, entityRecordId });
  return fetchJson<CaseRecord[]>(`/cases/linked?${query.toString()}`);
}

export async function addCaseLink(id: string, entityType: CaseLinkEntityType, entityRecordId: string) {
  return fetchJson<CaseLinksResponse>(`/cases/${id}/links`, {
    method: 'POST',
    body: JSON.stringify({ entityType, entityRecordId }),
  });
}

export async function removeCaseLink(id: string, entityType: CaseLinkEntityType, entityRecordId: string) {
  return fetchJson<CaseLinksResponse>(
    `/cases/${id}/links/${encodeURIComponent(entityType)}/${encodeURIComponent(entityRecordId)}`,
    { method: 'DELETE' },
  );
}
