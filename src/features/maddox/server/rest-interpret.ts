import { emptyRestDecisions, quoteMentionsRest, REST_REASON_LONG_ONLY, REST_REASON_NO_RULE, REST_REASON_SHORT_SLOTS, type MaddoxRestType, type RestCatalogDecisions, type RestChargeRow } from "../rest-rules"
import { restPrepResponseSchema } from "../rest-schemas"
import { catalogRefKey, checkCatalogSource, type CatalogReadLog } from "./catalog-reads"

/**
 * Confere a resposta do Maddox na preparação da ficha (DND-58) contra as leituras do catálogo desta execução: cada recurso só
 * volta com a fonte lida (a origem dele, ou a classe/subclasse), o trecho literal e falando do tipo de descanso. O resto vai
 * para "não recuperado" com o motivo.
 */

export interface RestInterpretContext {
    type: MaddoxRestType
    charges: readonly RestChargeRow[]
    /** Refs da classe e da subclasse da ficha ("Classe:<id>", "Subclasse:<id>"). */
    classRefs: readonly string[]
}

export class RestPrepFormatError extends Error {}

const sameRef = (a: string, b: string) => {
    const left = catalogRefKey(a)
    return Boolean(left) && left === catalogRefKey(b)
}

function sourceProblem(source: { ref: string; quote: string } | undefined, allowedRefs: readonly string[], type: MaddoxRestType, reads: CatalogReadLog): string | null {
    const problem = checkCatalogSource(source ?? null, reads)
    if (problem) return `não confirmado no catálogo: ${problem}`
    if (!allowedRefs.some((ref) => sameRef(ref, source!.ref))) return "não confirmado no catálogo: a fonte citada não é a origem deste recurso"
    if (!quoteMentionsRest(source!.quote, type)) return type === "short" && quoteMentionsRest(source!.quote, "long") ? REST_REASON_LONG_ONLY : "não confirmado no catálogo: o trecho citado não fala deste descanso"
    return null
}

export function interpretRestPrep(raw: unknown, context: RestInterpretContext, reads: CatalogReadLog): RestCatalogDecisions {
    const parsed = restPrepResponseSchema.safeParse(raw ?? {})
    if (!parsed.success) throw new RestPrepFormatError(`resposta fora do formato: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "resposta"}: ${issue.message}`).join("; ")}`)
    const decisions = emptyRestDecisions()
    for (const item of parsed.data.cargas) {
        const charge = context.charges.find((row) => row.id === item.chargeId)
        if (!charge?.source || charge.used <= 0) continue
        if (item.recupera === "nenhuma" || item.recupera === 0) {
            decisions.refusals.set(charge.id, item.motivo?.trim() || REST_REASON_NO_RULE)
            continue
        }
        const origin = `${charge.source.entityType}:${charge.source.entityId}`
        const problem = sourceProblem(item.source, [origin, ...context.classRefs], context.type, reads)
        if (problem) {
            decisions.refusals.set(charge.id, problem)
            continue
        }
        decisions.charges.set(charge.id, { recover: item.recupera === "todas" ? "all" : item.recupera })
    }
    const slots = parsed.data.espacosNoCurto
    if (context.type === "short" && slots) {
        if (!slots.recupera) decisions.shortRestSlotsReason = slots.motivo?.trim() || REST_REASON_SHORT_SLOTS
        else {
            const problem = context.classRefs.length ? sourceProblem(slots.source, context.classRefs, "short", reads) : "a ficha não tem classe do catálogo"
            if (problem) decisions.shortRestSlotsReason = problem
            else decisions.shortRestSlots = true
        }
    }
    return decisions
}
