"use client"

import * as React from "react"
import {
    getRoomMetadataState,
    removeNpcInitiative,
    setNpcInitiative,
    setPlayerInitiative,
    subscribeToRoomMetadata,
} from "./sdk"
import type { OwlbearInitiativeState } from "./types"

interface RoomInitiativeState {
    initiative: OwlbearInitiativeState
    isLoading: boolean
    errorMessage: string | null
    addNpcInitiative: (input: { npcId: string; initiative: number; roll: number; dexModifier: number }) => Promise<void>
    removeNpcInitiative: (npcId: string) => Promise<void>
    setPlayerInitiative: (sheetId: string, initiative: number) => Promise<void>
}

const EMPTY_INITIATIVE: OwlbearInitiativeState = {
    npcs: {},
    players: {},
}

export function useRoomInitiative(enabled = true): RoomInitiativeState {
    const [initiative, setInitiative] = React.useState<OwlbearInitiativeState>(EMPTY_INITIATIVE)
    const [isLoading, setIsLoading] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!enabled) {
            setInitiative(EMPTY_INITIATIVE)
            setIsLoading(false)
            setErrorMessage(null)
            return
        }

        let active = true
        let unsubscribe: (() => void) | undefined

        setIsLoading(true)
        setErrorMessage(null)

        void getRoomMetadataState()
            .then((metadata) => {
                if (!active) return
                setInitiative(metadata.initiative)
            })
            .catch((error) => {
                console.error("Failed to load Owlbear initiative", error)
                if (!active) return
                setErrorMessage("Não foi possível carregar a iniciativa da sala.")
            })
            .finally(() => {
                if (active) setIsLoading(false)
            })

        void (async () => {
            unsubscribe = await subscribeToRoomMetadata((metadata) => {
                if (!active) return
                setInitiative(metadata.initiative)
            })
        })()

        return () => {
            active = false
            unsubscribe?.()
        }
    }, [enabled])

    const addNpcInitiative = React.useCallback(async (input: { npcId: string; initiative: number; roll: number; dexModifier: number }) => {
        await setNpcInitiative(input)
    }, [])

    const handleRemoveNpcInitiative = React.useCallback(async (npcId: string) => {
        await removeNpcInitiative(npcId)
    }, [])

    const handleSetPlayerInitiative = React.useCallback(async (sheetId: string, initiativeValue: number) => {
        await setPlayerInitiative(sheetId, initiativeValue)
    }, [])

    return {
        initiative,
        isLoading,
        errorMessage,
        addNpcInitiative,
        removeNpcInitiative: handleRemoveNpcInitiative,
        setPlayerInitiative: handleSetPlayerInitiative,
    }
}
