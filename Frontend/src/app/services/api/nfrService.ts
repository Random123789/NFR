import { fetchJson } from './http';
import type { BaseRecord, HistoryEntry, NfrRecord } from './types';

export async function listNfrs() {
  return fetchJson<NfrRecord[]>('/nfrs');
}

export async function createNfr(data: Omit<NfrRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<NfrRecord>('/nfrs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNfr(id: string, data: Partial<NfrRecord>) {
  return fetchJson<NfrRecord>(`/nfrs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNfr(id: string) {
  await fetchJson<void>(`/nfrs/${id}`, { method: 'DELETE' });
}

export async function addNfrHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<NfrRecord>(`/nfrs/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
