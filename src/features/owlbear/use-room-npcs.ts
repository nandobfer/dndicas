"use client"

import * as React from "react"
import {
    deleteOwlbearRoomNpc,
    fetchOwlbearRoomNpcs,
    linkOwlbearRoomNpc,
    patchOwlbearRoomNpc,
    type OwlbearRoomNpc,
    type OwlbearRoomNpcSourceKind,
} from "./room-npcs-api"

interface RoomNpcsState {
    items: OwlbearRoomNpc[]
    isLoading: boolean
    errorMessage: string | null
    reload: () => Promise<void>
    linkNpc: (input: { sourceKind: OwlbearRoomNpcSourceKind; sourceId: string; hpCurrent: number; hpMax: number }) => Promise<OwlbearRoomNpc>
    updateNpc: (npcId: string, input: { hpCurrent?: number; hpMax?: number }) => Promise<OwlbearRoomNpc>
    removeNpc: (npcId: string) => Promise<void>
}

export function useRoomNpcs(roomId: string | null, sessionToken: string | null, enabled = true): RoomNpcsState {
    const [items, setItems] = React.useState<OwlbearRoomNpc[]>([])
    const [isLoading, setIsLoading] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        if (!enabled || !roomId || !sessionToken) {
            setItems([])
            setIsLoading(false)
            setErrorMessage(null)
            return
        }

        setIsLoading(true)
        setErrorMessage(null)
        try {
            setItems(await fetchOwlbearRoomNpcs(roomId, sessionToken))
        } catch (error) {
            console.error("Failed to load Owlbear room NPCs", error)
            setErrorMessage(error instanceof Error ? error.message : "Não foi possível carregar NPCs da sala.")
        } finally {
            setIsLoading(false)
        }
    }, [enabled, roomId, sessionToken])

    React.useEffect(() => {
        void load()
    }, [load])

    const linkNpc = React.useCallback(async (input: { sourceKind: OwlbearRoomNpcSourceKind; sourceId: string; hpCurrent: number; hpMax: number }) => {
        if (!roomId || !sessionToken) throw new Error("Sessão Owlbear indisponível")
        const created = await linkOwlbearRoomNpc(roomId, sessionToken, input)
        setItems((current) => [created, ...current])
        return created
    }, [roomId, sessionToken])

    const updateNpc = React.useCallback(async (npcId: string, input: { hpCurrent?: number; hpMax?: number }) => {
        if (!roomId || !sessionToken) throw new Error("Sessão Owlbear indisponível")
        const updated = await patchOwlbearRoomNpc(roomId, sessionToken, npcId, input)
        setItems((current) => current.map((item) => item.id === npcId ? updated : item))
        return updated
    }, [roomId, sessionToken])

    const removeNpc = React.useCallback(async (npcId: string) => {
        if (!roomId || !sessionToken) throw new Error("Sessão Owlbear indisponível")
        await deleteOwlbearRoomNpc(roomId, sessionToken, npcId)
        setItems((current) => current.filter((item) => item.id !== npcId))
    }, [roomId, sessionToken])

    return {
        items,
        isLoading,
        errorMessage,
        reload: load,
        linkNpc,
        updateNpc,
        removeNpc,
    }
}
