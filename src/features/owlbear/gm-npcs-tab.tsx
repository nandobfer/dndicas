"use client"

import * as React from "react"
import Fuse from "fuse.js"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, ChevronRight, Loader2, Plus, Shield, Skull, Swords, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"
import { GlassButton } from "@/components/ui/glass-button"
import { GlassNumberInput } from "@/components/ui/glass-number-input"
import {
    GlassDropdownMenu,
    GlassDropdownMenuContent,
    GlassDropdownMenuItem,
    GlassDropdownMenuTrigger,
} from "@/components/ui/glass-dropdown-menu"
import { GlassImage } from "@/components/ui/glass-image"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel"
import { SearchInput } from "@/components/ui/search-input"
import { HpDicePanel } from "@/features/dice-roller/components/hp-dice-panel"
import { parseHpDiceFormula, parseStaticHpValue } from "@/features/dice-roller/utils/hp-dice"
import { useInfiniteMonsters } from "@/features/monsters/api/monsters-queries"
import { NpcFormModal } from "@/features/monsters/components/npc-form-modal"
import { NpcPreview } from "@/features/monsters/components/npc-preview"
import type { CreateMonsterSchema } from "@/features/monsters/api/validation"
import type { Monster } from "@/features/monsters/types/monsters.types"
import { getMonsterHitPointAverage } from "@/features/monsters/utils/monster-calculations"
import { getHpBarColor, hpPercent } from "./hp-bar-utils"
import { notifyOwlbearOverlaySync } from "./overlay-sync-events"
import { OwlbearSignInPrompt } from "./owlbear-sign-in-prompt"
import { createOwlbearUserNpc, type OwlbearRoomNpc, type OwlbearRoomNpcSourceKind } from "./room-npcs-api"
import type { OwlbearRuntimeState, OwlbearSessionState } from "./types"
import { useInfiniteOwlbearUserNpcs } from "./use-owlbear-user-npcs"
import { useRoomInitiative } from "./use-room-initiative"
import { useRoomNpcs } from "./use-room-npcs"

type PickerMode = "userNpc" | "monster"

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

/**
 * @deprecated Use `getHpBarColor` from `./hp-bar-utils` directly.
 * Mantido para compatibilidade com testes existentes.
 */
export function getNpcHpBarColor(current: number, max: number) {
    return getHpBarColor(current, max)
}

function getSourceLabel(sourceKind: OwlbearRoomNpcSourceKind) {
    return sourceKind === "userNpc" ? "NPC" : "Monstro"
}

function NpcAvatar({ monster }: { monster: Monster | null }) {
    if (monster?.image) {
        return <GlassImage src={monster.image} alt={monster.name} className="h-12 w-12 rounded-lg" imageClassName="object-cover" enableExpand={false} />
    }
    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
            <Skull className="h-5 w-5 text-white/35" />
        </div>
    )
}

function HpAdjustmentInput({
    npc,
    onApply,
}: {
    npc: OwlbearRoomNpc
    onApply: (npc: OwlbearRoomNpc, delta: number) => void
}) {
    const [value, setValue] = React.useState("")

    return (
        <input
            aria-label={`Ajustar vida de ${npc.source?.name ?? "NPC"}`}
            type="text"
            inputMode="numeric"
            value={value}
            placeholder="+/-"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
                const next = event.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "")
                setValue(next)
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                event.stopPropagation()
                if (!/^-?\d+$/.test(value)) return
                onApply(npc, Number(value))
                setValue("")
            }}
            className="h-9 w-20 rounded-lg border border-white/10 bg-black/20 px-2 text-center text-sm font-semibold text-white outline-none [appearance:textfield] placeholder:text-white/25 focus:border-emerald-300/40"
        />
    )
}

function RoomNpcRow({
    npc,
    duplicateIndex,
    isExpanded,
    isPending,
    onToggle,
    onApplyHpDelta,
    onAddToInitiative,
    onRequestRemove,
}: {
    npc: OwlbearRoomNpc
    duplicateIndex?: number
    isExpanded: boolean
    isPending: boolean
    onToggle: () => void
    onApplyHpDelta: (npc: OwlbearRoomNpc, delta: number) => void
    onAddToInitiative: (npc: OwlbearRoomNpc) => void
    onRequestRemove: (npc: OwlbearRoomNpc) => void
}) {
    const source = npc.source
    const percent = hpPercent(npc.hpCurrent, npc.hpMax)
    const width = `${percent}%`
    const hpColor = getNpcHpBarColor(npc.hpCurrent, npc.hpMax)

    return (
        <div className="rounded-2xl border border-white/10 bg-black/20">
            <button
                type="button"
                onClick={onToggle}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.03]"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <NpcAvatar monster={source} />
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <motion.span
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </motion.span>
                            <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-white">{source?.name ?? "NPC indisponível"}</p>
                                {duplicateIndex !== undefined && (
                                    <span className="inline-flex h-5 items-center justify-center rounded-full bg-white/10 px-2 text-[10px] font-bold text-white/70">
                                        {duplicateIndex}
                                    </span>
                                )}
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/35">
                                {getSourceLabel(npc.sourceKind)}
                            </span>
                        </div>
                        <div className="mt-2 w-56 shrink-0" data-testid={`npc-hp-bar-track-${npc.id}`}>
                            <div className="mb-1 text-xs font-medium text-white/60">
                                {npc.hpCurrent}/{npc.hpMax} PV
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                    data-testid={`npc-hp-bar-${npc.id}`}
                                    className="h-full rounded-full transition-all"
                                    style={{ width, backgroundColor: hpColor }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <HpAdjustmentInput npc={npc} onApply={onApplyHpDelta} />

                <SimpleGlassTooltip content="Adicionar a iniciativa" side="top">
                    <button
                        type="button"
                        aria-label={`Adicionar ${source?.name ?? "NPC"} a iniciativa`}
                        disabled={isPending}
                        onClick={(event) => {
                            event.stopPropagation()
                            onAddToInitiative(npc)
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-500/10 text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                    >
                        <Swords className="h-4 w-4" />
                    </button>
                </SimpleGlassTooltip>

                <button
                    type="button"
                    aria-label={`Remover ${source?.name ?? "NPC"}`}
                    disabled={isPending}
                    onClick={(event) => {
                        event.stopPropagation()
                        onRequestRemove(npc)
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        key="preview"
                        initial={{ height: 0, opacity: 0, y: -8 }}
                        animate={{ height: "auto", opacity: 1, y: 0 }}
                        exit={{ height: 0, opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden border-t border-white/10"
                    >
                        <div className="p-4">
                            {source ? (
                                <NpcPreview
                                    monster={source}
                                    entityType={npc.sourceKind === "userNpc" ? "NPC" : "Monstro"}
                                    hideActionIcons
                                />
                            ) : (
                                <InlineStatus tone="error" message="O NPC ou monstro vinculado não está mais disponível." />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function MonsterPickerModal({
    mode,
    roomId,
    sessionToken,
    isOpen,
    onClose,
    onSelect,
}: {
    mode: PickerMode | null
    roomId: string | null
    sessionToken: string | null
    isOpen: boolean
    onClose: () => void
    onSelect: (monster: Monster, sourceKind: OwlbearRoomNpcSourceKind) => void
}) {
    const [search, setSearch] = React.useState("")
    const sourceKind: OwlbearRoomNpcSourceKind = mode === "monster" ? "monster" : "userNpc"
    const title = mode === "monster" ? "Catálogo de Monstros" : "Meus NPCs"
    const description = mode === "monster"
        ? "Selecione um monstro do catálogo para adicioná-lo à sala."
        : "Selecione um NPC da sua conta para adicioná-lo à sala."
    const filters = React.useMemo(() => ({ search, status: "active" as const }), [search])
    const npcsQuery = useInfiniteOwlbearUserNpcs(roomId, sessionToken, filters, { enabled: isOpen && mode === "userNpc", limit: 12 })
    const monstersQuery = useInfiniteMonsters(filters, { enabled: isOpen && mode === "monster", limit: 12 })
    const query = mode === "monster" ? monstersQuery : npcsQuery
    const items = query.data?.pages.flatMap((page) => page.items) ?? []

    React.useEffect(() => {
        if (!isOpen) {
            setTimeout(() => setSearch(""), 0)
        }
    }, [isOpen])

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="full" className="max-w-3xl">
                <GlassModalHeader>
                    <GlassModalTitle>{title}</GlassModalTitle>
                    <GlassModalDescription>{description}</GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-5 space-y-4">
                    <SearchInput value={search} onChange={setSearch} isLoading={query.isFetching} placeholder="Buscar por nome..." />
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                        {query.isLoading ? (
                            <div className="flex min-h-48 items-center justify-center">
                                <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/50">
                                Nenhum resultado encontrado.
                            </div>
                        ) : (
                            items.map((monster) => (
                                <button
                                    key={monster._id}
                                    type="button"
                                    onClick={() => onSelect(monster, sourceKind)}
                                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.07]"
                                >
                                    <NpcAvatar monster={monster} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-white">{monster.name}</p>
                                        <p className="mt-1 text-xs text-white/45">CR {monster.challengeRating || "0"} • PV {monster.hitPointsFormula}</p>
                                    </div>
                                </button>
                            ))
                        )}
                        {items.length > 0 && (
                            <InfiniteScrollSentinel
                                hasNextPage={!!query.hasNextPage}
                                isFetchingNextPage={!!query.isFetchingNextPage}
                                onLoadMore={() => void query.fetchNextPage()}
                            />
                        )}
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

function InitialHpModal({
    monster,
    sourceKind,
    isOpen,
    isPending,
    onClose,
    onConfirm,
}: {
    monster: Monster | null
    sourceKind: OwlbearRoomNpcSourceKind
    isOpen: boolean
    isPending: boolean
    onClose: () => void
    onConfirm: (sourceKind: OwlbearRoomNpcSourceKind, monster: Monster, hp: number) => Promise<void>
}) {
    const [manualHp, setManualHp] = React.useState<number | "">("")

    const staticHp = React.useMemo(() => monster ? parseStaticHpValue(monster.hitPointsFormula) : null, [monster])
    const average = React.useMemo(() => monster ? getMonsterHitPointAverage(monster.hitPointsFormula) : null, [monster])
    
    const parsedDice = React.useMemo(() => {
        if (!monster) return null
        const parsed = parseHpDiceFormula(monster.hitPointsFormula)
        if (!parsed) return null
        
        if (parsed.modifier === 0 && monster.attributes?.constitution !== undefined) {
            const conMod = Math.floor((monster.attributes.constitution - 10) / 2)
            const numDice = parsed.terms.reduce((acc, term) => acc + term.quantity, 0)
            parsed.modifier = conMod * numDice
        }
        return parsed
    }, [monster])

    React.useEffect(() => {
        if (isOpen && monster) {
            setTimeout(() => {
                if (staticHp !== null) {
                    setManualHp(staticHp)
                } else if (average !== null) {
                    setManualHp(average)
                } else {
                    setManualHp("")
                }
            }, 0)
        }
    }, [isOpen, monster, staticHp, average])

    if (!monster) return null

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="lg">
                <GlassModalHeader>
                    <GlassModalTitle>Definir PV inicial</GlassModalTitle>
                    <GlassModalDescription>
                        Escolha a média ou role os dados de vida para adicionar {monster.name} à sala.
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-sm font-semibold text-white">{monster.name}</p>
                        <p className="mt-1 text-xs text-white/45">Fórmula de PV: {monster.hitPointsFormula}</p>
                    </div>

                    {staticHp !== null && (
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void onConfirm(sourceKind, monster, staticHp)}
                            className="flex w-full items-center justify-between rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-left text-emerald-50 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                            <span className="text-sm font-semibold">Valor fixo</span>
                            <span className="text-lg font-black">{staticHp} PV</span>
                        </button>
                    )}

                    {average !== null && staticHp === null && (
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void onConfirm(sourceKind, monster, average)}
                            className="flex w-full items-center justify-between rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-left text-emerald-50 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                            <span className="text-sm font-semibold">Usar média</span>
                            <span className="text-lg font-black">{average} PV</span>
                        </button>
                    )}

                    {parsedDice && staticHp === null && (
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                            <HpDicePanel
                                label={`PV inicial de ${monster.name}`}
                                terms={parsedDice.terms}
                                modifier={parsedDice.modifier}
                                sourceRef={{ fieldId: "owlbear-npc-hp" }}
                                onRollResolved={(total) => {
                                    void onConfirm(sourceKind, monster, Math.max(0, total))
                                }}
                            />
                        </div>
                    )}

                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <span className="text-sm font-semibold text-white">Manual</span>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <GlassNumberInput
                                    value={manualHp}
                                    onChange={setManualHp}
                                    placeholder="PV"
                                    min={1}
                                    allowEmpty
                                />
                            </div>
                            <GlassButton
                                type="button"
                                disabled={isPending || manualHp === ""}
                                onClick={() => {
                                    if (typeof manualHp === "number") {
                                        void onConfirm(sourceKind, monster, Math.max(0, manualHp))
                                    }
                                }}
                            >
                                Definir
                            </GlassButton>
                        </div>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

function RemoveNpcDialog({
    npc,
    isPending,
    onClose,
    onConfirm,
}: {
    npc: OwlbearRoomNpc | null
    isPending: boolean
    onClose: () => void
    onConfirm: () => void
}) {
    return (
        <GlassModal open={npc !== null} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Remover NPC da sala</GlassModalTitle>
                    <GlassModalDescription>
                        Esta ação remove apenas o vínculo com a sala atual do Owlbear.
                    </GlassModalDescription>
                </GlassModalHeader>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
                    {npc?.source?.name ?? "NPC indisponível"}
                </div>
                <GlassModalFooter className="mt-6">
                    <GlassButton type="button" variant="ghost" disabled={isPending} onClick={onClose}>Cancelar</GlassButton>
                    <GlassButton type="button" variant="danger" disabled={isPending} onClick={onConfirm}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Remover
                    </GlassButton>
                </GlassModalFooter>
            </GlassModalContent>
        </GlassModal>
    )
}

export function OwlbearGmNpcsTab({
    runtime,
    session,
    isAuthenticated,
    isAuthLoaded,
    authBridgeUrl,
    authBridgeStatus,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    isAuthenticated: boolean
    isAuthLoaded: boolean
    authBridgeUrl?: string | null
    authBridgeStatus?: "idle" | "connecting" | "ready" | "received" | "unavailable"
}) {
    const roomId = runtime.roomId
    const { items, isLoading, errorMessage, linkNpc, updateNpc, removeNpc } = useRoomNpcs(
        roomId,
        session.sessionToken,
        runtime.status === "ready" && session.sessionStatus === "ready" && isAuthenticated,
    )
    const { addNpcInitiative } = useRoomInitiative(runtime.status === "ready" && session.sessionStatus === "ready" && isAuthenticated)
    const [search, setSearch] = React.useState("")
    const [expandedId, setExpandedId] = React.useState<string | null>(null)
    const [pickerMode, setPickerMode] = React.useState<PickerMode | null>(null)
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [initialHpTarget, setInitialHpTarget] = React.useState<{ sourceKind: OwlbearRoomNpcSourceKind; monster: Monster } | null>(null)
    const [pendingId, setPendingId] = React.useState<string | null>(null)
    const [npcToRemove, setNpcToRemove] = React.useState<OwlbearRoomNpc | null>(null)
    const [isCreatingNpc, setIsCreatingNpc] = React.useState(false)
    const [isLinking, setIsLinking] = React.useState(false)

    const filteredItems = React.useMemo(() => {
        const available = items.filter((item) => item.source)
        if (!search.trim()) return available
        const fuse = new Fuse(available, {
            keys: ["source.name", "source.originalName", "source.source"],
            threshold: 0.35,
            ignoreLocation: true,
        })
        return fuse.search(search).map((result) => result.item)
    }, [items, search])

    const nameCounts = React.useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of items) {
            if (!item.source) continue
            const name = item.source.name.trim().toLowerCase()
            counts.set(name, (counts.get(name) || 0) + 1)
        }
        return counts
    }, [items])

    const orderedItems = React.useMemo(() => {
        return [...items].sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()
            return dateA - dateB
        })
    }, [items])

    const duplicateIndices = React.useMemo(() => {
        const indices = new Map<string, number>()
        const counters = new Map<string, number>()
        for (const item of orderedItems) {
            if (!item.source) continue
            const name = item.source.name.trim().toLowerCase()
            const count = nameCounts.get(name) || 0
            if (count > 1) {
                const currentIndex = (counters.get(name) || 0) + 1
                counters.set(name, currentIndex)
                indices.set(item.id, currentIndex)
            }
        }
        return indices
    }, [orderedItems, nameCounts])

    const handleSelectMonster = React.useCallback((monster: Monster, sourceKind: OwlbearRoomNpcSourceKind) => {
        setPickerMode(null)
        setInitialHpTarget({ sourceKind, monster })
    }, [])

    const handleConfirmInitialHp = React.useCallback(async (sourceKind: OwlbearRoomNpcSourceKind, monster: Monster, hp: number) => {
        setIsLinking(true)
        try {
            await linkNpc({ sourceKind, sourceId: monster._id, hpCurrent: hp, hpMax: hp })
            setInitialHpTarget(null)
            toast.success(`${monster.name} adicionado à sala.`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível adicionar NPC à sala.")
        } finally {
            setIsLinking(false)
        }
    }, [linkNpc])

    const handleCreateNpc = React.useCallback(async (data: CreateMonsterSchema) => {
        if (!roomId || !session.sessionToken) return

        setIsCreatingNpc(true)
        try {
            const npc = await createOwlbearUserNpc(roomId, session.sessionToken, data)
            setIsFormOpen(false)
            handleSelectMonster(npc, "userNpc")
        } finally {
            setIsCreatingNpc(false)
        }
    }, [handleSelectMonster, roomId, session.sessionToken])

    const handleApplyHpDelta = React.useCallback((npc: OwlbearRoomNpc, delta: number) => {
        const nextHp = Math.max(0, Math.min(npc.hpMax, npc.hpCurrent + delta))
        setPendingId(npc.id)
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
            .finally(() => setPendingId(null))
    }, [updateNpc])

    const handleAddToInitiative = React.useCallback((npc: OwlbearRoomNpc) => {
        const dexterity = npc.source?.attributes?.dexterity ?? 10
        const dexModifier = Math.floor((dexterity - 10) / 2)
        const roll = Math.floor(Math.random() * 20) + 1
        const initiative = roll + dexModifier

        void addNpcInitiative({
            npcId: npc.id,
            initiative,
            roll,
            dexModifier,
        })
            .then(() => {
                toast.success(`${npc.source?.name ?? "NPC"} entrou na iniciativa com ${initiative}.`)
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Não foi possível adicionar NPC à iniciativa.")
            })
    }, [addNpcInitiative])

    const handleRemove = React.useCallback(() => {
        if (!npcToRemove) return
        const npcId = npcToRemove.id
        setPendingId(npcId)
        void removeNpc(npcId)
            .then(() => {
                setNpcToRemove(null)
                setExpandedId((current) => current === npcId ? null : current)
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Não foi possível remover NPC da sala.")
            })
            .finally(() => setPendingId(null))
    }, [npcToRemove, removeNpc])

    if (!isAuthLoaded) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <OwlbearSignInPrompt
                title="Login necessário"
                description="Para gerenciar NPCs da sala, faça login no Dungeons & Dicas em uma aba do navegador e reabra esta action."
                loginUrl={authBridgeUrl}
                bridgeStatus={authBridgeStatus}
            />
        )
    }

    if (runtime.status !== "ready" || session.sessionStatus === "idle" || session.sessionStatus === "loading" || isLoading) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (session.sessionStatus === "error" || !session.sessionToken || !roomId) {
        return <InlineStatus tone="error" message="A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente." />
    }

    return (
        <div className="h-full min-h-0 overflow-auto pr-1">
            <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                        <SearchInput value={search} onChange={setSearch} placeholder="Buscar NPCs da sala..." />
                    </div>
                    <GlassDropdownMenu>
                        <GlassDropdownMenuTrigger asChild>
                            <GlassButton type="button" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Adicionar NPC
                            </GlassButton>
                        </GlassDropdownMenuTrigger>
                        <GlassDropdownMenuContent align="end" className="w-56">
                            <GlassDropdownMenuItem onSelect={() => setIsFormOpen(true)}>
                                <UserRound className="h-4 w-4" />
                                Criar NPC
                            </GlassDropdownMenuItem>
                            <GlassDropdownMenuItem onSelect={() => setPickerMode("userNpc")}>
                                <Shield className="h-4 w-4" />
                                Meus NPCs
                            </GlassDropdownMenuItem>
                            <GlassDropdownMenuItem onSelect={() => setPickerMode("monster")}>
                                <BookOpen className="h-4 w-4" />
                                Catálogo de Monstros
                            </GlassDropdownMenuItem>
                        </GlassDropdownMenuContent>
                    </GlassDropdownMenu>
                </div>

                {errorMessage && <InlineStatus tone="error" message={errorMessage} />}

                {filteredItems.length === 0 ? (
                    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8">
                        <div className="max-w-xl text-center">
                            <Shield className="mx-auto h-10 w-10 text-white/35" />
                            <h2 className="mt-4 text-xl font-semibold text-white">Nenhum NPC vinculado</h2>
                            <p className="mt-3 text-sm leading-6 text-white/60">
                                Adicione NPCs ou monstros à sala para controlar PV e consultar a ficha durante a sessão.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2" data-testid="gm-room-npcs-table">
                        {filteredItems.map((npc) => (
                            <RoomNpcRow
                                key={npc.id}
                                npc={npc}
                                duplicateIndex={duplicateIndices.get(npc.id)}
                                isExpanded={expandedId === npc.id}
                                isPending={pendingId === npc.id}
                                onToggle={() => setExpandedId((current) => current === npc.id ? null : npc.id)}
                                onApplyHpDelta={handleApplyHpDelta}
                                onAddToInitiative={handleAddToInitiative}
                                onRequestRemove={setNpcToRemove}
                            />
                        ))}
                    </div>
                )}
            </div>

            <NpcFormModal
                npc={null}
                isOpen={isFormOpen}
                onClose={() => {
                    if (!isCreatingNpc) setIsFormOpen(false)
                }}
                onSave={handleCreateNpc}
                isSubmitting={isCreatingNpc}
                title="Criar NPC"
                subtitle="Crie um NPC na sua conta e adicione-o à sala do Owlbear."
                entityLabel="NPC"
                sourceDefault="Homebrew"
            />

            <MonsterPickerModal
                mode={pickerMode}
                roomId={roomId}
                sessionToken={session.sessionToken}
                isOpen={pickerMode !== null}
                onClose={() => setPickerMode(null)}
                onSelect={handleSelectMonster}
            />

            <InitialHpModal
                monster={initialHpTarget?.monster ?? null}
                sourceKind={initialHpTarget?.sourceKind ?? "userNpc"}
                isOpen={initialHpTarget !== null}
                isPending={isLinking}
                onClose={() => {
                    if (!isLinking) setInitialHpTarget(null)
                }}
                onConfirm={handleConfirmInitialHp}
            />

            <RemoveNpcDialog
                npc={npcToRemove}
                isPending={pendingId === npcToRemove?.id}
                onClose={() => {
                    if (!pendingId) setNpcToRemove(null)
                }}
                onConfirm={handleRemove}
            />
        </div>
    )
}
