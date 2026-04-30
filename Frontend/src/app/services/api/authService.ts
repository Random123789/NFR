import { fetchJson } from './http';
import type {
  AssignableUser,
  AuthResponse,
  AuthUser,
  CreateUserRequest,
  ManagedUser,
  UpdateManagedUserRoleRequest,
  UpdateProfileRequest,
} from './types';

export async function login(email: string, password: string) {
  return fetchJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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
