"use client"

import { GlassSelector } from "@/components/ui/glass-selector"
import { preloadDiceBoxAssets } from "@/features/dice-roller/dice-box-loader"
import { colors } from "@/lib/config/colors"
import { Shield, Swords } from "lucide-react"
import * as React from "react"

import { OwlbearGmInitiativeTab } from "./gm-initiative-tab"
import { OwlbearGmNpcsTab } from "./gm-npcs-tab"
import { OwlbearGmSceneController } from "./gm-scene-controller"
import { OwlbearGmSheetsTab } from "./gm-sheets-tab"
import { CenteredStatus, GmOnlyMessage, OwlbearActionFrame } from "./owlbear-action-frame"
import { OwlbearDiceTab } from "./owlbear-dice-tab"
import { OwlbearPlayerSheetTab } from "./player-sheet-tab"
import { useOwlbearRuntime } from "./use-owlbear-runtime"
import { useOwlbearSession } from "./use-owlbear-session"

export { OwlbearCatalogAction, OwlbearLegacyAction } from "./owlbear-catalog-action"

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
    const { session, isAuthLoaded, isAuthenticated, authBridgeUrl, authBridgeStatus } = useOwlbearSession(runtime)

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
                        authBridgeUrl={authBridgeUrl}
                        authBridgeStatus={authBridgeStatus}
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
    const { session, isAuthLoaded, isAuthenticated, authBridgeUrl, authBridgeStatus } = useOwlbearSession(runtime)
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
                        authBridgeUrl={authBridgeUrl}
                        authBridgeStatus={authBridgeStatus}
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
        isAuthenticated: false,
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
