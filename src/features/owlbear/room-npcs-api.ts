import type { CreateMonsterInput, Monster } from "@/features/monsters/types/monsters.types"

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
    return new Error(error.error || error.message || fallback)
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
