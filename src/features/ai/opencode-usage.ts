import { endOfDay, isValid, parseISO, startOfDay } from "date-fns"
import { z } from "zod"

const optionalDate = z.preprocess((value) => (value === "" || value === null ? undefined : value), z.iso.datetime({ offset: true, error: "Data inválida" }).optional())
export const opencodeUsageQuerySchema = z.object({ from: optionalDate, to: optionalDate }).refine(
    (query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to),
    { message: "O início do período deve ser anterior ao fim", path: ["to"] },
)
export type OpencodeUsageQuery = z.infer<typeof opencodeUsageQuerySchema>

/** Provedores com painel de consumo medido em `ai_consumption_logs` (mesmo painel, filtrado por provedor). */
export const MEASURED_USAGE_PROVIDERS = ["opencode", "opencode-go"] as const
export type MeasuredUsageProvider = (typeof MEASURED_USAGE_PROVIDERS)[number]

export const MEASURED_USAGE_COPY: Record<MeasuredUsageProvider, { title: string; description: string; empty: string }> = {
    opencode: {
        title: "Consumo do OpenCode",
        description: "Uso originado pelo Opex, separado por origem (features de IA, refinamentos e mesas de desenvolvimento). A medição começou com este painel: o consumo anterior não é somado.",
        empty: "Nenhum uso do OpenCode neste período",
    },
    "opencode-go": {
        title: "Consumo do OpenCode Go",
        description: "Uso das features de IA do DnDicas pela assinatura OpenCode Go, separado por origem. O custo é o informado pelo Go em cada geração e desconta do allowance da assinatura.",
        empty: "Nenhum uso do OpenCode Go neste período",
    },
}

/** Rótulos das origens do consumo medido (agentes de IA do DnDicas). */
export const AI_CONSUMPTION_ORIGIN_LABELS: Record<string, string> = {
    "image-generator": "Gerador de imagens",
    "entity-understanding": "Entender com IA",
    "entity-import": "Importador 5etools",
    "memory-curator": "Curador de memórias (migração para o Engramind)",
    "opex-agent": "Agente Opex",
    "opex-anonymous-agent": "Agente Opex (visitantes)",
    "opex-title": "Agente Opex (títulos)",
    "maddox-interview": "Agente Maddox (entrevistas)",
    "maddox-narration": "Agente Maddox (narração)",
    "maddox-validation": "Agente Maddox (validação de ações)",
    "maddox-combat-prep": "Agente Maddox (preparação do combate)",
    "maddox-combat-adjust": "Agente Maddox (ajustes no combate)",
    "maddox-sneak-attack": "Agente Maddox (ataque furtivo)",
    "maddox-sheet-restore": "Agente Maddox (fichas no reinício da campanha)",
    "maddox-scene-image": "Agente Maddox (imagens nas cenas)",
    "maddox-character-portrait": "Agente Maddox (retratos dos personagens)",
    "maddox-opex-interview": "Personagens Opex (entrevistas)",
    "maddox-opex-turn": "Personagens Opex (mesa)",
    "maddox-opex-combat": "Personagens Opex (combate)",
    "maddox-opex-npc": "NPCs Opex (narração)",
    "maddox-opex-npc-combat": "NPCs Opex (combate)",
    "maddox-opex-memory-reclassify": "Opex (reclassificação das memórias)",
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
