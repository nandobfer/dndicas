/**
 * Tipos comuns usados em toda a aplicação
 */

/**
 * Resposta padrão de API
 * Todas as rotas de API devem retornar este formato
 */
export interface ApiResponse<T = any> {
  /** Indica se a operação foi bem-sucedida */
  success: boolean;
  /** Dados retornados em caso de sucesso */
  data?: T;
  /** Mensagem de erro em caso de falha */
  error?: string;
  /** Código de erro para tratamento programático */
  code?: string;
  /** Detalhes adicionais do erro (ex: erros de validação) */
  details?: any;
}

/**
 * Resposta paginada de API
 * Use para listagens com paginação
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  /** Informações de paginação */
  pagination: {
    /** Página atual (1-indexed) */
    page: number;
    /** Itens por página */
    limit: number;
    /** Total de itens no banco */
    total: number;
    /** Total de páginas */
    totalPages: number;
  };
}

/**
 * Parâmetros de paginação para queries
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Parâmetros de ordenação
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Parâmetros de filtragem genéricos
 */
export interface FilterParams {
  search?: string;
  [key: string]: any;
}

/**
 * Parâmetros completos de query (paginação + ordenação + filtros)
 */
export type QueryParams = PaginationParams & SortParams & FilterParams;

/**
 * Estado de carregamento para componentes
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Resultado de operação assíncrona
 */
export interface AsyncResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Opção para selects/dropdowns
 */
export interface SelectOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
}

/**
 * Metadados de arquivo
 */
export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  url?: string;
  key?: string;
  uploadedAt?: Date;
}

/**
 * Coordenadas geográficas
 */
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Endereço completo
 */
export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  coordinates?: GeoCoordinates;
}

/**
 * Informações de contato
 */
export interface ContactInfo {
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
}

/**
 * Timestamps padrão para modelos
 */
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Metadados de auditoria
 */
export interface AuditMetadata extends Timestamps {
  createdBy?: string;
  updatedBy?: string;
  deletedBy?: string;
}

/**
 * Status genérico para entidades
 */
export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';

/**
 * Tipo para IDs de entidades (string para MongoDB ObjectId)
 */
export type EntityId = string;

/**
 * Tipo base para entidades do banco de dados
 */
export interface BaseEntity extends AuditMetadata {
  _id: EntityId;
  status: EntityStatus;
}
