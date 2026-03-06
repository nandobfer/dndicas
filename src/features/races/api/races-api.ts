import type {
    Race,
    CreateRaceInput,
    UpdateRaceInput,
    RacesFilters,
    RacesListResponse,
} from "../types/races.types"

const API_URL = "/api/races"

export async function fetchRaces(
    params: RacesFilters = {}
): Promise<RacesListResponse> {
    const query = new URLSearchParams()

    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.status && params.status !== "all") query.append("status", params.status)

    const res = await fetch(`${API_URL}?${query.toString()}`)

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao buscar raças")
    }

    return res.json()
}

export async function fetchRace(id: string): Promise<Race> {
    const res = await fetch(`${API_URL}/${id}`)

    if (!res.ok) {
        if (res.status === 404) throw new Error("Raça não encontrada")
        throw new Error("Erro ao buscar raça")
    }

    return res.json()
}

export async function createRace(data: CreateRaceInput): Promise<Race> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao criar raça")
    }

    return res.json()
}

export async function updateRace(id: string, data: UpdateRaceInput): Promise<Race> {
    const res = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao atualizar raça")
    }

    return res.json()
}

export async function deleteRace(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao excluir raça")
    }
}
