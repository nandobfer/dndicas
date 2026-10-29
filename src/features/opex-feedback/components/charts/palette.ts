import type { ColumnColor } from "../../types"

/** Paleta dos gráficos: só variáveis do tema (nunca cor fixa no código). */
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"] as const

export function colorAt(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length]!
}

/** Cor da coluna do quadro (token do tema) para a rosca de distribuição. */
export const COLUMN_CHART_COLORS: Record<ColumnColor, string> = {
    violet: "var(--color-violet-400)",
    sky: "var(--color-sky-400)",
    emerald: "var(--color-emerald-400)",
    amber: "var(--color-amber-400)",
    rose: "var(--color-rose-400)",
    cyan: "var(--color-cyan-400)",
    orange: "var(--color-orange-400)",
    pink: "var(--color-pink-400)",
    lime: "var(--color-lime-400)",
    zinc: "var(--color-zinc-400)",
}
