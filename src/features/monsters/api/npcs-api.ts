import type { CreateMonsterInput, Monster, MonsterFilterParams, MonstersResponse, UpdateMonsterInput } from "../types/monsters.types"

const API_URL = "/api/npcs"

export async function fetchNpcs(params: MonsterFilterParams = {}): Promise<MonstersResponse> {
    const query = new URLSearchParams()
    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.type && params.type.length > 0) query.append("type", params.type.join(","))
    if (params.size && params.size.length > 0) query.append("size", params.size.join(","))
    if (params.challengeRating) query.append("challengeRating", params.challengeRating)
    if (params.status && params.status !== "all") query.append("status", params.status)

    const res = await fetch(`${API_URL}?${query.toString()}`)
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao buscar NPCs")
    }
    return res.json()
}

export async function fetchNpcById(id: string): Promise<Monster> {
    const res = await fetch(`${API_URL}/${id}`)
    if (!res.ok) {
        if (res.status === 404) throw new Error("NPC não encontrado")
        throw new Error("Erro ao buscar NPC")
    }
    return res.json()
}

export async function createNpc(data: CreateMonsterInput): Promise<Monster> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao criar NPC")
    }
    return res.json()
}

export async function copyToNpc(data: { sourceType: "monster" | "npc"; sourceId: string }): Promise<Monster> {
    const res = await fetch(`${API_URL}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao copiar para NPC")
    }
    return res.json()
}

export async function updateNpc(id: string, data: UpdateMonsterInput): Promise<Monster> {
    const res = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao atualizar NPC")
    }
    return res.json()
}

export async function deleteNpc(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao excluir NPC")
    }
}
