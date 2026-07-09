"use client"

import * as React from "react"
import { Shield, Swords } from "lucide-react"
import { LiquidGlassBackground } from "@/components/ui/glass-background"
import { GlassSelector } from "@/components/ui/glass-selector"
import { cn } from "@/core/utils"
import { preloadDiceBoxAssets } from "@/features/dice-roller/dice-box-loader"
import { colors } from "@/lib/config/colors"
import { CatalogDashboardFrame } from "./catalog-dashboard-frame"
import { logOwlbearDebug } from "./debug"
import { OwlbearGmInitiativeTab } from "./gm-initiative-tab"
import { OwlbearGmNpcsTab } from "./gm-npcs-tab"
import { OwlbearGmSceneController } from "./gm-scene-controller"
import { OwlbearGmSheetsTab } from "./gm-sheets-tab"
import { OwlbearDiceTab } from "./owlbear-dice-tab"
import { OwlbearPlayerSheetTab } from "./player-sheet-tab"
import type { OwlbearRuntimeState } from "./types"
import { useOwlbearRuntime } from "./use-owlbear-runtime"
import { useOwlbearSession } from "./use-owlbear-session"

const CATALOG_RUNTIME_STATE: OwlbearRuntimeState = {
    status: "ready",
    role: null,
    roomId: null,
    playerId: null,
    themeMode: "dark",
    sceneReady: false,
}

function RuntimeBanner({ status }: { status: OwlbearRuntimeState["status"] }) {
    if (status !== "unavailable") return null

    return <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100">SDK Owlbear indisponível nesta action.</div>
}

function GmOnlyMessage({ message }: { message: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            {message}
        </div>
    )
}

function CenteredStatus({ message }: { message: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            {message}
        </div>
    )
}

function OwlbearActionFrame({
    children,
    runtime,
    actionName,
    contentClassName,
}: {
    children: React.ReactNode
    runtime: OwlbearRuntimeState
    actionName: string
    contentClassName?: string
}) {
    React.useEffect(() => {
        logOwlbearDebug("[Dndicas Owlbear Action]", "render", {
            actionName,
            runtimeStatus: runtime.status,
            role: runtime.role,
            roomId: runtime.roomId,
            playerId: runtime.playerId,
            sceneReady: runtime.sceneReady,
        })
    }, [actionName, runtime.playerId, runtime.role, runtime.roomId, runtime.sceneReady, runtime.status])

    return (
        <div
            data-testid="owlbear-action-surface"
            data-theme={runtime.themeMode}
            className={cn(
                "relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-white",
                runtime.themeMode === "light" && "text-slate-950"
            )}
        >
            <LiquidGlassBackground />
            <div
                className={cn(
                    "relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[840px] flex-1 flex-col gap-4 overflow-hidden p-4",
                    contentClassName,
                )}
            >
                <RuntimeBanner status={runtime.status} />
                {children}
            </div>
        </div>
    )
}

export function OwlbearCatalogAction() {
    return (
        <OwlbearActionFrame runtime={CATALOG_RUNTIME_STATE} actionName="catalog" contentClassName="max-w-none p-0">
            <div className="min-h-0 flex-1 overflow-hidden">
                <CatalogDashboardFrame title="Dndicas - catalogo" />
            </div>
        </OwlbearActionFrame>
    )
}

export function OwlbearDiceAction() {
    const runtime = useOwlbearRuntime()
    const { session } = useOwlbearSession(runtime)

    React.useEffect(() => {
        preloadDiceBoxAssets()
    }, [])

    return (
        <OwlbearActionFrame runtime={runtime} actionName="dice" contentClassName="max-w-none">
            <div className="min-h-0 flex-1 overflow-hidden">
                <OwlbearDiceTab runtime={runtime} session={session} />
            </div>
        </OwlbearActionFrame>
    )
}

export function OwlbearSheetAction() {
    const runtime = useOwlbearRuntime()
    const { session, isAuthLoaded, isAuthenticated } = useOwlbearSession(runtime)

    return (
        <OwlbearActionFrame runtime={runtime} actionName="sheet" contentClassName="max-w-none">
            <OwlbearGmSceneController
                runtime={runtime}
                session={session}
                contextMenuKind="none"
                linkDialogKind="player"
                overlayKinds={["player"]}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
                {runtime.status !== "ready" ? (
                    <CenteredStatus message="Carregando contexto da sala..." />
                ) : runtime.role === "GM" ? (
                    <OwlbearGmSheetsTab session={session} />
                ) : runtime.role === "PLAYER" ? (
                    <OwlbearPlayerSheetTab
                        runtime={runtime}
                        session={session}
                        isAuthenticated={isAuthenticated}
                        isAuthLoaded={isAuthLoaded}
                    />
                ) : (
                    <CenteredStatus message="Carregando contexto da sala..." />
                )}
            </div>
        </OwlbearActionFrame>
    )
}

type NpcsActionTab = "npcs" | "iniciativa"

const NPCS_ACTION_TABS = [
    {
        value: "npcs",
        label: (
            <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>NPCs</span>
            </span>
        ),
        activeColor: colors.rarity.legendary,
        textColor: colors.rarity.legendary,
    },
    {
        value: "iniciativa",
        label: (
            <span className="inline-flex items-center gap-2">
                <Swords className="h-4 w-4" />
                <span>Iniciativa</span>
            </span>
        ),
        activeColor: colors.rarity.artifact,
        textColor: colors.rarity.artifact,
    },
]

export function OwlbearNpcsAction() {
    const runtime = useOwlbearRuntime()
    const { session, isAuthLoaded, isAuthenticated } = useOwlbearSession(runtime)
    const [activeTab, setActiveTab] = React.useState<NpcsActionTab>("npcs")

    return (
        <OwlbearActionFrame runtime={runtime} actionName="npcs" contentClassName="max-w-none">
            <OwlbearGmSceneController
                runtime={runtime}
                session={session}
                contextMenuKind="none"
                linkDialogKind="npc"
                overlayKinds={["npc"]}
                canUseNpcBackend={isAuthenticated}
            />
            <div className="rounded-3xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm">
                <GlassSelector
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as NpcsActionTab)}
                    options={NPCS_ACTION_TABS}
                    size="normal"
                    layoutId="owlbear-npcs-action-tabs"
                />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                {runtime.status !== "ready" ? (
                    <CenteredStatus message="Carregando contexto da sala..." />
                ) : runtime.role === "PLAYER" ? (
                    <GmOnlyMessage message="Apenas o mestre pode gerenciar NPCs e iniciativa da sala." />
                ) : activeTab === "npcs" ? (
                    <OwlbearGmNpcsTab
                        runtime={runtime}
                        session={session}
                        isAuthenticated={isAuthenticated}
                        isAuthLoaded={isAuthLoaded}
                    />
                ) : (
                    <OwlbearGmInitiativeTab
                        runtime={runtime}
                        session={session}
                        isAuthenticated={isAuthenticated}
                        isAuthLoaded={isAuthLoaded}
                    />
                )}
            </div>
        </OwlbearActionFrame>
    )
}

export function OwlbearContextMenuBackground({ kind }: { kind: "player" | "npc" }) {
    const runtime = useOwlbearRuntime()
    const idleSession = React.useMemo(() => ({
        sessionStatus: "idle" as const,
        sessionToken: null,
        sessionExpiresAt: null,
    }), [])

    return (
        <OwlbearGmSceneController
            runtime={runtime}
            session={idleSession}
            contextMenuKind={kind}
            linkDialogKind="none"
            overlayKinds={[]}
        />
    )
}

export function OwlbearLegacyAction() {
    return <OwlbearCatalogAction />
}
