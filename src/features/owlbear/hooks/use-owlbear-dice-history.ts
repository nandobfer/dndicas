"use client"

import * as React from "react"
import { appendRoomDiceHistoryEntry, getRoomMetadataState, subscribeToRoomMetadata } from "../sdk"
import type { OwlbearDiceHistoryEntry } from "../types"

interface UseOwlbearDiceHistoryOptions {
    enabled: boolean
    roomId: string | null
}

export function useOwlbearDiceHistory({ enabled, roomId }: UseOwlbearDiceHistoryOptions) {
    const [history, setHistory] = React.useState<OwlbearDiceHistoryEntry[]>([])
    const [isLoading, setIsLoading] = React.useState(enabled)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!enabled) {
            setHistory([])
            setIsLoading(false)
            setErrorMessage(null)
            return
        }

        let mounted = true
        let unsubscribe: (() => void) | undefined

        void (async () => {
            try {
                setIsLoading(true)
                setErrorMessage(null)
                const metadata = await getRoomMetadataState()
                if (!mounted) return
                setHistory(metadata.diceHistory)
                setIsLoading(false)

                unsubscribe = await subscribeToRoomMetadata((nextMetadata) => {
                    if (!mounted) return
                    setHistory(nextMetadata.diceHistory)
                })
            } catch (error) {
                console.error("Failed to load Owlbear dice history", error)
                if (!mounted) return
                setHistory([])
                setIsLoading(false)
                setErrorMessage("Não foi possível sincronizar o histórico de dados da sala.")
            }
        })()

        return () => {
            mounted = false
            unsubscribe?.()
        }
    }, [enabled, roomId])

    const appendHistoryEntry = React.useCallback(async (entry: OwlbearDiceHistoryEntry) => {
        await appendRoomDiceHistoryEntry(entry)
    }, [])

    return {
        history,
        isLoading,
        errorMessage,
        appendHistoryEntry,
    }
}
