import { fetchJson } from './http';
import type {
  AssignableUser,
  AuthResponse,
  AuthUser,
  CreateUserRequest,
  ManagedUser,
  PasswordResetResponse,
  UpdateManagedUserRequest,
  UpdateManagedUserPasswordRequest,
  UpdateManagedUserRoleRequest,
  UpdateProfileRequest,
} from './types';

export async function login(identifier: string, password: string) {
  return fetchJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, password }),
  });
}

export async function requestPasswordReset(email: string) {
  return fetchJson<PasswordResetResponse>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return fetchJson<PasswordResetResponse>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function getCurrentUser() {
  const response = await fetchJson<{ user: AuthUser }>('/auth/me');
  return response.user;
}

export async function logout() {
  return fetchJson<{ success: boolean }>('/auth/logout', {
    method: 'POST',
  });
}

export async function updateCurrentUser(data: UpdateProfileRequest) {
  return fetchJson<{ user: AuthUser }>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateCurrentUserProfile(data: UpdateProfileRequest) {
  return updateCurrentUser(data);
}

export async function deleteCurrentUser() {
  return fetchJson<{ success: boolean }>('/auth/me', {
    method: 'DELETE',
  });
}

export async function listManagedUsers() {
  return fetchJson<ManagedUser[]>('/auth/users');
}

export async function listAssignableUsers() {
  return fetchJson<AssignableUser[]>('/auth/assignees');
}

export async function createManagedUser(data: CreateUserRequest) {
  return fetchJson<{ user: ManagedUser }>('/auth/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateManagedUserRole(userId: number, data: UpdateManagedUserRoleRequest) {
  return fetchJson<{ user: ManagedUser }>(`/auth/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateManagedUser(userId: number, data: UpdateManagedUserRequest) {
  return fetchJson<{ user: ManagedUser }>(`/auth/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateManagedUserPassword(userId: number, data: UpdateManagedUserPasswordRequest) {
  return fetchJson<{ success: boolean }>(`/auth/users/${userId}/password`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
