import type { CreateMonsterInput, Monster, MonsterFilterParams, MonstersResponse, UpdateMonsterInput } from "../types/monsters.types"

const API_URL = "/api/monsters"

export async function fetchMonsters(params: MonsterFilterParams = {}): Promise<MonstersResponse> {
    const query = new URLSearchParams()
    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.type && params.type.length > 0) query.append("type", params.type.join(","))
    if (params.size && params.size.length > 0) query.append("size", params.size.join(","))
    if (params.challengeRating) query.append("challengeRating", params.challengeRating)
    if (params.status && params.status !== "all") query.append("status", params.status)
    if (params.sources && params.sources.length > 0) query.append("sources", params.sources.join(","))

    const res = await fetch(`${API_URL}?${query.toString()}`)
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao buscar monstros")
    }
    return res.json()
}

export async function fetchMonsterById(id: string): Promise<Monster> {
    const res = await fetch(`${API_URL}/${id}`)
    if (!res.ok) {
        if (res.status === 404) throw new Error("Monstro não encontrado")
        throw new Error("Erro ao buscar monstro")
    }
    return res.json()
}

export async function createMonster(data: CreateMonsterInput): Promise<Monster> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao criar monstro")
    }
    return res.json()
}

export async function updateMonster(id: string, data: UpdateMonsterInput): Promise<Monster> {
    const res = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao atualizar monstro")
    }
    return res.json()
}

export async function deleteMonster(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || error.message || "Erro ao excluir monstro")
    }
}

export async function searchMonstersForMentions(query: string): Promise<Monster[]> {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) throw new Error("Erro ao buscar monstros")
    const data = await res.json()
    return data.items || []
}
