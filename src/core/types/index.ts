/**
 * Exportações centralizadas de tipos
 */

// Common types
export type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  SortParams,
  FilterParams,
  QueryParams,
  LoadingState,
  AsyncResult,
  SelectOption,
  FileMetadata,
  GeoCoordinates,
  Address,
  ContactInfo,
  Timestamps,
  AuditMetadata,
  EntityStatus,
  EntityId,
  BaseEntity,
} from './common';

// Database types
export type {
  AuditAction,
  AuditLogEntry,
  PaginatedQueryOptions,
  PaginatedQueryResult,
  CrudOperations,
  DbConnectionStatus,
  DbConfig,
  MongooseTimestamps,
  MongooseDocument,
} from './database';

// Model types
export type {
  BaseModel,
  IUsageLog,
  IAuditLog,
  IUser,
  UserPreferences,
  INotification,
  IFile,
  IEmailLog,
  ISystemConfig,
  ISession,
} from './models';
