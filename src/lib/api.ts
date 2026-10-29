import axios, { type AxiosInstance } from "axios"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"

/**
 * Cliente HTTP do navegador. `baseURL` é `/api` (com o subcaminho público, se houver): chame os
 * endpoints SEM prefixar `/api` (`api.get('/acme/campaigns')`).
 */
const api: AxiosInstance = axios.create({
    baseURL: withBasePath("/api"),
    headers: {
        "Content-Type": "application/json",
    },
})

export default api
export { api }

/** Extrai a mensagem pt-BR de erro de uma resposta `ApiResponse`. */
export function apiErrorMessage(error: unknown, fallback = "Não foi possível concluir a ação."): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as { error?: string } | undefined
        if (data?.error) return data.error
    }
    return fallback
}

/** Código de erro (`code`) de uma resposta `ApiResponse`, quando houver. */
export function apiErrorCode(error: unknown): string | null {
    if (!axios.isAxiosError(error)) return null
    const data = error.response?.data as { code?: string } | undefined
    return data?.code ?? null
}

/** Dados de uma resposta `ApiResponse` bem-sucedida; lança com a mensagem pt-BR caso contrário. */
export function unwrapApi<T>(response: ApiResponse<T>): T {
    if (!response.success || response.data === undefined) throw new Error(response.error ?? "Resposta inválida")
    return response.data
}
