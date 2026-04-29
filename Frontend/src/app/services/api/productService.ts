import { fetchJson } from './http';
import type { BaseRecord, HistoryEntry, ProductRecord } from './types';

export async function listProducts() {
  return fetchJson<ProductRecord[]>('/products');
}

export async function createProduct(data: Omit<ProductRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<ProductRecord>('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(id: string, data: Partial<ProductRecord>) {
  return fetchJson<ProductRecord>(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(id: string) {
  await fetchJson<void>(`/products/${id}`, { method: 'DELETE' });
}

export async function addProductHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<ProductRecord>(`/products/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
