import { fetchJson } from './http';
import type { AccountRecord, BaseRecord, HistoryEntry } from './types';

export async function listAccounts() {
  return fetchJson<AccountRecord[]>('/accounts');
}

export async function createAccount(data: Omit<AccountRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<AccountRecord>('/accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAccount(id: string, data: Partial<AccountRecord>) {
  return fetchJson<AccountRecord>(`/accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(id: string) {
  await fetchJson<void>(`/accounts/${id}`, { method: 'DELETE' });
}

export async function addAccountHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<AccountRecord>(`/accounts/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
