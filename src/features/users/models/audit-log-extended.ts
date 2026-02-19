/**
 * @fileoverview Extended Audit Log model using Mongoose discriminator pattern.
 * Extends core AuditLog without modifying src/core/.
 *
 * @see specs/000/spec.md - FR-036, FR-037, FR-038
 * @see specs/000/tasks.md - T046
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import AuditLogBase, { IAuditLog } from '@/core/database/audit-log';
import type { AuditAction, AuditEntity } from '../types/audit.types';

/**
 * Extended audit log document interface.
 */
export interface IAuditLogExtended extends Document {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  performedBy: string;
  performedByUser?: {
    _id: mongoose.Types.ObjectId;
    name?: string;
    username: string;
    email: string;
    avatarUrl?: string;
    role: 'admin' | 'user';
  };
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: {
    ip?: string;
    userAgent?: string;
    reason?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extended audit log model interface with static methods.
 */
interface IAuditLogExtendedModel extends Model<IAuditLogExtended> {
  findByEntity(entity: AuditEntity, entityId: string): Promise<IAuditLogExtended[]>;
  findByPerformer(userId: string): Promise<IAuditLogExtended[]>;
}

/**
 * Extended Audit Log Schema with additional fields.
 */
const AuditLogExtendedSchema = new Schema<IAuditLogExtended>(
  {
    action: {
      type: String,
      required: true,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      index: true,
    },
    entity: {
      type: String,
      required: true,
      enum: ['User', 'Auth'],
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    performedBy: {
      type: String,
      required: true,
      index: true,
    },
    performedByUser: {
      _id: { type: Schema.Types.ObjectId },
      name: { type: String },
      username: { type: String },
      email: { type: String },
      avatarUrl: { type: String },
      role: { type: String, enum: ['admin', 'user'] },
    },
    previousData: {
      type: Schema.Types.Mixed,
    },
    newData: {
      type: Schema.Types.Mixed,
    },
    metadata: {
      ip: { type: String },
      userAgent: { type: String },
      reason: { type: String },
    },
  },
  {
    timestamps: true,
    collection: 'auditlogs', // Use same collection as core
  }
);

// Indexes for common queries
AuditLogExtendedSchema.index({ createdAt: -1 });
AuditLogExtendedSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AuditLogExtendedSchema.index({ performedBy: 1, createdAt: -1 });

// Static methods
AuditLogExtendedSchema.statics.findByEntity = function (
  entity: AuditEntity,
  entityId: string
): Promise<IAuditLogExtended[]> {
  return this.find({ entity, entityId }).sort({ createdAt: -1 }).exec();
};

AuditLogExtendedSchema.statics.findByPerformer = function (
  userId: string
): Promise<IAuditLogExtended[]> {
  return this.find({ performedBy: userId }).sort({ createdAt: -1 }).exec();
};

/**
 * AuditLogExtended model - uses discriminator if base model exists,
 * otherwise creates standalone model.
 */
export const AuditLogExtended: IAuditLogExtendedModel =
  (mongoose.models.AuditLogExtended as IAuditLogExtendedModel) ||
  mongoose.model<IAuditLogExtended, IAuditLogExtendedModel>(
    'AuditLogExtended',
    AuditLogExtendedSchema
  );

export default AuditLogExtended;
