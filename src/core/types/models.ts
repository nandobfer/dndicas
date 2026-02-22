/**
 * Interfaces para modelos de dados do sistema
 */

import { EntityId, EntityStatus, AuditMetadata } from './common';

/**
 * Modelo base para todas as entidades
 */
export interface BaseModel extends AuditMetadata {
  _id: EntityId;
  status: EntityStatus;
}

/**
 * Log de uso de IA
 */
export interface IUsageLog extends BaseModel {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  userId?: string;
  cost?: number;
}

/**
 * Log de auditoria
 */
export interface IAuditLog extends BaseModel {
    action: string
    collectionName: string
    documentId: string
    userId?: string
    details?: Record<string, unknown>
}

/**
 * Usuário (complementar ao Clerk)
 */
export interface IUser extends BaseModel {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  preferences?: UserPreferences;
}

/**
 * Preferências do usuário
 */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
}

/**
 * Notificação
 */
export interface INotification extends BaseModel {
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  readAt?: Date;
  link?: string;
}

/**
 * Arquivo/Upload
 */
export interface IFile extends BaseModel {
    userId: string
    key: string
    name: string
    mimeType: string
    size: number
    url?: string
    metadata?: Record<string, unknown>
}

/**
 * Email enviado
 */
export interface IEmailLog extends Omit<BaseModel, 'status'> {
  to: string;
  from: string;
  subject: string;
  sentAt: Date;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
  provider?: string;
}

/**
 * Configuração do sistema
 */
export interface ISystemConfig extends BaseModel {
    key: string
    value: unknown
    description?: string
    isPublic: boolean
}

/**
 * Sessão de usuário (se necessário além do Clerk)
 */
export interface ISession extends BaseModel {
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}
