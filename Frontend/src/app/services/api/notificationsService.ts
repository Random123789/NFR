import { fetchJson } from './http';
import type { Notification } from './types';

export async function getRecentNotifications(hours = 24) {
  return fetchJson<Notification[]>(`/notifications/recent?hours=${encodeURIComponent(String(hours))}`);
}

export async function dismissNotification(notificationId: string) {
  return fetchJson<{ success: boolean }>('/notifications/dismiss', {
    method: 'POST',
    body: JSON.stringify({ notificationId }),
  });
}

export async function clearAllNotifications() {
  return fetchJson<{ success: boolean }>('/notifications/clear-all', {
    method: 'POST',
  });
}
