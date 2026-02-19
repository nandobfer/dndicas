/**
 * @fileoverview Users API client wrapper for frontend use.
 * Provides typed functions for all user CRUD operations.
 *
 * @see specs/000/contracts/users.yaml
 */

import type {
  User,
  UserResponse,
  UsersListResponse,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
} from '../types/user.types';

const API_BASE = '/api/users';

/**
 * API error response.
 */
interface ApiError {
  error: string;
  details?: string;
}

/**
 * Fetch wrapper with error handling.
 */
async function fetchApi<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: 'Unknown error',
    }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Build query string from filters.
 */
function buildQueryString(filters: UserFilters): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.role && filters.role !== 'all') {
    params.set('role', filters.role);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.page) {
    params.set('page', String(filters.page));
  }
  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Fetch users list with pagination and filters.
 */
export async function fetchUsers(filters: UserFilters): Promise<UsersListResponse> {
  const queryString = buildQueryString(filters);
  return fetchApi<UsersListResponse>(`${API_BASE}${queryString}`);
}

/**
 * Fetch single user by ID.
 */
export async function fetchUser(id: string): Promise<UserResponse> {
  return fetchApi<UserResponse>(`${API_BASE}/${id}`);
}

/**
 * Create a new user.
 */
export async function createUser(data: CreateUserInput): Promise<UserResponse> {
  return fetchApi<UserResponse>(API_BASE, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing user.
 */
export async function updateUser(
  id: string,
  data: UpdateUserInput
): Promise<UserResponse> {
  return fetchApi<UserResponse>(`${API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a user (soft delete).
 */
export async function deleteUser(id: string): Promise<void> {
  await fetchApi<{ success: boolean }>(`${API_BASE}/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Export user type for external use.
 */
export type { User, UserResponse, UsersListResponse, CreateUserInput, UpdateUserInput };
