"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassSheetCard } from "@/components/ui/glass-sheet-card"
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { SheetForm } from "@/features/character-sheets/components/sheet-form"
import { CharacterSheetClientProvider } from "@/features/character-sheets/api/character-sheet-client-config"
import { useSheet } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import { MySheetsContent } from "@/app/(dashboard)/my-sheets/_components/my-sheets-content"
import {
    clearPlayerSheetLink,
    getRoomMetadataState,
    setPlayerSheetLink,
    subscribeToRoomMetadata,
} from "./sdk"
import type { OwlbearRuntimeState, OwlbearSessionState, OwlbearSheetViewMode } from "./types"

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

function LinkSheetDialog({
    isOpen,
    onClose,
    sheet,
    isPending,
    onConfirm,
}: {
    isOpen: boolean
    onClose: () => void
    sheet: CharacterSheet | null
    isPending: boolean
    onConfirm: () => void
}) {
    if (!sheet) return null

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Vincular Ficha</GlassModalTitle>
                    <GlassModalDescription>
                        Esta ficha será aberta sempre que você acessar a aba Ficha nesta sala do Owlbear.
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Ficha selecionada</p>
                        <GlassSheetCard
                            sheet={sheet}
                            showDelete={false}
                            interactive={false}
                        />
                    </div>

                    <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
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
                            disabled={isPending}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                                "bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isPending ? "Vinculando..." : "Vincular ficha"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

function PlayerSheetTabContent({
    runtime,
    session,
    isAuthenticated,
    isAuthLoaded,
    onViewModeChange,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    isAuthenticated: boolean
    isAuthLoaded: boolean
    onViewModeChange?: (mode: OwlbearSheetViewMode) => void
}) {
    const [linkedSheetId, setLinkedSheetId] = React.useState<string | null>(null)
    const [metadataLoaded, setMetadataLoaded] = React.useState(false)
    const [selectedExistingSheet, setSelectedExistingSheet] = React.useState<CharacterSheet | null>(null)
    const [isLinking, setIsLinking] = React.useState(false)
    const [notice, setNotice] = React.useState<string | null>(null)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const recoveringMissingLinkRef = React.useRef(false)
    const noticeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    const sheetQuery = useSheet(linkedSheetId)

    const showTemporaryNotice = React.useCallback((message: string) => {
        setNotice(message)
        if (noticeTimeoutRef.current) {
            clearTimeout(noticeTimeoutRef.current)
        }

        noticeTimeoutRef.current = setTimeout(() => {
            setNotice((current) => current === message ? null : current)
            noticeTimeoutRef.current = null
        }, 3000)
    }, [])

    React.useEffect(() => {
        return () => {
            if (noticeTimeoutRef.current) {
                clearTimeout(noticeTimeoutRef.current)
            }
        }
    }, [])

    React.useEffect(() => {
        if (runtime.status !== "ready" || session.sessionStatus !== "ready" || !runtime.playerId || !isAuthenticated) {
            return
        }

        const playerId = runtime.playerId
        let active = true
        let unsubscribe: (() => void) | undefined

        void (async () => {
            try {
                const metadata = await getRoomMetadataState()
                if (!active) return
                setLinkedSheetId(metadata.playerLinks[playerId] ?? null)
                setMetadataLoaded(true)
            } catch (error) {
                console.error("Failed to load Owlbear room metadata", error)
                if (!active) return
                setErrorMessage("Não foi possível ler o vínculo da sala no Owlbear.")
                setMetadataLoaded(true)
                return
            }

            try {
                unsubscribe = await subscribeToRoomMetadata((nextMetadata) => {
                    if (!active) return
                    setLinkedSheetId(nextMetadata.playerLinks[playerId] ?? null)
                })
            } catch (error) {
                console.error("Failed to subscribe to Owlbear room metadata", error)
            }
        })()

        return () => {
            active = false
            unsubscribe?.()
        }
    }, [isAuthenticated, runtime.playerId, runtime.status, session.sessionStatus])

    React.useEffect(() => {
        if (!isAuthLoaded || !isAuthenticated || session.sessionStatus !== "ready") {
            onViewModeChange?.("picker")
            return
        }

        onViewModeChange?.(linkedSheetId ? "editor" : "picker")
    }, [isAuthLoaded, isAuthenticated, linkedSheetId, onViewModeChange, session.sessionStatus])

    React.useEffect(() => {
        if (!linkedSheetId || !sheetQuery.isError || recoveringMissingLinkRef.current || !runtime.playerId) return

        const playerId = runtime.playerId
        const message = sheetQuery.error instanceof Error ? sheetQuery.error.message : ""
        if (!message.includes("Ficha não encontrada")) return

        recoveringMissingLinkRef.current = true
        void (async () => {
            try {
                await clearPlayerSheetLink(playerId)
                setLinkedSheetId(null)
                setNotice("A ficha vinculada não existe mais. Escolha outra ficha para esta sala.")
            } catch (error) {
                console.error("Failed to clear invalid player link", error)
                setErrorMessage("A ficha vinculada não existe mais, mas o vínculo da sala não pôde ser limpo automaticamente.")
            } finally {
                recoveringMissingLinkRef.current = false
            }
        })()
    }, [linkedSheetId, runtime.playerId, sheetQuery.error, sheetQuery.isError])

    const handleConfirmExisting = React.useCallback(async () => {
        if (!runtime.playerId || !selectedExistingSheet) return

        setErrorMessage(null)
        setIsLinking(true)
        try {
            await setPlayerSheetLink(runtime.playerId, selectedExistingSheet._id)
            setLinkedSheetId(selectedExistingSheet._id)
            showTemporaryNotice("Ficha vinculada a esta sala do Owlbear.")
            setSelectedExistingSheet(null)
        } catch (error) {
            console.error("Failed to link existing sheet", error)
            setErrorMessage("Não foi possível vincular a ficha selecionada a esta sala.")
        } finally {
            setIsLinking(false)
        }
    }, [runtime.playerId, selectedExistingSheet, showTemporaryNotice])

    const handleCreateAndLink = React.useCallback(async (sheet: CharacterSheet) => {
        if (!runtime.playerId) return

        setNotice(null)
        setErrorMessage(null)
        setIsLinking(true)
        try {
            await setPlayerSheetLink(runtime.playerId, sheet._id)
            setLinkedSheetId(sheet._id)
            showTemporaryNotice("Ficha vinculada a esta sala do Owlbear.")
        } catch (error) {
            console.error("Failed to link newly created sheet", error)
            setErrorMessage("A ficha foi criada, mas não pôde ser vinculada automaticamente a esta sala.")
        } finally {
            setIsLinking(false)
        }
    }, [runtime.playerId, showTemporaryNotice])

    if (!isAuthLoaded) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="h-full min-h-0 overflow-auto pr-1">
                <MySheetsContent redirectUrl="/owlbear/action" showDelete={false} />
            </div>
        )
    }

    if (session.sessionStatus === "error" || !session.sessionToken) {
        return <InlineStatus tone="error" message="A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente." />
    }

    if (session.sessionStatus === "loading" || !metadataLoaded) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (errorMessage) {
        return (
            <div className="space-y-4">
                <InlineStatus tone="error" message={errorMessage} />
                {!linkedSheetId && (
                    <>
                        <MySheetsContent
                            title="Minhas Fichas"
                            description="Selecione uma ficha existente ou crie uma nova para vinculá-la a esta sala do Owlbear."
                            redirectUrl="/owlbear/action"
                            showDelete={false}
                            onSheetOpen={(sheet) => {
                                setSelectedExistingSheet(sheet)
                            }}
                            onSheetCreated={(sheet) => void handleCreateAndLink(sheet)}
                        />
                        <LinkSheetDialog
                            isOpen={selectedExistingSheet !== null}
                            sheet={selectedExistingSheet}
                            isPending={isLinking}
                            onClose={() => {
                                if (isLinking) return
                                setSelectedExistingSheet(null)
                            }}
                            onConfirm={() => void handleConfirmExisting()}
                        />
                    </>
                )}
            </div>
        )
    }

    if (!linkedSheetId) {
        return (
            <div className="space-y-4">
                {notice && <InlineStatus message={notice} />}

                <MySheetsContent
                    title="Minhas Fichas"
                    description="Selecione uma ficha existente ou crie uma nova para vinculá-la a esta sala do Owlbear."
                    redirectUrl="/owlbear/action"
                    showDelete={false}
                    emptyMessage="Nenhuma ficha encontrada. Crie sua primeira ficha para vinculá-la a esta sala."
                    onSheetOpen={(sheet) => {
                        setNotice(null)
                        setSelectedExistingSheet(sheet)
                    }}
                    onSheetCreated={(sheet) => void handleCreateAndLink(sheet)}
                />

                <LinkSheetDialog
                    isOpen={selectedExistingSheet !== null}
                    sheet={selectedExistingSheet}
                    isPending={isLinking}
                    onClose={() => {
                        if (isLinking) return
                        setSelectedExistingSheet(null)
                    }}
                    onConfirm={() => void handleConfirmExisting()}
                />
            </div>
        )
    }

    if (sheetQuery.isLoading && !sheetQuery.data) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
        )
    }

    if (sheetQuery.isError || !sheetQuery.data) {
        return (
            <InlineStatus
                tone="error"
                message="Não foi possível carregar a ficha vinculada no Dndicas."
            />
        )
    }

    return (
        <div className="h-full min-h-0 overflow-auto pr-1">
            {notice && (
                <div className="mb-4">
                    <InlineStatus message={notice} />
                </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <SheetForm
                    sheet={sheetQuery.data}
                    layoutMode="desktop"
                    navigateOnSlugChange={false}
                    onSlugChange={() => undefined}
                    runtimeContext="owlbear"
                />
            </div>
        </div>
    )
}

export function OwlbearPlayerSheetTab({
    runtime,
    session,
    isAuthenticated,
    isAuthLoaded,
    onViewModeChange,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    isAuthenticated: boolean
    isAuthLoaded: boolean
    onViewModeChange?: (mode: OwlbearSheetViewMode) => void
}) {
    const clientConfig = React.useMemo(() => ({
        apiBase: "/api/owlbear/character-sheets",
        getHeaders: () => session.sessionToken
            ? { Authorization: `Bearer ${session.sessionToken}` }
            : {} as Record<string, string>,
    }), [session.sessionToken])

    return (
        <CharacterSheetClientProvider config={clientConfig}>
            <PlayerSheetTabContent
                runtime={runtime}
                session={session}
                isAuthenticated={isAuthenticated}
                isAuthLoaded={isAuthLoaded}
                onViewModeChange={onViewModeChange}
            />
        </CharacterSheetClientProvider>
    )
}
