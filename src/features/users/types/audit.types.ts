/**
 * @fileoverview Audit types for the users feature.
 *
 * @see specs/000/spec.md - FR-036, FR-037, FR-038, FR-039
 */

/**
 * Audit action types.
 */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Entity type being audited.
 */
export type AuditEntity = "User" | "Auth" | "Reference" | "Rule" | "Company" | "Organization" | "Trait"

/**
 * Base audit log record.
 */
export interface AuditLog {
    _id: string
    /** Action performed */
    action: AuditAction
    /** Entity type */
    entity: AuditEntity
    /** Entity ID that was affected */
    entityId: string
    /** User ID who performed the action */
    performedBy: string
    /** User details for display */
    performedByUser?: {
        _id: string
        name?: string
        username: string
        email: string
        avatarUrl?: string
        role: "admin" | "user"
        status?: "active" | "inactive"
    }
    /** Previous data (for UPDATE and DELETE) */
    previousData?: Record<string, unknown>
    /** New data (for CREATE and UPDATE) */
    newData?: Record<string, unknown>
    /** Additional metadata */
    metadata?: {
        ip?: string
        userAgent?: string
        reason?: string
    }
    /** When the action occurred */
    createdAt: Date
}

/**
 * Audit log for user operations.
 */
export interface UserAuditLog extends AuditLog {
  entity: 'User';
  /** Affected user details for display */
  affectedUser?: {
    _id: string;
    name?: string;
    username: string;
    email: string;
    avatarUrl?: string;
    role: 'admin' | 'user';
  };
}

/**
 * Audit logs list response from API.
 */
export interface AuditLogsListResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Single audit log response.
 */
export interface AuditLogResponse {
  data: AuditLog;
}

/**
 * Filters for audit logs list.
 */
export interface AuditLogFilters {
  /** Filter by action type */
  action?: AuditAction | 'all';
  /** Filter by entity type */
  entity?: AuditEntity | 'all';
  /** Filter by performing user ID */
  performedBy?: string;
  /** Start date filter */
  startDate?: Date | string;
  /** End date filter */
  endDate?: Date | string;
  /** Page number */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * Changed field in audit diff.
 */
export interface ChangedField {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Computed diff from audit log.
 */
export interface AuditDiff {
  added: string[];
  removed: string[];
  changed: ChangedField[];
}
