"use client"

import * as React from "react"
import { Loader2, ScrollText, Skull, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"
import { GlassImage } from "@/components/ui/glass-image"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"
import { getHpBarColor, hpPercent } from "./hp-bar-utils"
import { notifyOwlbearOverlaySync } from "./overlay-sync-events"
import type { OwlbearRoomNpc } from "./room-npcs-api"
import type { OwlbearRuntimeState, OwlbearSessionState } from "./types"
import { useRoomInitiative } from "./use-room-initiative"
import { useRoomLinkedSheets } from "./use-room-linked-sheets"
import { useRoomNpcs } from "./use-room-npcs"

function InlineStatus({ tone = "neutral", message }: { tone?: "neutral" | "error"; message: string }) {
    return (
        <div
            className={cn(
                "rounded-2xl border px-4 py-3 text-sm",
                tone === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                    : "border-white/10 bg-white/5 text-white/70",
            )}
        >
            {message}
        </div>
    )
}

function HpSummary({ current, max, testId }: { current: number; max: number; testId: string }) {
    const percent = hpPercent(current, max)
    return (
        <div className="w-56 shrink-0" data-testid={`${testId}-track`}>
            <div className="mb-1 text-xs font-medium text-white/60">
                {current}/{max} PV
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                    data-testid={testId}
                    className="h-full rounded-full transition-all"
                    style={{ width: `${percent}%`, backgroundColor: getHpBarColor(current, max) }}
                />
            </div>
        </div>
    )
}

function NpcAvatar({ npc }: { npc: OwlbearRoomNpc }) {
    if (npc.source?.image) {
        return <GlassImage src={npc.source.image} alt={npc.source.name} className="h-12 w-12 rounded-lg" imageClassName="object-cover" enableExpand={false} />
    }

    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Skull className="h-5 w-5 text-white/35" />
        </div>
    )
}

function PlayerAvatar({ sheet }: { sheet: CharacterSheetFull }) {
    if (sheet.photo) {
        return <GlassImage src={sheet.photo} alt={sheet.name} className="h-12 w-12 rounded-lg" imageClassName="object-cover" enableExpand={false} />
    }

    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10">
            <ScrollText className="h-5 w-5 text-blue-200/75" />
        </div>
    )
}

function HpAdjustmentInput({ npc, onApply }: { npc: OwlbearRoomNpc; onApply: (npc: OwlbearRoomNpc, delta: number) => void }) {
    const [value, setValue] = React.useState("")

    return (
        <input
            aria-label={`Ajustar vida de ${npc.source?.name ?? "NPC"}`}
            type="text"
            inputMode="numeric"
            value={value}
            placeholder="+/-"
            onChange={(event) => {
                const next = event.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "")
                setValue(next)
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                if (!/^-?\d+$/.test(value)) return
                onApply(npc, Number(value))
                setValue("")
            }}
            className="h-9 w-20 rounded-lg border border-white/10 bg-black/20 px-2 text-center text-sm font-semibold text-white outline-none [appearance:textfield] placeholder:text-white/25 focus:border-emerald-300/40"
        />
    )
}

function PlayerInitiativeInput({
    sheet,
    value,
    onCommit,
}: {
    sheet: CharacterSheetFull
    value: number | null
    onCommit: (sheetId: string, initiative: number) => void
}) {
    const [draft, setDraft] = React.useState(value === null ? "" : String(value))

    React.useEffect(() => {
        setDraft(value === null ? "" : String(value))
    }, [value])

    return (
        <input
            aria-label={`Iniciativa de ${sheet.name}`}
            type="text"
            inputMode="numeric"
            value={draft}
            placeholder="INI"
            onChange={(event) => {
                const next = event.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "")
                setDraft(next)
            }}
            onBlur={() => {
                if (!/^-?\d+$/.test(draft)) return
                onCommit(sheet._id, Number(draft))
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                if (!/^-?\d+$/.test(draft)) return
                onCommit(sheet._id, Number(draft))
            }}
            className="h-9 w-20 rounded-lg border border-blue-300/20 bg-blue-500/10 px-2 text-center text-sm font-black text-blue-50 outline-none [appearance:textfield] placeholder:text-blue-100/35 focus:border-blue-200/50"
        />
    )
}

function InitiativeBadge({ value }: { value: number }) {
    return (
        <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-500/10 text-lg font-black text-amber-100">
            {value}
        </div>
    )
}

function NpcInitiativeRow({
    npc,
    initiative,
    isPending,
    onApplyHpDelta,
    onRemove,
}: {
    npc: OwlbearRoomNpc
    initiative: number
    isPending: boolean
    onApplyHpDelta: (npc: OwlbearRoomNpc, delta: number) => void
    onRemove: (npcId: string) => void
}) {
    return (
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <NpcAvatar npc={npc} />
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{npc.source?.name ?? "NPC indisponível"}</p>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/35">NPC</span>
                    </div>
                    <div className="mt-2">
                        <HpSummary current={npc.hpCurrent} max={npc.hpMax} testId={`initiative-npc-hp-bar-${npc.id}`} />
                    </div>
                </div>
            </div>
            <HpAdjustmentInput npc={npc} onApply={onApplyHpDelta} />
            <InitiativeBadge value={initiative} />
            <button
                type="button"
                aria-label={`Remover ${npc.source?.name ?? "NPC"} da iniciativa`}
                disabled={isPending}
                onClick={() => onRemove(npc.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
        </div>
    )
}

function PlayerInitiativeRow({
    sheet,
    initiative,
    onCommitInitiative,
}: {
    sheet: CharacterSheetFull
    initiative: number | null
    onCommitInitiative: (sheetId: string, initiative: number) => void
}) {
    const hpCurrent = sheet.hpCurrent ?? 0
    const hpMax = sheet.hpMax ?? 0

    return (
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-blue-300/15 bg-blue-500/10 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <PlayerAvatar sheet={sheet} />
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{sheet.name}</p>
                        <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-100/60">PC</span>
                    </div>
                    <div className="mt-2">
                        <HpSummary current={hpCurrent} max={hpMax} testId={`initiative-player-hp-bar-${sheet._id}`} />
                    </div>
                </div>
            </div>
            <PlayerInitiativeInput sheet={sheet} value={initiative} onCommit={onCommitInitiative} />
        </div>
    )
}

type InitiativeItem =
    | { kind: "npc"; id: string; initiative: number; npc: OwlbearRoomNpc }
    | { kind: "player"; id: string; initiative: number | null; sheet: CharacterSheetFull }

function getSortValue(value: number | null) {
    return value ?? Number.NEGATIVE_INFINITY
}

export function OwlbearGmInitiativeTab({
    runtime,
    session,
    isAuthenticated,
    isAuthLoaded,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    isAuthenticated: boolean
    isAuthLoaded: boolean
}) {
    const roomId = runtime.roomId
    const enabled = runtime.status === "ready" && session.sessionStatus === "ready" && isAuthenticated
    const { items: npcs, isLoading: isLoadingNpcs, errorMessage: npcsErrorMessage, updateNpc } = useRoomNpcs(roomId, session.sessionToken, enabled)
    const { sheets, isLoading: isLoadingSheets, errorMessage: sheetsErrorMessage } = useRoomLinkedSheets(session.sessionToken, enabled)
    const {
        initiative,
        isLoading: isLoadingInitiative,
        errorMessage: initiativeErrorMessage,
        removeNpcInitiative,
        setPlayerInitiative,
    } = useRoomInitiative(enabled)
    const [pendingNpcId, setPendingNpcId] = React.useState<string | null>(null)

    const sortedItems = React.useMemo<InitiativeItem[]>(() => {
        const npcItems: InitiativeItem[] = npcs
            .filter((npc) => npc.source && initiative.npcs[npc.id])
            .map((npc) => ({
                kind: "npc",
                id: `npc:${npc.id}`,
                initiative: initiative.npcs[npc.id].initiative,
                npc,
            }))
        const playerItems: InitiativeItem[] = sheets.map((sheet) => ({
            kind: "player",
            id: `player:${sheet._id}`,
            initiative: initiative.players[sheet._id]?.initiative ?? null,
            sheet,
        }))

        return [...npcItems, ...playerItems].sort((a, b) => getSortValue(b.initiative) - getSortValue(a.initiative))
    }, [initiative.npcs, initiative.players, npcs, sheets])

    const handleApplyHpDelta = React.useCallback((npc: OwlbearRoomNpc, delta: number) => {
        const nextHp = Math.max(0, Math.min(npc.hpMax, npc.hpCurrent + delta))
        setPendingNpcId(npc.id)
        notifyOwlbearOverlaySync({
            kind: "npc",
            refId: npc.id,
            hpCurrent: nextHp,
            hpMax: npc.hpMax,
            name: npc.source?.name ?? "NPC",
        })
        void updateNpc(npc.id, { hpCurrent: nextHp })
            .then((updated) => {
                notifyOwlbearOverlaySync({
                    kind: "npc",
                    refId: updated.id,
                    hpCurrent: updated.hpCurrent,
                    hpMax: updated.hpMax,
                    name: updated.source?.name ?? npc.source?.name ?? "NPC",
                })
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Não foi possível atualizar PV.")
            })
            .finally(() => setPendingNpcId(null))
    }, [updateNpc])

    const handleRemoveNpc = React.useCallback((npcId: string) => {
        setPendingNpcId(npcId)
        void removeNpcInitiative(npcId)
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Não foi possível remover NPC da iniciativa.")
            })
            .finally(() => setPendingNpcId(null))
    }, [removeNpcInitiative])

    const handleSetPlayerInitiative = React.useCallback((sheetId: string, initiativeValue: number) => {
        void setPlayerInitiative(sheetId, initiativeValue).catch((error) => {
            toast.error(error instanceof Error ? error.message : "Não foi possível atualizar iniciativa do personagem.")
        })
    }, [setPlayerInitiative])

    if (!isAuthLoaded) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (!isAuthenticated) {
        return <InlineStatus message="Faça login no Dndicas para gerenciar a iniciativa da sala." />
    }

    if (session.sessionStatus === "error" || !session.sessionToken || !roomId) {
        return <InlineStatus tone="error" message="A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente." />
    }

    if (session.sessionStatus === "loading" || isLoadingNpcs || isLoadingSheets || isLoadingInitiative) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    const errorMessage = npcsErrorMessage ?? sheetsErrorMessage ?? initiativeErrorMessage

    return (
        <div className="h-full min-h-0 overflow-auto pr-1">
            <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Iniciativa</h2>
                    <p className="mt-2 text-sm text-white/55">
                        NPCs entram pela aba NPCs. Personagens vinculados aparecem automaticamente aqui.
                    </p>
                </div>

                {errorMessage && <InlineStatus tone="error" message={errorMessage} />}

                {sortedItems.length === 0 ? (
                    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8">
                        <div className="max-w-xl text-center">
                            <ScrollText className="mx-auto h-10 w-10 text-white/35" />
                            <h2 className="mt-4 text-xl font-semibold text-white">Nenhum combatente na iniciativa</h2>
                            <p className="mt-3 text-sm leading-6 text-white/60">
                                Adicione NPCs pela aba NPCs ou vincule fichas à sala para preparar a ordem de combate.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2" data-testid="gm-initiative-list">
                        {sortedItems.map((item) => item.kind === "npc" ? (
                            <NpcInitiativeRow
                                key={item.id}
                                npc={item.npc}
                                initiative={item.initiative}
                                isPending={pendingNpcId === item.npc.id}
                                onApplyHpDelta={handleApplyHpDelta}
                                onRemove={handleRemoveNpc}
                            />
                        ) : (
                            <PlayerInitiativeRow
                                key={item.id}
                                sheet={item.sheet}
                                initiative={item.initiative}
                                onCommitInitiative={handleSetPlayerInitiative}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
