"use client"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { useOpexFeedbackAccess, OpexApiError } from "../hooks/useOpexFeedbackAccess"
import { useOpexFeedbackDashboard } from "../hooks/useOpexFeedbackDashboard"
import { formatBrl, formatCount, formatHours } from "../format"
import { DashboardHeader } from "./DashboardHeader"
import { DashboardKpis, type DashboardKpiItem } from "./DashboardKpis"
import { ClienteTasksOverviewSection } from "./TasksOverviewSection"
import { ClienteFinanceSection } from "./FinanceSection"
import { OpexFeedbackSkeleton } from "./OpexFeedbackSkeleton"
import { OpexAccessSummary } from "./OpexAccessSummary"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

export function OpexFeedbackPage() {
    const { isLoaded, isSignedIn, userId, isAdmin } = useAuth()
    const reduceMotion = useReducedMotion()
    const access = useOpexFeedbackAccess(userId ?? undefined, isLoaded && isSignedIn)
    const { period, setPeriod, ready, query } = useOpexFeedbackDashboard(userId ?? undefined, isSignedIn && Boolean(access.data))
    const data = query.data
    const view = !ready || query.isLoading ? "loading" : query.isError ? "error" : !data ? "empty" : "ready"
    const kpis: DashboardKpiItem[] = data ? [
        { label: "Tarefas ativas", hint: "Não arquivadas", value: data.tasksActive, formatter: formatCount },
        { label: "Criadas", hint: "No período", value: data.tasksCreated, formatter: formatCount },
        { label: "Concluídas", hint: "No período", value: data.tasksCompleted, formatter: formatCount },
        ...(data.finance ? [
            { label: "Custo", hint: "No período", value: data.finance.totals.totalCostBrl, formatter: formatBrl },
            { label: "Horas", hint: "No período", value: data.finance.totals.totalClientHours, formatter: formatHours },
            { label: "Serviços", hint: "No período", value: data.finance.totals.serviceCount, formatter: formatCount },
        ] : []),
    ] : []
    if (!isLoaded) return <OpexFeedbackSkeleton />
    if (!isSignedIn) return <section className="space-y-4"><h1 className="text-2xl font-semibold">Feedback</h1><p>Entre para acessar a central de feedback.</p><Button asChild><Link href="/sign-in?redirect_url=%2Ffeedback">Entrar</Link></Button></section>
    if (access.isError) return <section><ErrorState title="Não foi possível acessar a central de feedback" description={access.error.message} onRetry={() => void access.refetch()} />{isAdmin && access.error instanceof OpexApiError && access.error.code === "OPEX_NOT_CONFIGURED" && <Button asChild><Link href="/integracoes/opex">Configurar Tarefas Opex</Link></Button>}</section>
    if (!access.data) return <OpexFeedbackSkeleton />
    return <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-6">
        <OpexAccessSummary access={access.data} />
        <DashboardHeader title="Feedback" description="Visão das suas tarefas no período" period={period} onPeriodChange={setPeriod} onRefresh={() => void query.refetch()} refreshing={query.isFetching} />
        <AnimatePresence mode="wait" initial={false}><motion.div key={view} {...swap} className="space-y-6">
            {view === "loading" && <OpexFeedbackSkeleton admin={access.data.isAdmin} />}
            {view === "error" && <ErrorState title="Não foi possível carregar o dashboard" description={query.error?.message} onRetry={() => void query.refetch()} />}
            {view === "empty" && <EmptyState icon={LayoutDashboard} title="Nada para mostrar" description="Ajuste o período ou envie uma tarefa no Opex para ver os indicadores." />}
            {view === "ready" && data && <><DashboardKpis items={kpis} /><ClienteTasksOverviewSection data={data} />{data.finance && <ClienteFinanceSection data={data.finance} />}</>}
        </motion.div></AnimatePresence>
    </motion.section>
}
