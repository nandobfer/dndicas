"use client"

import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { formatTokens, formatUsd } from "../opencode-usage"

const HEADER = "p-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
const CELL = "p-2 align-middle"

/** Uma linha de consumo: um recurso (origem ou feature de IA) no período consultado. */
export interface UsageBreakdownRow {
    key: string
    label: string
    requests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export type UsageBreakdownTotals = Omit<UsageBreakdownRow, "key" | "label">

interface UsageBreakdownTableProps {
    firstColumnLabel: string
    rows: UsageBreakdownRow[]
    total: UsageBreakdownTotals
}

function Tokens({ value }: { value: number | null }) {
    return value === null ? <span className="text-muted-foreground" title="Métrica não informada">—</span> : <AnimatedNumber value={value} formatter={formatTokens} duration={0.2} />
}

function Cost({ value }: { value: number | null }) {
    return value === null ? <span className="text-muted-foreground" title="Métrica não informada">—</span> : <AnimatedNumber value={value} formatter={formatUsd} duration={0.2} />
}

function Row({ label, row, bold }: { label: string; row: UsageBreakdownTotals; bold?: boolean }) {
    return (
        <tr className={bold ? "border-t bg-muted/30 font-semibold" : "border-t"}>
            <td className={CELL}>{label}</td>
            <td className={`${CELL} tabular-nums`}>{row.requests.toLocaleString("pt-BR")}</td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.inputTokens} /></td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.outputTokens} /></td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.totalTokens} /></td>
            <td className={`${CELL} tabular-nums`}><Cost value={row.costUsd} /></td>
        </tr>
    )
}

/**
 * Tabela de consumo segmentada por recurso, usada pelos painéis do OpenCode (origem) e do JEV
 * (feature de IA). Métricas desconhecidas aparecem como `—`, nunca como zero.
 */
export function UsageBreakdownTable({ firstColumnLabel, rows, total }: UsageBreakdownTableProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr>
                        <th className={HEADER}>{firstColumnLabel}</th>
                        <th className={HEADER}>Chamadas</th>
                        <th className={HEADER}>Entrada</th>
                        <th className={HEADER}>Saída</th>
                        <th className={HEADER}>Total</th>
                        <th className={HEADER}>Custo (USD)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => <Row key={row.key} label={row.label} row={row} />)}
                    <Row label="Total" row={total} bold />
                </tbody>
            </table>
        </div>
    )
}
