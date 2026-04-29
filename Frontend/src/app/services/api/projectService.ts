import { fetchJson } from './http';
import type { BaseRecord, HistoryEntry, ProjectRecord } from './types';

export async function listProjects() {
  return fetchJson<ProjectRecord[]>('/projects');
}

export async function createProject(data: Omit<ProjectRecord, keyof BaseRecord> & Partial<BaseRecord>) {
  return fetchJson<ProjectRecord>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<ProjectRecord>) {
  return fetchJson<ProjectRecord>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  await fetchJson<void>(`/projects/${id}`, { method: 'DELETE' });
}

export async function addProjectHistory(id: string, entry: Partial<HistoryEntry>) {
  return fetchJson<ProjectRecord>(`/projects/${id}/history`, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
