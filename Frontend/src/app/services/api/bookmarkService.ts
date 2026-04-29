import { fetchJson } from './http';
import type { BookmarkedItem } from './types';

export async function getUserBookmarks() {
  return fetchJson<BookmarkedItem[]>('/bookmarks');
}

export async function addUserBookmark(item: BookmarkedItem) {
  return fetchJson<{ success: boolean }>('/bookmarks', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function removeUserBookmark(id: string, type: string) {
  return fetchJson<void>(`/bookmarks/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
