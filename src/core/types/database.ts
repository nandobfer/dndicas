/**
 * Tipos relacionados ao banco de dados
 */

// Tipos equivalentes para Mongoose 9
type FilterQuery<T> = Partial<T> & Record<string, any>;
type QueryOptions = Record<string, any>;
type UpdateQuery<T> = Partial<T> & Record<string, any>;

/**
 * Ações de auditoria no banco de dados
 */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'READ'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE';

/**
 * Entrada de log de auditoria
 */
export interface AuditLogEntry {
  action: AuditAction;
  collectionName: string;
  documentId: string;
  userId?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

/**
 * Opções para queries paginadas
 */
export interface PaginatedQueryOptions {
  page: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
  select?: string | string[];
  populate?: string | string[];
}

/**
 * Resultado de query paginada
 */
export interface PaginatedQueryResult<T> {
  docs: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Operações CRUD genéricas
 */
export interface CrudOperations<T> {
  findById(id: string): Promise<T | null>;
  findOne(filter: FilterQuery<T>): Promise<T | null>;
  findMany(
    filter: FilterQuery<T>,
    options?: QueryOptions
  ): Promise<T[]>;
  findPaginated(
    filter: FilterQuery<T>,
    options: PaginatedQueryOptions
  ): Promise<PaginatedQueryResult<T>>;
  create(data: Partial<T>): Promise<T>;
  update(
    id: string,
    data: UpdateQuery<T>
  ): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filter: FilterQuery<T>): Promise<number>;
}

/**
 * Status de conexão com o banco de dados
 */
export type DbConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting';

/**
 * Configuração de conexão do banco
 */
export interface DbConfig {
  uri: string;
  options?: {
    maxPoolSize?: number;
    minPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  };
}

/**
 * Schema básico do Mongoose com tipos
 */
export interface MongooseTimestamps {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Documento do Mongoose
 */
export interface MongooseDocument extends MongooseTimestamps {
  _id: any;
  __v?: number;
}
