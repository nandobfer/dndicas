import type {
    Background,
    CreateBackgroundInput,
    UpdateBackgroundInput,
    BackgroundsFilters,
    BackgroundsListResponse,
} from "../types/backgrounds.types"

const API_URL = "/api/backgrounds"

export async function fetchBackgrounds(
    params: BackgroundsFilters = {}
): Promise<BackgroundsListResponse> {
    const query = new URLSearchParams()

    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.status && params.status !== "all") query.append("status", params.status)
    if (params.sources && params.sources.length > 0) query.append("sources", params.sources.join(","))

    const res = await fetch(`${API_URL}?${query.toString()}`)

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao buscar origens")
    }

    return res.json()
}

export async function fetchBackground(id: string): Promise<Background> {
    const res = await fetch(`${API_URL}/${id}`)

    if (!res.ok) {
        if (res.status === 404) throw new Error("Origem não encontrada")
        throw new Error("Erro ao buscar origem")
    }

    return res.json()
}

export async function createBackground(data: CreateBackgroundInput): Promise<Background> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao criar origem")
    }

    return res.json()
}

export async function updateBackground(id: string, data: UpdateBackgroundInput): Promise<Background> {
    const res = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao atualizar origem")
    }

    return res.json()
}

export async function deleteBackground(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao excluir origem")
    }
}
