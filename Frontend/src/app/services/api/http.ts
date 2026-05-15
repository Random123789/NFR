import { normalizeApiTimestamps } from "../../utils/dateTime";

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const AUTH_TOKEN_KEY = 'mantis_auth_token';

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function resolveApiUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${API_BASE}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export async function fetchJson<T>(pathOrUrl: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options?.headers || {});

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(pathOrUrl), {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredAuth();
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const payload = await response.clone().json() as { detail?: string; message?: string; error?: string };
      message = payload.detail || payload.message || payload.error || message;
    } catch {
      try {
        const textPayload = await response.text();
        if (textPayload?.trim()) {
          message = textPayload;
        }
      } catch {
        // Keep default message when response body cannot be read.
      }
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json() as T;
  return normalizeApiTimestamps(payload);
}
