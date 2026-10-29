import { endOfDay, isValid, parseISO, startOfDay } from "date-fns"
import { z } from "zod"

const optionalDate = z.preprocess((value) => (value === "" || value === null ? undefined : value), z.iso.datetime({ offset: true, error: "Data inválida" }).optional())
export const opencodeUsageQuerySchema = z.object({ from: optionalDate, to: optionalDate }).refine(
    (query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to),
    { message: "O início do período deve ser anterior ao fim", path: ["to"] },
)
export type OpencodeUsageQuery = z.infer<typeof opencodeUsageQuerySchema>

/** Rótulos das origens do consumo medido (agentes de IA do DnDicas). */
export const AI_CONSUMPTION_ORIGIN_LABELS: Record<string, string> = {
    "image-generator": "Gerador de imagens",
    "entity-understanding": "Entender com IA",
    "entity-import": "Importador 5etools",
    "memory-summary": "Resumo de memórias",
    "opex-agent": "Agente Opex",
    "opex-anonymous-agent": "Agente Opex (visitantes)",
    "opex-title": "Agente Opex (títulos)",
}

export function aiConsumptionOriginLabel(origin: string): string {
    return AI_CONSUMPTION_ORIGIN_LABELS[origin] ?? origin
}

/** Uma linha do painel: consumo de uma origem no período. Métricas ausentes ficam `null`. */
export interface OpencodeUsageOriginRow {
    origin: string
    label: string
    requests: number
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export interface OpencodeUsageSummary {
    origins: OpencodeUsageOriginRow[]
    total: Omit<OpencodeUsageOriginRow, "origin" | "label">
    /** Início da cobertura: instante do registro mais antigo, independente do período. */
    coverageFrom: string | null
}

/** Datas do calendário são locais; a API recebe instantes ISO, incluindo o dia final inteiro. */
export function opencodeUsageRangeQuery(from: string, to: string): OpencodeUsageQuery | null {
    const convert = (value: string, end: boolean) => {
        if (!value) return undefined
        const date = parseISO(value)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(date)) return null
        return (end ? endOfDay(date) : startOfDay(date)).toISOString()
    }
    const start = convert(from, false)
    const end = convert(to, true)
    if (start === null || end === null) return null
    const parsed = opencodeUsageQuerySchema.safeParse({ from: start, to: end })
    return parsed.success ? parsed.data : null
}

export const formatUsd = (value: number) => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 9,
}).format(value)

export const formatTokens = (value: number) => new Intl.NumberFormat("pt-BR").format(value)
