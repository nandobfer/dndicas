"use client"

import * as React from "react"
import { Compass, Library, Shield, Users } from "lucide-react"
import { LiquidGlassBackground } from "@/components/ui/glass-background"
import { GlassSelector } from "@/components/ui/glass-selector"
import { cn } from "@/core/utils"
import { colors } from "@/lib/config/colors"
import { setActionPopoverSize } from "./sdk"
import { useOwlbearRuntime } from "./use-owlbear-runtime"
import { useOwlbearSession } from "./use-owlbear-session"
import { CatalogDashboardFrame } from "./catalog-dashboard-frame"
import { OwlbearPlayerSheetTab } from "./player-sheet-tab"
import { OwlbearGmSheetsTab } from "./gm-sheets-tab"
import { OwlbearGmSceneController } from "./gm-scene-controller"
import type { OwlbearRole, OwlbearSheetViewMode, OwlbearTabId } from "./types"

type TabDefinition = {
    id: OwlbearTabId
    label: string
    icon: React.ComponentType<{ className?: string }>
    activeColorHex: string
    textColorHex: string
}

const GM_TABS: TabDefinition[] = [
    { id: "catalogo", label: "Catálogo", icon: Library, activeColorHex: colors.rarity.rare, textColorHex: colors.rarity.rare },
    { id: "fichas", label: "Fichas", icon: Users, activeColorHex: colors.rarity.veryRare, textColorHex: colors.rarity.veryRare },
    { id: "npcs", label: "NPCs", icon: Shield, activeColorHex: colors.rarity.legendary, textColorHex: colors.rarity.legendary },
]

const PLAYER_TABS: TabDefinition[] = [
    { id: "catalogo", label: "Catálogo", icon: Library, activeColorHex: colors.rarity.rare, textColorHex: colors.rarity.rare },
    { id: "ficha", label: "Ficha", icon: Compass, activeColorHex: colors.rarity.veryRare, textColorHex: colors.rarity.veryRare },
]

function getTabsForRole(role: OwlbearRole | null) {
    if (role === "GM") return GM_TABS
    if (role === "PLAYER") return PLAYER_TABS
    return [{
        id: "catalogo",
        label: "Catálogo",
        icon: Library,
        activeColorHex: colors.rarity.rare,
        textColorHex: colors.rarity.rare,
    }] satisfies TabDefinition[]
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-8">
            <div className="max-w-xl text-center">
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>
            </div>
        </div>
    )
}

function RuntimeBanner({
    status,
}: {
    status: "booting" | "ready" | "unavailable"
}) {
    if (status !== "unavailable") return null

    return <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100">SDK Owlbear indisponível nesta action.</div>
}

export function OwlbearShell() {
    const runtime = useOwlbearRuntime()
    const { session, isAuthLoaded, isAuthenticated } = useOwlbearSession(runtime)
    const tabs = React.useMemo(() => getTabsForRole(runtime.role), [runtime.role])
    const [activeTab, setActiveTab] = React.useState<OwlbearTabId>("catalogo")
    const [sheetViewMode, setSheetViewMode] = React.useState<OwlbearSheetViewMode>("picker")

    const resizeForTab = React.useCallback((tabId: OwlbearTabId, nextSheetViewMode = sheetViewMode) => {
        if (runtime.status !== "ready") return

        const nextTab = tabId === "ficha"
            ? nextSheetViewMode === "editor"
                ? "ficha-editor"
                : "ficha-picker"
            : tabId

        void setActionPopoverSize(nextTab)
    }, [runtime.status, sheetViewMode])

    React.useEffect(() => {
        if (!tabs.some((tab) => tab.id === activeTab)) {
            setActiveTab("catalogo")
        }
    }, [activeTab, tabs])

    React.useEffect(() => {
        resizeForTab(activeTab, sheetViewMode)
    }, [activeTab, resizeForTab, sheetViewMode])

    React.useEffect(() => {
        if (runtime.status === "unavailable") {
            void setActionPopoverSize("fallback")
        }
    }, [runtime.status])

    return (
        <div
            data-testid="owlbear-shell"
            data-theme={runtime.themeMode}
            className={cn(
                "relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-white",
                runtime.themeMode === "light" && "text-slate-950"
            )}
        >
            <LiquidGlassBackground />

            <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden p-4">
                <RuntimeBanner status={runtime.status} />
                <OwlbearGmSceneController runtime={runtime} session={session} isAuthenticated={isAuthenticated} />

                <div className="rounded-3xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm">
                    <GlassSelector
                        value={activeTab}
                        onChange={(value) => {
                            const nextTab = value as OwlbearTabId
                            setActiveTab(nextTab)
                            resizeForTab(nextTab)
                        }}
                        options={tabs.map((tab) => {
                            const Icon = tab.icon
                            return {
                                value: tab.id,
                                label: (
                                    <span className="inline-flex items-center gap-2">
                                        <Icon className="h-4 w-4" />
                                        <span>{tab.label}</span>
                                    </span>
                                ),
                                activeColor: tab.activeColorHex,
                                textColor: tab.textColorHex,
                            }
                        })}
                        size="normal"
                        layoutId="owlbear-shell-tabs"
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                    <div className={cn("h-full min-h-0", activeTab === "catalogo" ? "block" : "hidden")} aria-hidden={activeTab !== "catalogo"}>
                        <CatalogDashboardFrame />
                    </div>
                    {tabs.some((tab) => tab.id === "ficha") && (
                        <div className={cn("h-full min-h-0", activeTab === "ficha" ? "block" : "hidden")} aria-hidden={activeTab !== "ficha"}>
                            <OwlbearPlayerSheetTab
                                runtime={runtime}
                                session={session}
                                isAuthenticated={isAuthenticated}
                                isAuthLoaded={isAuthLoaded}
                                onViewModeChange={setSheetViewMode}
                            />
                        </div>
                    )}
                    {tabs.some((tab) => tab.id === "fichas") && (
                        <div className={cn("h-full min-h-0", activeTab === "fichas" ? "block" : "hidden")} aria-hidden={activeTab !== "fichas"}>
                            <OwlbearGmSheetsTab session={session} />
                        </div>
                    )}
                    {tabs.some((tab) => tab.id === "npcs") && (
                        <div className={cn("h-full min-h-0", activeTab === "npcs" ? "block" : "hidden")} aria-hidden={activeTab !== "npcs"}>
                            <PlaceholderPanel title="NPCs da sala" description="O CRUD de NPCs locais e seus vínculos com tokens permanece fora desta etapa inicial." />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
