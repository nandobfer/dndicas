/**
 * @fileoverview Audit service for logging CRUD operations.
 *
 * @see specs/000/spec.md - FR-036, FR-037, FR-038
 */

import dbConnect from '@/core/database/db';
import { AuditLogExtended, type IAuditLogExtended } from '../models/audit-log-extended';
import { User, type IUser } from '../models/user';
import type { AuditAction, AuditEntity, AuditLog, AuditDiff, ChangedField } from '../types/audit.types';

/**
 * Options for creating an audit log entry.
 */
export interface CreateAuditLogOptions {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  performedBy: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    reason?: string;
  };
}

/**
 * Fields to exclude from audit log data.
 */
const EXCLUDED_FIELDS = ['__v', 'clerkId'];

/**
 * Sanitize data for audit logging (remove sensitive/technical fields).
 */
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (EXCLUDED_FIELDS.includes(key)) continue;
    
    // Convert ObjectId to string
    if (value && typeof value === 'object' && '_id' in value) {
      sanitized[key] = String(value);
    } else if (key === '_id') {
      sanitized[key] = String(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Get user details for audit log display.
 */
async function getUserDetails(userId: string): Promise<{
  _id: string;
  name?: string;
  username: string;
  email: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
} | undefined> {
  try {
    await dbConnect();
    
    // Try to find by MongoDB ID first
    let user = await User.findById(userId).lean();
    
    // If not found, try by clerkId
    if (!user) {
      const userDoc = await User.findByClerkId(userId);
      user = userDoc ? userDoc.toObject() : null;
    }

    if (!user) return undefined;

    return {
      _id: String(user._id),
      name: user.name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  } catch {
    return undefined;
  }
}

/**
 * Create an audit log entry.
 */
export async function createAuditLog(options: CreateAuditLogOptions): Promise<IAuditLogExtended | null> {
  try {
    await dbConnect();

    // Get performer user details
    const performedByUser = await getUserDetails(options.performedBy);

    // Sanitize data
    const previousData = options.previousData
      ? sanitizeData(options.previousData)
      : undefined;
    const newData = options.newData
      ? sanitizeData(options.newData)
      : undefined;

    const auditLog = await AuditLogExtended.create({
      action: options.action,
      entity: options.entity,
      entityId: options.entityId,
      performedBy: options.performedBy,
      performedByUser,
      previousData,
      newData,
      metadata: options.metadata,
    });

    console.log("[AUDIT] Log criado:", {
        action: options.action,
        entity: options.entity,
        entityId: options.entityId,
        performedBy: options.performedBy,
        timestamp: new Date().toISOString(),
    })

    return auditLog;
  } catch (error) {
    console.error('[Audit] Failed to create audit log:', error);
    // Don't throw - audit failures shouldn't break main operations
    return null;
  }
}

/**
 * Log a CREATE operation.
 */
export async function logCreate(
  entity: AuditEntity,
  entityId: string,
  performedBy: string,
  newData: Record<string, unknown>,
  metadata?: CreateAuditLogOptions['metadata']
): Promise<IAuditLogExtended | null> {
  return createAuditLog({
    action: 'CREATE',
    entity,
    entityId,
    performedBy,
    newData,
    metadata,
  });
}

/**
 * Log an UPDATE operation.
 */
export async function logUpdate(
  entity: AuditEntity,
  entityId: string,
  performedBy: string,
  previousData: Record<string, unknown>,
  newData: Record<string, unknown>,
  metadata?: CreateAuditLogOptions['metadata']
): Promise<IAuditLogExtended | null> {
  return createAuditLog({
    action: 'UPDATE',
    entity,
    entityId,
    performedBy,
    previousData,
    newData,
    metadata,
  });
}

/**
 * Log a DELETE operation.
 */
export async function logDelete(
  entity: AuditEntity,
  entityId: string,
  performedBy: string,
  previousData: Record<string, unknown>,
  metadata?: CreateAuditLogOptions['metadata']
): Promise<IAuditLogExtended | null> {
  return createAuditLog({
    action: 'DELETE',
    entity,
    entityId,
    performedBy,
    previousData,
    metadata,
  });
}

/**
 * Compute diff between previous and new data.
 */
export function computeDiff(
  previousData?: Record<string, unknown>,
  newData?: Record<string, unknown>
): AuditDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: ChangedField[] = [];

  const prevKeys = previousData ? Object.keys(previousData) : [];
  const newKeys = newData ? Object.keys(newData) : [];

  // Find added fields
  for (const key of newKeys) {
    if (!prevKeys.includes(key)) {
      added.push(key);
    }
  }

  // Find removed fields
  for (const key of prevKeys) {
    if (!newKeys.includes(key)) {
      removed.push(key);
    }
  }

  // Find changed fields
  for (const key of prevKeys) {
    if (newKeys.includes(key)) {
      const oldValue = previousData![key];
      const newValue = newData![key];

      // Deep compare for objects
      const oldStr = JSON.stringify(oldValue);
      const newStr = JSON.stringify(newValue);

      if (oldStr !== newStr) {
        changed.push({
          field: key,
          oldValue,
          newValue,
        });
      }
    }
  }

  return { added, removed, changed };
}
