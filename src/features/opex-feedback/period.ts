import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns"
import { z } from "zod"

/**
 * Período global da tela Dashboards (módulo puro, usado no cliente). O usuário escolhe uma opção
 * (7/30/90 dias ou mês atual), persistida no navegador; as datas ISO são recalculadas a cada abertura
 * para não envelhecerem. O intervalo é inclusivo: início do primeiro dia até o fim do dia atual.
 */

export const DASHBOARD_PERIODS = ["7d", "30d", "90d", "month"] as const
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
    "7d": "7 dias",
    "30d": "30 dias",
    "90d": "90 dias",
    month: "Mês atual",
}

export const DASHBOARD_PERIOD_STORAGE_KEY = "opex:cliente:dashboard:period:v1"
export const dashboardPeriodSchema = z.enum(DASHBOARD_PERIODS)
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = "30d"

/** Opção de período → intervalo ISO inclusivo (início do primeiro dia → fim do dia atual). */
export function periodRange(period: DashboardPeriod, now: Date = new Date()): { from: string; to: string } {
    const to = endOfDay(now)
    const from = period === "month" ? startOfMonth(now) : startOfDay(subDays(now, Number(period.replace("d", "")) - 1))
    return { from: from.toISOString(), to: to.toISOString() }
}

/** `true` quando o intervalo cabe em buckets diários (≤ 31 dias); acima disso, semanais. */
export function isDailyRange(from: Date, to: Date): boolean {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000) <= 31
}
