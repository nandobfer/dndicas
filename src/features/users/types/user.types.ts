/**
 * @fileoverview User types and interfaces for the Users feature.
 * These types are used across components, hooks, and API routes.
 *
 * @see specs/000/data-model.md
 */

/**
 * User role enumeration.
 * - admin: Full access to all features
 * - user: Standard user access
 */
export type UserRole = 'admin' | 'user';

/**
 * User status enumeration.
 * - active: User can log in and use the system
 * - inactive: User is soft-deleted, cannot log in
 */
export type UserStatus = 'active' | 'inactive';

/**
 * Base User interface matching the Mongoose schema.
 * Used internally and for database operations.
 */
export interface User {
  /** MongoDB ObjectId as string */
  id: string;
  /** Clerk user ID for authentication linking */
  clerkId: string;
  /** Unique username for login */
  username: string;
  /** User email address */
  email: string;
  /** Display name (optional) */
  name?: string;
  /** Avatar URL (optional) */
  avatarUrl?: string;
  /** User role for authorization */
  role: UserRole;
  /** User status for soft delete */
  status: UserStatus;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * API response format for a single user.
 * Consistent format for all user endpoints.
 */
export interface UserResponse {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response for paginated user list.
 */
export interface UsersListResponse {
  /** Array of user records */
  items: UserResponse[];
  /** Total count of matching records */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Input for creating a new user.
 */
export interface CreateUserInput {
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role?: UserRole;
}

/**
 * Input for updating an existing user.
 * All fields are optional.
 */
export interface UpdateUserInput {
  username?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  role?: UserRole;
  status?: UserStatus;
}

/**
 * User filter options for list queries.
 */
export interface UserFilters {
  /** Text search (name, email, username) */
  search?: string;
  /** Filter by role */
  role?: 'all' | UserRole;
  /** Filter by status */
  status?: 'all' | UserStatus;
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * User with minimal fields for display in chips, tooltips, etc.
 */
export interface UserSummary {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  role: UserRole;
}
