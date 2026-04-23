"use client"

import * as React from "react"
import { AlertTriangle, Loader2, ScrollText, Unlink2, Users } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassSheetCard } from "@/components/ui/glass-sheet-card"
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { useSheet } from "@/features/character-sheets/api/character-sheets-queries"
import { SheetForm } from "@/features/character-sheets/components/sheet-form"
import { useCharacterSheetRealtime } from "@/features/character-sheets/hooks/use-character-sheet-realtime"
import { CharacterSheetClientProvider } from "@/features/character-sheets/api/character-sheet-client-config"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import type { OwlbearSessionState } from "./types"
import { useRoomLinkedSheets } from "./use-room-linked-sheets"

function InlineStatus({ tone = "neutral", message }: { tone?: "neutral" | "error"; message: string }) {
    return (
        <div
            className={cn(
                "rounded-2xl border px-4 py-3 text-sm",
                tone === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                    : "border-white/10 bg-white/5 text-white/70"
            )}
        >
            {message}
        </div>
    )
}

function EmptyLinkedSheetsState() {
    return (
        <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8">
            <div className="max-w-xl text-center">
                <Users className="mx-auto h-10 w-10 text-white/40" />
                <h2 className="mt-4 text-xl font-semibold text-white">Nenhuma ficha vinculada</h2>
                <p className="mt-3 text-sm leading-6 text-white/60">
                    Quando jogadores vincularem suas fichas nesta sala, elas aparecerão aqui para edição pelo mestre.
                </p>
            </div>
        </div>
    )
}

function RealtimeLinkedSheetCard({
    sheetId,
    previewSheet,
    isSelected,
    unlinkingSheetId,
    onSelect,
    onRequestUnlink,
}: {
    sheetId: string
    previewSheet: CharacterSheet | null
    isSelected: boolean
    unlinkingSheetId: string | null
    onSelect: (sheetId: string) => void
    onRequestUnlink: (sheet: CharacterSheet) => void
}) {
    const sheetQuery = useSheet(sheetId)
    const liveSheet = sheetQuery.data ?? previewSheet

    useCharacterSheetRealtime({
        sheetId,
        currentSlug: liveSheet?.slug ?? previewSheet?.slug ?? "",
        navigateOnSlugChange: false,
    })

    if (!liveSheet) {
        return (
            <div className="w-[320px] shrink-0 rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
                <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
            </div>
        )
    }

    return (
        <div
            className={cn(
                "w-[320px] shrink-0 rounded-[1.35rem] transition-shadow",
                isSelected && "shadow-[0_0_0_1px_rgba(96,165,250,0.55)]",
            )}
        >
            <GlassSheetCard
                sheet={liveSheet}
                onOpen={() => onSelect(sheetId)}
                showDelete
                actionLabel={`Desvincular ${liveSheet.name}`}
                actionIcon={unlinkingSheetId === sheetId ? Loader2 : Unlink2}
                actionTone="warning"
                onAction={() => onRequestUnlink(liveSheet)}
                isActionPending={unlinkingSheetId === sheetId}
            />
        </div>
    )
}

function UnlinkSheetDialog({
    isOpen,
    onClose,
    sheet,
    isUnlinking,
    onConfirm,
}: {
    isOpen: boolean
    onClose: () => void
    sheet: CharacterSheet | null
    isUnlinking: boolean
    onConfirm: () => void
}) {
    if (!sheet) return null

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Desvincular Ficha</GlassModalTitle>
                    <GlassModalDescription>
                        Esta ação remove o vínculo desta ficha com a sala atual do Owlbear.
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                            <div className="text-sm text-white/80">
                                <p className="mb-1 font-medium text-amber-300">A ficha não será excluída.</p>
                                <p>Jogadores poderão vinculá-la novamente depois, se necessário.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10">
                                <ScrollText className="h-6 w-6 text-blue-300" />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <p className="text-xs uppercase tracking-wider text-white/40">Ficha a desvincular</p>
                                <p className="truncate text-base font-semibold text-white">{sheet.name}</p>
                                <p className="text-sm text-white/60">
                                    Nível {sheet.level} · {sheet.class || "Sem classe"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isUnlinking}
                            className={cn(
                                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                                "text-white/60 hover:bg-white/10 hover:text-white",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isUnlinking}
                            className={cn(
                                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                                "bg-amber-600 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-700",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            {isUnlinking && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isUnlinking ? "Desvinculando..." : "Desvincular ficha"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

function GmSheetsTabContent({
    session,
}: {
    session: OwlbearSessionState
}) {
    const { entries, sheets, isLoading, errorMessage, unlinkSheet } = useRoomLinkedSheets(session.sessionToken, session.sessionStatus === "ready")
    const [selectedSheetId, setSelectedSheetId] = React.useState<string | null>(null)
    const [notice, setNotice] = React.useState<string | null>(null)
    const [unlinkingSheetId, setUnlinkingSheetId] = React.useState<string | null>(null)
    const [sheetToUnlink, setSheetToUnlink] = React.useState<CharacterSheet | null>(null)
    const selectedSheetQuery = useSheet(selectedSheetId)
    const linkedSheetIds = React.useMemo(
        () => Array.from(new Set(entries.map((entry) => entry.sheetId))),
        [entries]
    )
    const previewSheetById = React.useMemo(
        () => new Map(sheets.map((sheet) => [sheet._id, sheet])),
        [sheets]
    )

    React.useEffect(() => {
        if (linkedSheetIds.length === 0) {
            setSelectedSheetId(null)
            return
        }

        if (!selectedSheetId || !linkedSheetIds.includes(selectedSheetId)) {
            setSelectedSheetId(linkedSheetIds[0] ?? null)
        }
    }, [linkedSheetIds, selectedSheetId])

    const selectedSheetPreview = React.useMemo(
        () => selectedSheetId ? previewSheetById.get(selectedSheetId) ?? null : null,
        [previewSheetById, selectedSheetId]
    )
    const selectedSheet = selectedSheetQuery.data ?? selectedSheetPreview

    const handleUnlink = React.useCallback(async () => {
        if (!sheetToUnlink) return

        const sheetId = sheetToUnlink._id
        setUnlinkingSheetId(sheetId)
        setNotice(null)
        try {
            await unlinkSheet(sheetId)
            setNotice("Ficha desvinculada desta sala do Owlbear.")
            setSheetToUnlink(null)
        } catch (error) {
            console.error("Failed to unlink GM sheet", error)
            setNotice("Não foi possível desvincular a ficha desta sala.")
        } finally {
            setUnlinkingSheetId(null)
        }
    }, [sheetToUnlink, unlinkSheet])

    if (session.sessionStatus === "error") {
        return (
            <div className="h-full min-h-0 overflow-auto pr-1">
                <InlineStatus tone="error" message="A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente." />
            </div>
        )
    }

    if (session.sessionStatus === "loading" || isLoading) {
        return (
            <div className="flex h-full min-h-0 overflow-auto">
                <div className="flex min-h-[420px] w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                </div>
            </div>
        )
    }

    if (errorMessage) {
        return (
            <div className="h-full min-h-0 overflow-auto pr-1">
                <InlineStatus tone="error" message={errorMessage} />
            </div>
        )
    }

    if (linkedSheetIds.length === 0) {
        return (
            <div className="h-full min-h-0 overflow-auto pr-1">
                <EmptyLinkedSheetsState />
            </div>
        )
    }

    return (
        <div className="h-full min-h-0 overflow-auto pr-1">
            <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 px-2">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Fichas vinculadas</h2>
                    </div>

                    <div
                        data-testid="gm-linked-sheets-strip"
                        className="overflow-x-auto overflow-y-hidden pb-2"
                    >
                        <div className="flex min-w-max gap-3 px-1">
                            {linkedSheetIds.map((sheetId) => (
                                <RealtimeLinkedSheetCard
                                    key={sheetId}
                                    sheetId={sheetId}
                                    previewSheet={previewSheetById.get(sheetId) ?? null}
                                    isSelected={selectedSheetId === sheetId}
                                    unlinkingSheetId={unlinkingSheetId}
                                    onSelect={setSelectedSheetId}
                                    onRequestUnlink={setSheetToUnlink}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div
                    data-testid="gm-selected-sheet-panel"
                    className="rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                    {notice && (
                        <div className="mb-4">
                            <InlineStatus message={notice} />
                        </div>
                    )}

                    {selectedSheetQuery.isLoading && !selectedSheet ? (
                        <div className="flex min-h-[420px] items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                        </div>
                    ) : selectedSheetQuery.isError && !selectedSheet ? (
                        <InlineStatus tone="error" message="Não foi possível carregar a ficha selecionada no Dndicas." />
                    ) : selectedSheet ? (
                        <SheetForm
                            sheet={selectedSheet}
                            layoutMode="desktop"
                            editMode="editable"
                            navigateOnSlugChange={false}
                            onSlugChange={() => undefined}
                            runtimeContext="owlbear"
                        />
                    ) : (
                        <EmptyLinkedSheetsState />
                    )}
                </div>
            </div>

            <UnlinkSheetDialog
                isOpen={sheetToUnlink !== null}
                onClose={() => {
                    if (unlinkingSheetId) return
                    setSheetToUnlink(null)
                }}
                sheet={sheetToUnlink}
                isUnlinking={unlinkingSheetId !== null}
                onConfirm={() => void handleUnlink()}
            />
        </div>
    )
}

export function OwlbearGmSheetsTab({
    session,
}: {
    session: OwlbearSessionState
}) {
    const clientConfig = React.useMemo(() => ({
        apiBase: "/api/owlbear/character-sheets",
        getHeaders: () => session.sessionToken
            ? { Authorization: `Bearer ${session.sessionToken}` }
            : {} as Record<string, string>,
    }), [session.sessionToken])

    return (
        <CharacterSheetClientProvider config={clientConfig}>
            <GmSheetsTabContent session={session} />
        </CharacterSheetClientProvider>
    )
}
