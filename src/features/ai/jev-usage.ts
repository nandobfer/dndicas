import { endOfDay, isValid, parseISO, startOfDay } from "date-fns"
import { z } from "zod"

const optionalDate = z.preprocess((value) => value === "" || value === null ? undefined : value, z.iso.datetime({ offset: true, error: "Data inválida" }).optional())
export const jevUsageQuerySchema = z.object({ from: optionalDate, to: optionalDate }).refine(
    (query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to),
    { message: "O início do período deve ser anterior ao fim", path: ["to"] },
)
export type JevUsageQuery = z.infer<typeof jevUsageQuerySchema>

/** Consumo de uma feature de IA no período. Métricas ausentes ficam `null`. */
export interface JevUsageFeatureRow {
    feature: string
    label: string
    requests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export interface JevUsageSummary {
    requests: number
    failedRequests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    reconstructedRequests: number
    missingTokenRequests: number
    missingCostRequests: number
    /** Uma linha por recurso que consumiu o JEV no período, do maior custo para o menor. */
    features: JevUsageFeatureRow[]
}

/** Datas do calendário são locais; a API recebe instantes ISO, incluindo o dia final inteiro. */
export function jevUsageRangeQuery(from: string, to: string): JevUsageQuery | null {
    const convert = (value: string, end: boolean) => {
        if (!value) return undefined
        const date = parseISO(value)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(date)) return null
        return (end ? endOfDay(date) : startOfDay(date)).toISOString()
    }
    const start = convert(from, false)
    const end = convert(to, true)
    if (start === null || end === null) return null
    const parsed = jevUsageQuerySchema.safeParse({ from: start, to: end })
    return parsed.success ? parsed.data : null
}

export const formatJevCost = (value: number) => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 9,
}).format(value)
