"use client"

import * as React from "react"
import { clearScopedDiceOverride, listScopedDiceOverrides, setDiceOverride } from "../dice-api"
import { DICE_TYPES, type DiceResultConsoleApi, type DiceType } from "../types"
import { loadOwlbearSdk } from "@/features/owlbear/sdk"
import { shouldLoadOwlbearSdk } from "@/features/owlbear/should-load-owlbear-sdk"

declare global {
    interface Window {
        diceResult?: DiceResultConsoleApi
    }
}

function isDiceType(value: string): value is DiceType {
    return DICE_TYPES.includes(value as DiceType)
}

function resolveScopedTarget(
    currentPlayerId: string | null,
    owlbearPlayerIdOrDice: string,
    maybeDice: string | undefined
) {
    if (maybeDice && isDiceType(maybeDice)) {
        return {
            owlbearPlayerId: owlbearPlayerIdOrDice,
        }
    }

    if (currentPlayerId) {
        return {
            owlbearPlayerId: currentPlayerId,
        }
    }

    return {}
}

interface UseDiceResultConsoleApiOptions {
    registerGlobal?: boolean
}

type PlayerIdMappingRow = {
    id: string
    name: string
    role: string
}

function buildPlayerIdMappingRows(currentPlayer: PlayerIdMappingRow, partyPlayers: PlayerIdMappingRow[]) {
    const playerById = new Map<string, PlayerIdMappingRow>()

    for (const player of [currentPlayer, ...partyPlayers]) {
        if (!playerById.has(player.id)) {
            playerById.set(player.id, {
                id: player.id,
                name: player.name,
                role: player.role,
            })
        }
    }

    return Array.from(playerById.values())
}

export function useDiceResultConsoleApi({ registerGlobal = true }: UseDiceResultConsoleApiOptions = {}) {
    const [currentPlayerId, setCurrentPlayerId] = React.useState<string | null>(null)
    const [owlbearRoomId, setOwlbearRoomId] = React.useState<string | null>(null)
    const [currentPlayerName, setCurrentPlayerName] = React.useState<string | null>(null)
    const lastLoggedPartyRoomIdRef = React.useRef<string | null>(null)

    React.useEffect(() => {
        if (!shouldLoadOwlbearSdk(window)) return

        let mounted = true
        let unsubscribeReady: (() => void) | undefined

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!mounted || !sdk || !sdk.isAvailable) return

            const hydrateContext = async () => {
                const [playerName, playerId, playerRole] = await Promise.all([
                    sdk.player.getName(),
                    sdk.player.getId(),
                    sdk.player.getRole(),
                ])
                if (!mounted) return
                const roomId = sdk.room.id ?? null
                setOwlbearRoomId(roomId)
                setCurrentPlayerId(playerId)
                setCurrentPlayerName(playerName)

                if (roomId && lastLoggedPartyRoomIdRef.current !== roomId) {
                    lastLoggedPartyRoomIdRef.current = roomId
                    try {
                        const partyPlayers = await sdk.party.getPlayers()
                        console.info("[Owlbear] playerId mapping")
                        console.table(buildPlayerIdMappingRows(
                            { id: playerId, name: playerName, role: playerRole },
                            partyPlayers
                        ))
                    } catch (error) {
                        console.error("Failed to load Owlbear party players for console log", error)
                    }
                }
            }

            if (sdk.isReady) {
                await hydrateContext()
                return
            }

            unsubscribeReady = sdk.onReady(() => {
                void hydrateContext()
            }) || undefined
        })()

        return () => {
            mounted = false
            unsubscribeReady?.()
        }
    }, [])

    React.useEffect(() => {
        if (!registerGlobal) return

        const api: DiceResultConsoleApi = {
            min: async (owlbearPlayerIdOrDice: string, diceOrValue: DiceType | number, maybeValue?: number) => {
                const scopedTarget = resolveScopedTarget(currentPlayerId, owlbearPlayerIdOrDice, typeof diceOrValue === "string" ? diceOrValue : undefined)
                const dice = typeof diceOrValue === "string" ? diceOrValue : owlbearPlayerIdOrDice as DiceType
                const value = typeof diceOrValue === "number" ? diceOrValue : maybeValue
                if (typeof value !== "number") throw new Error("Valor inválido para override mínimo.")
                return setDiceOverride({ action: "min", dice, value, ...scopedTarget })
            },
            max: async (owlbearPlayerIdOrDice: string, diceOrValue: DiceType | number, maybeValue?: number) => {
                const scopedTarget = resolveScopedTarget(currentPlayerId, owlbearPlayerIdOrDice, typeof diceOrValue === "string" ? diceOrValue : undefined)
                const dice = typeof diceOrValue === "string" ? diceOrValue : owlbearPlayerIdOrDice as DiceType
                const value = typeof diceOrValue === "number" ? diceOrValue : maybeValue
                if (typeof value !== "number") throw new Error("Valor inválido para override máximo.")
                return setDiceOverride({ action: "max", dice, value, ...scopedTarget })
            },
            range: async (owlbearPlayerIdOrDice: string, diceOrMin: DiceType | number, minOrMax: number, maybeMax?: number) => {
                const scopedTarget = resolveScopedTarget(currentPlayerId, owlbearPlayerIdOrDice, typeof diceOrMin === "string" ? diceOrMin : undefined)
                const dice = typeof diceOrMin === "string" ? diceOrMin : owlbearPlayerIdOrDice as DiceType
                const min = typeof diceOrMin === "number" ? diceOrMin : minOrMax
                const max = typeof diceOrMin === "number" ? minOrMax : maybeMax
                if (typeof max !== "number") throw new Error("Faixa inválida para override.")
                return setDiceOverride({ action: "range", dice, min, max, ...scopedTarget })
            },
            exact: async (owlbearPlayerIdOrDice: string, diceOrValue: DiceType | number, maybeValue?: number) => {
                const scopedTarget = resolveScopedTarget(currentPlayerId, owlbearPlayerIdOrDice, typeof diceOrValue === "string" ? diceOrValue : undefined)
                const dice = typeof diceOrValue === "string" ? diceOrValue : owlbearPlayerIdOrDice as DiceType
                const value = typeof diceOrValue === "number" ? diceOrValue : maybeValue
                if (typeof value !== "number") throw new Error("Valor inválido para override exato.")
                return setDiceOverride({ action: "exact", dice, value, ...scopedTarget })
            },
            clear: async (owlbearPlayerIdOrDice?: string, maybeDice?: DiceType) => {
                if (!owlbearPlayerIdOrDice || isDiceType(owlbearPlayerIdOrDice)) {
                    const scopedTarget = currentPlayerId ? { owlbearPlayerId: currentPlayerId } : {}
                    const dice = owlbearPlayerIdOrDice && isDiceType(owlbearPlayerIdOrDice) ? owlbearPlayerIdOrDice : maybeDice
                    return clearScopedDiceOverride({ dice, ...scopedTarget })
                }

                return clearScopedDiceOverride({
                    owlbearPlayerId: owlbearPlayerIdOrDice,
                    dice: maybeDice,
                })
            },
            list: async (owlbearPlayerId?: string) => {
                const scopedTarget = owlbearPlayerId
                    ? { owlbearPlayerId }
                    : currentPlayerId
                        ? { owlbearPlayerId: currentPlayerId }
                        : {}

                return listScopedDiceOverrides(scopedTarget)
            },
        }

        window.diceResult = api

        return () => {
            delete window.diceResult
        }
    }, [currentPlayerId, registerGlobal])

    return {
        currentPlayerId,
        currentPlayerName,
        owlbearRoomId,
    }
}
