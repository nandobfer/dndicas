import { exhaustionLevel } from "./exhaustion-rules"

/**
 * Descanso curto e longo conduzidos pelo Maddox (DND-58) — módulo PURO, servidor e tela. A recuperação só acontece no fim
 * do descanso e segue a tabela da tarefa: o que o catálogo não descreve não volta, e o motivo vai para o resumo. O plano
 * guarda valores ABSOLUTOS da ficha, para reaplicar sem somar duas vezes.
 */

export const MADDOX_REST_TYPES = ["short", "long"] as const
export type MaddoxRestType = (typeof MADDOX_REST_TYPES)[number]

export const MADDOX_REST_TYPE_LABELS: Record<MaddoxRestType, string> = { short: "Descanso curto", long: "Descanso longo" }

export interface RestChargeRow {
    id: string
    name: string
    total: number
    used: number
    source: { kind: string; entityType: string; entityId: string } | null
}

export interface RestSheet {
    level: number
    hpCurrent: number | null
    hpMax: number | null
    hpTemp: number
    hitDiceTotal: string
    hitDiceUsed: number
    deathSavesSuccess: number
    deathSavesFailure: number
    exhaustion: number
    spellSlots: Record<string, { total: number; used: number }>
    resourceCharges: RestChargeRow[]
}

export interface RestLine {
    label: string
    before: string
    after: string
}

export interface RestMissLine {
    label: string
    reason: string
}

/** Decisão do Maddox sobre uma carga, já conferida contra o catálogo (`recover` = quantas voltam; `all` = todas). */
export interface RestChargeDecision {
    recover: number | "all"
}

export interface RestCatalogDecisions {
    /** chargeId → decisão aceita. */
    charges: Map<string, RestChargeDecision>
    /** chargeId → motivo de não recuperar (decisão recusada ou "nenhuma" com motivo). */
    refusals: Map<string, string>
    /** Descanso curto: o catálogo da classe confirma que os espaços voltam (Magia de Pacto). */
    shortRestSlots: boolean
    /** Motivo quando os espaços do curto não voltam (recusa conferida). */
    shortRestSlotsReason?: string | null
    /** "Seguir sem": o catálogo não pôde ser consultado (cargas e espaços do curto não voltam, com este motivo). */
    unavailable?: boolean
}

export interface RestPlan {
    /** Campos da ficha com os valores absolutos depois do descanso (só os que mudam). */
    set: Record<string, unknown>
    recovered: RestLine[]
    notRecovered: RestMissLine[]
}

export const REST_REASON_MANUAL_CHARGE = "carga manual, sem origem no catálogo"
export const REST_REASON_NO_RULE = "o catálogo não diz como esta carga se recupera"
export const REST_REASON_UNAVAILABLE = "não foi possível consultar o catálogo agora"
export const REST_REASON_SHORT_SLOTS = "o catálogo da classe não diz que os espaços voltam no descanso curto"
export const REST_REASON_LONG_ONLY = "só volta no descanso longo"

export const emptyRestDecisions = (): RestCatalogDecisions => ({ charges: new Map(), refusals: new Map(), shortRestSlots: false })

/**
 * Dados de vida da ficha. A ficha do Maddox grava o tipo da classe ("d8") e o total é o nível; "3d8" vale o número escrito.
 * Multiclasse está fora do escopo (DND-58): com mais de um tipo, usa o primeiro e soma as quantidades.
 */
export function hitDicePool(sheet: Pick<RestSheet, "hitDiceTotal" | "hitDiceUsed" | "level">): { die: string | null; faces: number; total: number; used: number; available: number } {
    const matches = [...String(sheet.hitDiceTotal ?? "").matchAll(/(\d*)\s*d\s*(\d+)/gi)]
    const level = Math.max(1, Math.floor(sheet.level || 1))
    if (!matches.length) return { die: null, faces: 0, total: 0, used: 0, available: 0 }
    const total = matches.reduce((sum, match) => sum + (match[1] ? Number(match[1]) : level), 0)
    const faces = Number(matches[0]![2])
    const used = Math.max(0, Math.min(total, Math.floor(sheet.hitDiceUsed || 0)))
    return { die: `d${faces}`, faces, total, used, available: total - used }
}

/** Cura de um dado de vida: o total rolado (dado + Constituição), nunca abaixo de 0. */
export const hitDieHeal = (rollTotal: number) => Math.max(0, Math.floor(rollTotal))

/** O personagem ainda pode rolar dados de vida no descanso curto (PV abaixo do máximo e dados disponíveis). */
export function canSpendHitDice(sheet: Pick<RestSheet, "hitDiceTotal" | "hitDiceUsed" | "level" | "hpCurrent" | "hpMax">): boolean {
    if (!sheet.hpMax) return false
    const hp = Math.max(0, sheet.hpCurrent ?? sheet.hpMax)
    return hp < sheet.hpMax && hitDicePool(sheet).available > 0
}

/** Dados de vida que o descanso longo devolve: metade do total (para baixo), no mínimo 1. */
export const longRestHitDiceBack = (total: number) => (total > 0 ? Math.max(1, Math.floor(total / 2)) : 0)

const plain = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/**
 * O trecho citado do catálogo fala do descanso pedido? No curto, só "descanso curto"; no longo, curto ou longo (o que volta
 * no curto também volta no longo). Aceita o texto em inglês do 5etools.
 */
export function quoteMentionsRest(quote: string, type: MaddoxRestType): boolean {
    const text = plain(quote)
    const short = /descansos?\s+curtos?|short\s+(or\s+long\s+)?rests?/.test(text)
    const long = /descansos?\s+longos?|long\s+rests?/.test(text)
    return type === "short" ? short : short || long
}

const circleLabel = (circle: string) => `Espaços de ${circle}º círculo`

/** Plano do fim do descanso (valores absolutos) e o resumo do que voltou e do que não voltou. */
export function restPlan(sheet: RestSheet, type: MaddoxRestType, decisions: RestCatalogDecisions = emptyRestDecisions()): RestPlan {
    const set: Record<string, unknown> = {}
    const recovered: RestLine[] = []
    const notRecovered: RestMissLine[] = []

    if (type === "long") {
        const hpMax = sheet.hpMax ?? 0
        const hp = Math.max(0, sheet.hpCurrent ?? hpMax)
        if (hpMax > 0 && hp !== hpMax) {
            set.hpCurrent = hpMax
            recovered.push({ label: "PV", before: String(hp), after: String(hpMax) })
        }
        if ((sheet.hpTemp ?? 0) > 0) {
            set.hpTemp = 0
            recovered.push({ label: "PV temporários", before: String(sheet.hpTemp), after: "0" })
        }
        const pool = hitDicePool(sheet)
        if (pool.used > 0) {
            const after = Math.max(0, pool.used - longRestHitDiceBack(pool.total))
            set.hitDiceUsed = after
            recovered.push({ label: "Dados de vida gastos", before: String(pool.used), after: String(after) })
        }
        if ((sheet.deathSavesSuccess ?? 0) > 0 || (sheet.deathSavesFailure ?? 0) > 0) {
            set.deathSavesSuccess = 0
            set.deathSavesFailure = 0
            recovered.push({ label: "Testes contra a morte", before: `${sheet.deathSavesSuccess ?? 0} sucesso(s), ${sheet.deathSavesFailure ?? 0} falha(s)`, after: "zerados" })
        }
        const exhaustion = exhaustionLevel(sheet.exhaustion)
        if (exhaustion > 0) {
            set.exhaustion = exhaustion - 1
            recovered.push({ label: "Exaustão", before: String(exhaustion), after: String(exhaustion - 1) })
        }
    }

    // Espaços de magia: todos no longo; no curto, só com a regra da classe no catálogo (Magia de Pacto).
    const slots = Object.entries(sheet.spellSlots ?? {}).filter(([, slot]) => (slot?.used ?? 0) > 0)
    if (slots.length) {
        const recover = type === "long" || (decisions.shortRestSlots && !decisions.unavailable)
        if (recover) {
            set.spellSlots = Object.fromEntries(Object.entries(sheet.spellSlots ?? {}).map(([circle, slot]) => [circle, { total: slot.total, used: 0 }]))
            for (const [circle, slot] of slots) recovered.push({ label: circleLabel(circle), before: `${Math.max(0, slot.total - slot.used)}/${slot.total}`, after: `${slot.total}/${slot.total}` })
        } else {
            const reason = decisions.unavailable ? REST_REASON_UNAVAILABLE : (decisions.shortRestSlotsReason ?? REST_REASON_SHORT_SLOTS)
            for (const [circle] of slots) notRecovered.push({ label: circleLabel(circle), reason })
        }
    }

    // Cargas: só as que o catálogo descreve; manuais nunca.
    const charges = sheet.resourceCharges ?? []
    let chargesChanged = false
    const nextCharges = charges.map((charge) => {
        if ((charge.used ?? 0) <= 0) return charge
        if (!charge.source) {
            notRecovered.push({ label: charge.name, reason: REST_REASON_MANUAL_CHARGE })
            return charge
        }
        if (decisions.unavailable) {
            notRecovered.push({ label: charge.name, reason: REST_REASON_UNAVAILABLE })
            return charge
        }
        const decision = decisions.charges.get(charge.id)
        if (!decision) {
            notRecovered.push({ label: charge.name, reason: decisions.refusals.get(charge.id) ?? REST_REASON_NO_RULE })
            return charge
        }
        const back = decision.recover === "all" ? charge.used : Math.max(0, Math.floor(decision.recover))
        const used = Math.max(0, charge.used - back)
        if (used === charge.used) {
            notRecovered.push({ label: charge.name, reason: decisions.refusals.get(charge.id) ?? REST_REASON_NO_RULE })
            return charge
        }
        chargesChanged = true
        recovered.push({ label: charge.name, before: `${Math.max(0, charge.total - charge.used)}/${charge.total}`, after: `${Math.max(0, charge.total - used)}/${charge.total}` })
        return { ...charge, used }
    })
    if (chargesChanged) set.resourceCharges = nextCharges

    return { set, recovered, notRecovered }
}

/** Precisa do Maddox (catálogo) para decidir: cargas com origem já gastas ou, no curto, espaços gastos. */
export function restNeedsCatalog(sheet: Pick<RestSheet, "resourceCharges" | "spellSlots">, type: MaddoxRestType): boolean {
    if ((sheet.resourceCharges ?? []).some((charge) => charge.used > 0 && charge.source)) return true
    return type === "short" && Object.values(sheet.spellSlots ?? {}).some((slot) => (slot?.used ?? 0) > 0)
}

export const restLineText = (line: RestLine) => `${line.label}: ${line.before} → ${line.after}`
export const restMissText = (line: RestMissLine) => `${line.label} (${line.reason})`
