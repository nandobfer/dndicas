/** Formatos padronizados de resposta da API (mesmos do Smart Desk + cursor). */

export interface ApiResponse<T = unknown> {
    success: boolean
    data?: T
    error?: string
    code?: string
    details?: unknown
    message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination?: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}

export interface CursorResponse<T> {
    items: T[]
    nextCursor: string | null
}
