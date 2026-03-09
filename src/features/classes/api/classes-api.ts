/**
 * @fileoverview Client-side API functions for Classes feature.
 */

import type {
    CharacterClass,
    CreateClassInput,
    UpdateClassInput,
    ClassesFilters,
    ClassesListResponse,
} from "../types/classes.types"

const API_URL = "/api/classes"

export async function fetchClasses(
    params: ClassesFilters & { page?: number; limit?: number } = {}
): Promise<ClassesListResponse> {
    const query = new URLSearchParams()

    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.hitDice && params.hitDice.length > 0) query.append("hitDice", params.hitDice.join(","))
    if (params.spellcasting && params.spellcasting.length > 0) query.append("spellcasting", params.spellcasting.join(","))
    if (params.status) query.append("status", params.status)

    const res = await fetch(`${API_URL}?${query.toString()}`)

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao buscar classes")
    }

    return res.json()
}

export async function fetchClass(id: string): Promise<CharacterClass> {
    const res = await fetch(`${API_URL}/${id}`)

    if (!res.ok) {
        if (res.status === 404) throw new Error("Classe não encontrada")
        throw new Error("Erro ao buscar classe")
    }

    return res.json()
}

export async function createClass(data: CreateClassInput): Promise<CharacterClass> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao criar classe")
    }

    return res.json()
}

export async function updateClass(id: string, data: UpdateClassInput): Promise<CharacterClass> {
    const res = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao atualizar classe")
    }

    return res.json()
}

export async function deleteClass(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" })

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error || "Erro ao excluir classe")
    }
}
