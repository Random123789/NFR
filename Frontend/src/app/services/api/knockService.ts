import { fetchJson } from './http';
import type { BaseRecord, HistoryEntry, KnockRecord } from './types';

export async function listKnocks() {
  return fetchJson<KnockRecord[]>('/knocks');
}

export async function createKnock(data: Omit<KnockRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<KnockRecord>('/knocks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateKnock(id: string, data: Partial<KnockRecord>) {
  return fetchJson<KnockRecord>(`/knocks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteKnock(id: string) {
  await fetchJson<void>(`/knocks/${id}`, { method: 'DELETE' });
}

export async function addKnockHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<KnockRecord>(`/knocks/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
