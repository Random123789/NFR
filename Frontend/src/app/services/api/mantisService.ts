import { fetchJson } from './http';
import type { BaseRecord, HistoryEntry, MantisRecord } from './types';

export async function listMantis() {
  return fetchJson<MantisRecord[]>('/mantis?limit=10000');
}

export async function createMantis(data: Omit<MantisRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<MantisRecord>('/mantis', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMantis(id: string, data: Partial<MantisRecord>) {
  return fetchJson<MantisRecord>(`/mantis/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMantis(id: string) {
  await fetchJson<void>(`/mantis/${id}`, { method: 'DELETE' });
}

export async function addMantisHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<MantisRecord>(`/mantis/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
