import type { CreateMonsterInput, Monster, MonsterFilterParams, MonstersResponse } from "@/features/monsters/types/monsters.types"
import { notifyOwlbearSessionInvalid } from "./sdk"

export type OwlbearRoomNpcSourceKind = "userNpc" | "monster"

export interface OwlbearRoomNpc {
    id: string
    _id: string
    roomId: string
    sourceKind: OwlbearRoomNpcSourceKind
    sourceId: string
    hpCurrent: number
    hpMax: number
    createdAt: string
    updatedAt: string
    source: Monster | null
}

function authHeaders(sessionToken: string) {
    return {
        Authorization: `Bearer ${sessionToken}`,
    }
}

async function parseJsonError(response: Response, fallback: string) {
    const error = await response.json().catch(() => ({}))
    const nextError = new Error(error.error || error.message || fallback) as Error & { status?: number }
    nextError.status = response.status
    if (response.status === 401 && nextError.message.toLowerCase().includes("sessão owlbear")) {
        notifyOwlbearSessionInvalid()
    }
    return nextError
}

export async function fetchOwlbearRoomNpcs(roomId: string, sessionToken: string): Promise<OwlbearRoomNpc[]> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs`, {
        headers: authHeaders(sessionToken),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao buscar NPCs da sala")
    const data = await response.json()
    return data.items ?? []
}

export async function linkOwlbearRoomNpc(roomId: string, sessionToken: string, input: {
    sourceKind: OwlbearRoomNpcSourceKind
    sourceId: string
    hpCurrent: number
    hpMax: number
}): Promise<OwlbearRoomNpc> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs`, {
        method: "POST",
        headers: {
            ...authHeaders(sessionToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao vincular NPC à sala")
    return response.json()
}

export async function createOwlbearUserNpc(roomId: string, sessionToken: string, input: CreateMonsterInput): Promise<Monster> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs/user-npcs`, {
        method: "POST",
        headers: {
            ...authHeaders(sessionToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao criar NPC")
    return response.json()
}

export async function fetchOwlbearUserNpcs(roomId: string, sessionToken: string, params: MonsterFilterParams = {}): Promise<MonstersResponse> {
    const query = new URLSearchParams()
    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.type && params.type.length > 0) query.append("type", params.type.join(","))
    if (params.size && params.size.length > 0) query.append("size", params.size.join(","))
    if (params.challengeRating) query.append("challengeRating", params.challengeRating)
    if (params.status && params.status !== "all") query.append("status", params.status)
    if (params.sources && params.sources.length > 0) query.append("sources", params.sources.join(","))

    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs/user-npcs?${query.toString()}`, {
        headers: authHeaders(sessionToken),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao buscar NPCs")
    return response.json()
}

export async function patchOwlbearRoomNpc(roomId: string, sessionToken: string, npcId: string, input: {
    hpCurrent?: number
    hpMax?: number
}): Promise<OwlbearRoomNpc> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs/${encodeURIComponent(npcId)}`, {
        method: "PATCH",
        headers: {
            ...authHeaders(sessionToken),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao atualizar NPC da sala")
    return response.json()
}

export async function deleteOwlbearRoomNpc(roomId: string, sessionToken: string, npcId: string): Promise<void> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs/${encodeURIComponent(npcId)}`, {
        method: "DELETE",
        headers: authHeaders(sessionToken),
    })
    if (!response.ok) throw await parseJsonError(response, "Erro ao remover NPC da sala")
}
