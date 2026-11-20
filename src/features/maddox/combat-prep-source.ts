import type { CombatOption } from "./combat-options"
import type { CombatPrepSource } from "./combat-types"

/**
 * Textos da origem da preparação da mesa (DND-78), usados pelo card "Sua mesa está pronta", pelo selo da ordem e pelo
 * popover da opção: reaproveitada do cache, preparada agora só no que mudou, ou a ficha inteira.
 */

const dateTime = (iso: string | null | undefined) => {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
const dateOnly = (iso: string | null | undefined) => {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

const keptText = (kept: number | undefined) => (kept ? `${kept} ${kept === 1 ? "ajuste do Maddox continua valendo" : "ajustes do Maddox continuam valendo"}.` : "Nenhum ajuste do Maddox precisou ser mantido.")

/** Linha principal e detalhe do card para a origem da preparação; `null` sem origem (preparações antigas). */
export function prepSourceSummary(source: CombatPrepSource | null | undefined): { title: string; detail: string | null; items: string[] } | null {
    if (!source) return null
    const when = dateTime(source.cachedAt)
    if (source.kind === "cache") return { title: `Mesa reaproveitada da preparação${when ? ` de ${when}` : " anterior"}: nada mudou na ficha.`, detail: keptText(source.kept), items: [] }
    if (source.kind === "partial") {
        const items = source.changedParts ?? []
        return { title: "Preparada agora só o que mudou na ficha:", detail: `${keptText(source.kept)}${when ? ` (preparação de ${when})` : ""}`, items }
    }
    return { title: "Preparada agora (ficha inteira).", detail: source.reason ? `Motivo: ${source.reason}.` : null, items: [] }
}

/** Tooltip do selo "Pronto" da ordem de iniciativa. */
export const prepSourceSealLabel = (kind: CombatPrepSource["kind"] | null | undefined): string | null =>
    kind === "cache" ? "Reaproveitada do cache: nada mudou na ficha" : kind === "partial" ? "Preparada agora: só o que mudou" : kind === "full" ? "Preparada agora" : null

/** Chip do popover da opção ajustada: "do cache (dd/mm)" ou "preparado agora". */
export function adjustedOriginLabel(adjusted: CombatOption["adjusted"]): string | null {
    if (!adjusted?.origin) return null
    if (adjusted.origin === "cache") {
        const day = dateOnly(adjusted.preparedAt)
        return day ? `do cache (${day})` : "do cache"
    }
    return "preparado agora"
}
