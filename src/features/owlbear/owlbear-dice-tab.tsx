"use client"

import * as React from "react"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { getDiceCriticalState } from "@/features/dice-roller/critical-state"
import { useDiceResultConsoleApi } from "@/features/dice-roller/hooks/use-dice-result-console-api"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { cn } from "@/core/utils"
import { diceColors } from "@/lib/config/colors"
import { fetchOwlbearSheetById, getRoomMetadataState } from "./sdk"
import { useOwlbearDiceHistory } from "./hooks/use-owlbear-dice-history"
import { useOwlbearDiceRealtime } from "./hooks/use-owlbear-dice-realtime"
import type { OwlbearDiceHistoryEntry, OwlbearRuntimeState, OwlbearSessionState } from "./types"

interface OwlbearDiceTabProps {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
}

function buildDiceFormula(result: DiceRollResponse) {
    const terms = result.terms.map((term) => `${term.quantity}${term.dice}`)
    const modifier = result.modifier === 0 ? "" : `${result.modifier > 0 ? "+" : ""}${result.modifier}`
    return `${terms.join(" + ")}${modifier}`
}

function getHistoryTone(entry: OwlbearDiceHistoryEntry) {
    const criticalState = getDiceCriticalState(entry.result)
    if (criticalState === "critical-success") {
        return "border-emerald-300/40 bg-emerald-500/12 text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
    }
    if (criticalState === "critical-failure") {
        return "border-red-300/40 bg-red-500/12 text-red-50 shadow-[0_0_24px_rgba(239,68,68,0.18)]"
    }
    if (entry.result.mode === "advantage") {
        return "border-emerald-400/20 bg-emerald-500/8 text-emerald-50"
    }
    if (entry.result.mode === "disadvantage") {
        return "border-red-400/20 bg-red-500/8 text-red-50"
    }
    return "border-white/10 bg-black/25 text-white"
}

function getHistoryModeLabel(mode: DiceRollResponse["mode"]) {
    if (mode === "advantage") return "Vantagem"
    if (mode === "disadvantage") return "Desvantagem"
    return null
}

function getDiceResultChipClass(dice: DiceRollResponse["terms"][number]["dice"]) {
    const color = diceColors[dice]
    return cn("rounded-full border px-2 py-1", color.border, color.bg, color.text)
}

function getHistoryDisplayName(entry: OwlbearDiceHistoryEntry) {
    if (entry.playerRole === "GM") return "MESTRE"
    return entry.characterName ?? entry.playerName
}

function formatRollTime(createdAt: string) {
    const value = Date.parse(createdAt)
    if (Number.isNaN(value)) return "--:--"
    return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(value))
}

function OwlbearDiceHistoryList({ history, isLoading }: { history: OwlbearDiceHistoryEntry[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/60">
                Carregando histórico compartilhado...
            </div>
        )
    }

    if (history.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
                Nenhuma rolagem compartilhada nesta sala ainda.
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {history.map((entry) => {
                const criticalState = getDiceCriticalState(entry.result)
                const displayName = getHistoryDisplayName(entry)
                const metadata = [
                    getHistoryModeLabel(entry.result.mode),
                    criticalState === "critical-success" ? "Crítico" : null,
                    criticalState === "critical-failure" ? "Falha crítica" : null,
                ].filter(Boolean).join(" • ")

                return (
                    <div
                        key={entry.id}
                        className={cn("rounded-2xl border p-3 transition-colors", getHistoryTone(entry))}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div
                                    className="flex min-w-0 flex-wrap items-center gap-2"
                                    data-testid="history-player-formula-row"
                                >
                                    <p
                                        className={cn(
                                            "truncate text-sm font-semibold",
                                            entry.playerRole === "GM" && "rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-xs font-black uppercase tracking-[0.22em] text-amber-200"
                                        )}
                                        data-testid={entry.playerRole === "GM" ? "history-gm-display-name" : undefined}
                                    >
                                        {displayName}
                                    </p>
                                    <span
                                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/75"
                                        data-testid="history-formula-chip"
                                    >
                                        {buildDiceFormula(entry.result)}
                                    </span>
                                </div>
                                {metadata && (
                                    <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-white/45">
                                        {metadata}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-black">{entry.result.total}</p>
                                <p className="text-[11px] text-white/45">{formatRollTime(entry.createdAt)}</p>
                            </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/75">
                            {entry.result.terms.map((term, index) => (
                                <span
                                    key={`${entry.id}-${term.dice}-${index}`}
                                    className={getDiceResultChipClass(term.dice)}
                                    data-testid={`history-dice-result-chip-${entry.id}-${term.dice}-${index}`}
                                >
                                    {term.quantity}{term.dice}: {term.results.join(", ")}
                                </span>
                            ))}
                            {entry.result.selectedD20?.discarded !== undefined && (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                                    descartado: {entry.result.selectedD20.discarded}
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export function OwlbearDiceTab({ runtime, session }: OwlbearDiceTabProps) {
    const { currentPlayerId, currentPlayerName, owlbearRoomId } = useDiceResultConsoleApi()
    const activeRoomId = owlbearRoomId ?? runtime.roomId
    const activePlayerId = currentPlayerId ?? runtime.playerId
    const { history, isLoading, errorMessage, appendHistoryEntry } = useOwlbearDiceHistory({
        enabled: runtime.status === "ready",
        roomId: runtime.roomId,
    })
    const [liveRoll, setLiveRoll] = React.useState<{ playerName: string; result: DiceRollResponse } | null>(null)

    const handleLiveRoll = React.useCallback((playerName: string, result: DiceRollResponse) => {
        setLiveRoll({ playerName, result })
    }, [])

    useOwlbearDiceRealtime({
        roomId: runtime.roomId,
        onRollResolved: React.useCallback((payload) => {
            handleLiveRoll(payload.playerName, payload.result)
        }, [handleLiveRoll]),
    })

    const handleRollResolved = React.useCallback(async (result: DiceRollResponse) => {
        if (!currentPlayerName) return

        handleLiveRoll(currentPlayerName, result)
        let characterName: string | undefined

        if (runtime.role !== "GM" && activePlayerId && session.sessionToken) {
            try {
                const metadata = await getRoomMetadataState()
                const linkedSheetId = metadata.playerLinks[activePlayerId]
                if (linkedSheetId) {
                    const sheet = await fetchOwlbearSheetById(linkedSheetId, session.sessionToken)
                    characterName = typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : undefined
                }
            } catch (error) {
                console.error("Failed to resolve Owlbear dice history character name", error)
            }
        }

        await appendHistoryEntry({
            id: result.rollId,
            playerName: currentPlayerName,
            playerId: activePlayerId ?? undefined,
            playerRole: runtime.role ?? undefined,
            characterName,
            result,
            createdAt: result.createdAt,
        })
    }, [activePlayerId, appendHistoryEntry, currentPlayerName, handleLiveRoll, runtime.role, session.sessionToken])

    const rollingBlockedMessage = runtime.status !== "ready"
        ? "A action do Owlbear ainda está inicializando."
        : !currentPlayerName || !activeRoomId || !activePlayerId
            ? "Aguardando identificação do jogador nesta sala para liberar rolagens compartilhadas."
            : null

    return (
        <div className="h-full min-h-0 overflow-x-auto">
            <div className="grid h-full min-h-0 min-w-[760px] grid-cols-[minmax(0,1fr)_minmax(280px,320px)] gap-4">
                <div className="min-h-0 space-y-4 overflow-auto pr-1">
                    <div className="max-w-[540px]">
                        <DiceRollerPanel
                            requestContext={{
                                source: "owlbear",
                                playerName: currentPlayerName ?? undefined,
                                owlbearRoomId: activeRoomId ?? undefined,
                                owlbearPlayerId: activePlayerId ?? undefined,
                            }}
                            onRollResolved={handleRollResolved}
                            externalResult={liveRoll?.result ?? null}
                            disableRolling={Boolean(rollingBlockedMessage)}
                            disabledRollingMessage={rollingBlockedMessage}
                            forceCombinationModifierInline
                        />
                    </div>
                </div>

                <div className="min-h-0 overflow-auto pr-1">
                    <div className="rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
                        <div className="mb-4">
                            <h3 className="text-sm font-black uppercase tracking-[0.28em] text-white/45">HISTÓRICO</h3>
                        </div>
                        {errorMessage && (
                            <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                {errorMessage}
                            </div>
                        )}
                        <OwlbearDiceHistoryList history={history} isLoading={isLoading} />
                    </div>
                </div>
            </div>
        </div>
    )
}
