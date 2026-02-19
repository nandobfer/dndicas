/**
 * @fileoverview User Mongoose model for MongoDB persistence.
 * Syncs with Clerk authentication and supports soft delete via status field.
 *
 * @see specs/000/data-model.md
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import type { UserRole, UserStatus } from '../types/user.types';

/**
 * User document interface extending Mongoose Document.
 */
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  /** Clerk user ID for authentication linking */
  clerkId: string;
  /** Unique username */
  username: string;
  /** User email */
  email: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** User role for authorization */
  role: UserRole;
  /** User status (active/inactive for soft delete) */
  status: UserStatus;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * User model static methods interface.
 */
interface IUserModel extends Model<IUser> {
  /** Find user by Clerk ID */
  findByClerkId(clerkId: string): Promise<IUser | null>;
  /** Find user by email */
  findByEmail(email: string): Promise<IUser | null>;
  /** Find user by username */
  findByUsername(username: string): Promise<IUser | null>;
}

const UserSchema = new Schema<IUser>(
  {
    clerkId: {
      type: String,
      required: [true, 'Clerk ID é obrigatório'],
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: [true, 'Username é obrigatório'],
      unique: true,
      minlength: [3, 'Username deve ter no mínimo 3 caracteres'],
      maxlength: [50, 'Username deve ter no máximo 50 caracteres'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscore'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email é obrigatório'],
      unique: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'],
      index: true,
    },
    name: {
      type: String,
      maxlength: [100, 'Nome deve ter no máximo 100 caracteres'],
    },
    avatarUrl: {
      type: String,
      validate: {
        validator: (v: string) => !v || /^https?:\/\/.+/.test(v),
        message: 'URL do avatar inválida',
      },
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'user'],
        message: 'Função inválida: {VALUE}',
      },
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status inválido: {VALUE}',
      },
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for common queries
UserSchema.index({ status: 1, role: 1 });
UserSchema.index({ status: 1, createdAt: -1 });

// Text index for search
UserSchema.index(
  { username: 'text', email: 'text', name: 'text' },
  { weights: { name: 3, username: 2, email: 1 } }
);

// Static methods
UserSchema.statics.findByClerkId = function (clerkId: string) {
  return this.findOne({ clerkId });
};

UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.statics.findByUsername = function (username: string) {
  return this.findOne({ username });
};

/**
 * User model for MongoDB operations.
 * Handles user persistence synced with Clerk authentication.
 */
export const User: IUserModel =
  (mongoose.models.User as IUserModel) ||
  mongoose.model<IUser, IUserModel>('User', UserSchema);
