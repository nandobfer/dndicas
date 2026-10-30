"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { LayoutDashboard, RefreshCw, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { DASHBOARD_PERIOD_LABELS, DASHBOARD_PERIODS, type DashboardPeriod } from "../period"

/**
 * Cabeçalho das telas de dashboard (dono e portal do cliente): título com ícone, ações próprias da
 * tela (à esquerda do período), o **período global** (que não quebra linha) e o botão Atualizar (com
 * rotação animada). O dono injeta os atalhos (`TimerIndicator` + `TaskCreationActions`); o portal
 * injeta o seu próprio atalho. Período e ações independem do carregamento dos indicadores.
 */
export function DashboardHeader({
    title,
    description,
    icon: Icon = LayoutDashboard,
    actions,
    period,
    onPeriodChange,
    onRefresh,
    refreshing,
}: {
    title: string
    description: string
    icon?: LucideIcon
    /** Ações da tela, exibidas antes do seletor de período. */
    actions?: ReactNode
    period: DashboardPeriod
    onPeriodChange: (period: DashboardPeriod) => void
    onRefresh: () => void
    refreshing: boolean
}) {
    return (
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                {actions}
                <OptionTabs
                    aria-label="Período"
                    className="w-full md:w-auto md:shrink-0"
                    value={period}
                    onChange={onPeriodChange}
                    options={DASHBOARD_PERIODS.map((value) => ({ value, label: DASHBOARD_PERIOD_LABELS[value] }))}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2 max-md:hidden" onClick={onRefresh} disabled={refreshing} aria-label="Atualizar indicadores">
                    <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>
        </header>
    )
}
