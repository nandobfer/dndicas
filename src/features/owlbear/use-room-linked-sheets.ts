"use client"

import * as React from "react"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"
import { clearPlayerSheetLink, fetchOwlbearSheetById, getRoomMetadataState, subscribeToRoomMetadata } from "./sdk"

interface RoomLinkedSheetsState {
    entries: Array<{ playerId: string; sheetId: string }>
    sheets: CharacterSheetFull[]
    isLoading: boolean
    errorMessage: string | null
    reload: () => Promise<void>
    unlinkSheet: (sheetId: string) => Promise<void>
}

export function useRoomLinkedSheets(sessionToken: string | null, enabled = true): RoomLinkedSheetsState {
    const [entries, setEntries] = React.useState<Array<{ playerId: string; sheetId: string }>>([])
    const [sheets, setSheets] = React.useState<CharacterSheetFull[]>([])
    const [isLoading, setIsLoading] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

    const loadSheetDetails = React.useCallback(async (nextEntries: Array<{ playerId: string; sheetId: string }>) => {
        if (!sessionToken) {
            setSheets([])
            return
        }

        const uniqueSheetIds = Array.from(new Set(nextEntries.map((entry) => entry.sheetId)))
        if (uniqueSheetIds.length === 0) {
            setSheets([])
            return
        }

        const loadedSheets = await Promise.all(uniqueSheetIds.map((sheetId) => fetchOwlbearSheetById(sheetId, sessionToken)))
        setSheets(loadedSheets)
    }, [sessionToken])

    const load = React.useCallback(async () => {
        if (!enabled || !sessionToken) {
            setEntries([])
            setSheets([])
            setErrorMessage(null)
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        setErrorMessage(null)
        try {
            const metadata = await getRoomMetadataState()
            const nextEntries = Object.entries(metadata.playerLinks).map(([playerId, sheetId]) => ({
                playerId,
                sheetId,
            }))
            setEntries(nextEntries)
            await loadSheetDetails(nextEntries)
        } catch (error) {
            console.error("Failed to load Owlbear linked sheets", error)
            setErrorMessage("Não foi possível carregar as fichas vinculadas a esta sala.")
        } finally {
            setIsLoading(false)
        }
    }, [enabled, loadSheetDetails, sessionToken])

    React.useEffect(() => {
        if (!enabled || !sessionToken) return

        let active = true
        let unsubscribe: (() => void) | undefined

        void load()

        void (async () => {
            unsubscribe = await subscribeToRoomMetadata((metadata) => {
                if (!active) return
                const nextEntries = Object.entries(metadata.playerLinks).map(([playerId, sheetId]) => ({
                    playerId,
                    sheetId,
                }))
                setEntries(nextEntries)
                void loadSheetDetails(nextEntries).catch((error) => {
                    console.error("Failed to refresh Owlbear linked sheets", error)
                    if (!active) return
                    setErrorMessage("Não foi possível atualizar as fichas vinculadas a esta sala.")
                })
            })
        })()

        return () => {
            active = false
            unsubscribe?.()
        }
    }, [enabled, load, loadSheetDetails, sessionToken])

    const unlinkSheet = React.useCallback(async (sheetId: string) => {
        const matchingEntries = entries.filter((entry) => entry.sheetId === sheetId)
        await Promise.all(matchingEntries.map((entry) => clearPlayerSheetLink(entry.playerId)))
    }, [entries])

    return {
        entries,
        sheets,
        isLoading,
        errorMessage,
        reload: load,
        unlinkSheet,
    }
}
