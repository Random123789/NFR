import { fetchJson } from './http';
import type { RecordReadEntry, RecordReadEntityType, RecordReadStateResponse } from './types';

export async function getRecordReadState() {
  return fetchJson<RecordReadStateResponse>('/record-reads');
}

export async function markRecordRead(entityType: RecordReadEntityType, entityId: string) {
  return fetchJson<RecordReadEntry>('/record-reads/mark-read', {
    method: 'POST',
    body: JSON.stringify({ entityType, entityId }),
  });
}
