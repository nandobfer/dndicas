"use client"

import * as React from "react"
import { Compass, Library, Shield, Users } from "lucide-react"
import { cn } from "@/core/utils"
import { setActionPopoverSize } from "./sdk"
import { useOwlbearRuntime } from "./use-owlbear-runtime"
import { CatalogDashboardFrame } from "./catalog-dashboard-frame"
import type { OwlbearRole, OwlbearTabId } from "./types"

type TabDefinition = {
    id: OwlbearTabId
    label: string
    icon: React.ComponentType<{ className?: string }>
}

const GM_TABS: TabDefinition[] = [
    { id: "fichas", label: "Fichas", icon: Users },
    { id: "npcs", label: "NPCs", icon: Shield },
    { id: "catalogo", label: "Catálogo", icon: Library },
]

const PLAYER_TABS: TabDefinition[] = [
    { id: "ficha", label: "Ficha", icon: Compass },
    { id: "catalogo", label: "Catálogo", icon: Library },
]

function getTabsForRole(role: OwlbearRole | null) {
    if (role === "GM") return GM_TABS
    if (role === "PLAYER") return PLAYER_TABS
    return [{ id: "catalogo", label: "Catálogo", icon: Library }] satisfies TabDefinition[]
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
    const tabs = React.useMemo(() => getTabsForRole(runtime.role), [runtime.role])
    const [activeTab, setActiveTab] = React.useState<OwlbearTabId>("catalogo")

    React.useEffect(() => {
        if (!tabs.some((tab) => tab.id === activeTab)) {
            setActiveTab("catalogo")
        }
    }, [activeTab, tabs])

    React.useEffect(() => {
        if (runtime.status !== "ready") return
        void setActionPopoverSize(activeTab)
    }, [activeTab, runtime.status])

    React.useEffect(() => {
        if (runtime.status === "unavailable") {
            void setActionPopoverSize("fallback")
        }
    }, [runtime.status])

    const content = (() => {
        switch (activeTab) {
            case "ficha":
                return <PlaceholderPanel title="Ficha do jogador" description="Esta etapa entrega a shell do plugin. A ficha Owlbear-aware entra nas próximas tasks." />
            case "fichas":
                return <PlaceholderPanel title="Fichas do mestre" description="A listagem e a edição das fichas vinculadas à sala serão implementadas nas próximas etapas da integração." />
            case "npcs":
                return <PlaceholderPanel title="NPCs da sala" description="O CRUD de NPCs locais e seus vínculos com tokens permanece fora desta etapa inicial." />
            case "catalogo":
            default:
                return <CatalogDashboardFrame />
        }
    })()

    return (
        <div
            data-testid="owlbear-shell"
            data-theme={runtime.themeMode}
            className={cn(
                "flex h-dvh min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(2,6,23,1))] text-white",
                runtime.themeMode === "light" && "bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(180deg,_rgba(241,245,249,1),_rgba(226,232,240,1))] text-slate-950"
            )}
        >
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden p-4">
                <RuntimeBanner status={runtime.status} />

                <div className="rounded-3xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm">
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon
                            const isActive = tab.id === activeTab

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                                        isActive ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span>{tab.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
            </div>
        </div>
    )
}
