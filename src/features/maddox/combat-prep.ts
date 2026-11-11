import { availableSlotLevels, plainText, type CombatOption, type CombatOptions, type CombatRider, type OptionSheet } from "./combat-options"
import { alignModifierParts } from "@/features/dice-roller/dice-breakdown"
import { parseDiceExpression, type CombatEconomy } from "./combat-rules"
import type { CombatOptionPatch, CombatPrepOverlay, CombatPrepRider, PreparedCombatOption } from "./combat-types"

/**
 * Preparação da mesa de combate (DND-41) — parte PURA. O Maddox revisa, uma vez por combate, a lista que o servidor
 * calcula da ficha e guarda o que muda (`overlay`: alterar, remover, acrescentar) e os danos adicionais (`riders`, como o
 * ataque furtivo). A cada turno o servidor recalcula a lista base com a economia e os recursos ao vivo e aplica a
 * preparação por cima (`applyCombatPrep`): a IA não é chamada de novo, e a disponibilidade do turno (Ação ou Ação bônus
 * gasta, cargas, espaços, quantidades, condições) continua sendo do servidor.
 */

const fold = (value: string) =>
    plainText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

export interface ApplyPrepInput {
    overlay: CombatPrepOverlay | null | undefined
    riders: readonly CombatPrepRider[] | null | undefined
    economy: CombatEconomy
    /** Espaços de magia da ficha (ao vivo). */
    sheet: OptionSheet
    /** Cargas e quantidades da ficha (ao vivo). */
    charges: ReadonlyMap<string, { total: number; used: number }>
    items: ReadonlyMap<string, number>
    /** Morrendo ou incapacitado: a lista base já vem vazia, e a preparação não acrescenta nada. */
    blocked: boolean
}

const canAttack = (economy: CombatEconomy) => economy.action || (economy.attackAction && economy.attacksLeft > 0)

/** A economia da opção está livre neste turno. */
function slotOpen(option: Pick<CombatOption, "economy" | "category" | "resolution">, economy: CombatEconomy): boolean {
    if (option.economy === "bonus") return economy.bonus
    if (option.economy === "reaction") return economy.reaction
    return option.category === "weapons" && option.resolution === "attack" ? canAttack(economy) : economy.action
}

const listOf = (options: CombatOptions, economy: CombatOption["economy"]) => (economy === "action" ? options.action : economy === "bonus" ? options.bonus : options.reactions)

/** Põe a opção antes das ações comuns e do "Outra ação" (que ficam sempre no fim da lista). */
function insertOption(list: CombatOption[], option: CombatOption) {
    const tail = list.findIndex((item) => item.category === "standard" || item.category === "other")
    if (tail < 0) list.push(option)
    else list.splice(tail, 0, option)
}

/** Parcela do tooltip da rolagem quando a preparação muda o bônus ou o dano (DND-47). */
export const PREP_ADJUSTMENT_LABEL = "Ajuste da preparação do Maddox"

function patchOption(option: CombatOption, patch: CombatOptionPatch, reason: string): CombatOption {
    const next: CombatOption = { ...option, adjusted: { reason } }
    if (patch.label?.trim()) next.label = patch.label.trim()
    if (patch.detail?.trim()) next.detail = patch.detail.trim()
    if (patch.economy) next.economy = patch.economy
    if (patch.attack) {
        next.attack = { ...option.attack, ...patch.attack }
        // DND-47: as parcelas da lista base continuam; o que a preparação mudou no número vira a parcela do ajuste.
        next.attack.bonusParts = alignModifierParts(option.attack?.bonusParts ?? [], next.attack.bonus, PREP_ADJUSTMENT_LABEL)
        next.attack.damageParts = alignModifierParts(option.attack?.damageParts ?? [], parseDiceExpression(next.attack.damage)?.modifier ?? 0, PREP_ADJUSTMENT_LABEL)
    }
    if (patch.save) next.save = { ...patch.save }
    if (patch.heal) next.heal = { ...patch.heal }
    return next
}

/** Opção acrescentada pelo Maddox, se o recurso que a libera estiver disponível neste turno. */
function preparedOption(prepared: PreparedCombatOption, reason: string, input: ApplyPrepInput): CombatOption | null {
    const requires = prepared.requires ?? null
    const option: CombatOption = {
        id: prepared.id,
        category: prepared.category,
        economy: prepared.economy,
        label: prepared.label,
        detail: prepared.detail,
        target: prepared.target,
        multiTarget: prepared.multiTarget,
        resolution: prepared.resolution,
        adjusted: { reason },
        ...(prepared.attack ? { attack: { ...prepared.attack } } : {}),
        ...(prepared.save ? { save: { ...prepared.save } } : {}),
        ...(prepared.heal ? { heal: { ...prepared.heal } } : {}),
        ...(prepared.trigger ? { trigger: prepared.trigger } : {}),
    }
    if (!slotOpen(option, input.economy)) return null
    if (requires?.chargeId) {
        const charge = input.charges.get(requires.chargeId)
        if (!charge || charge.used >= charge.total) return null
        option.charges = { chargeId: requires.chargeId, used: charge.used, total: charge.total }
    }
    if (requires?.itemId) {
        if ((input.items.get(requires.itemId) ?? 0) <= 0) return null
        option.consumes = { itemId: requires.itemId }
    }
    if (requires?.spellCircle && requires.spellCircle > 0) {
        const levels = availableSlotLevels(input.sheet, requires.spellCircle)
        if (!levels.length || input.economy.slotSpellCast) return null
        option.spell = { circle: requires.spellCircle, levels, concentration: Boolean(requires.concentration) }
    }
    return option
}

/** Elegível ao ataque furtivo: ataque com arma de Acuidade ou à distância (a arma arremessada só com Acuidade). */
export const sneakEligible = (option: CombatOption) =>
    option.category === "weapons" && option.resolution === "attack" && option.economy !== "reaction" && Boolean(option.attack) && (Boolean(option.attack!.finesse) || (option.attack!.ranged && !option.id.endsWith(":thrown")))

export const riderLabel = (rider: Pick<CombatPrepRider, "dice">) => `Ataque furtivo (+${rider.dice})`

/** A lista do turno: a base do servidor com a preparação do Maddox por cima. */
export function applyCombatPrep(base: CombatOptions, input: ApplyPrepInput): CombatOptions {
    if (input.blocked) return base
    const overlay = input.overlay
    const hidden = new Set([...(overlay?.remove ?? []).map((item) => item.optionId), ...(overlay?.suppress ?? [])])
    const result: CombatOptions = { action: [], bonus: [], reactions: [], attacksPerAction: base.attacksPerAction }
    const patches = new Map((overlay?.modify ?? []).map((item) => [item.optionId, item]))
    for (const option of [...base.action, ...base.bonus, ...base.reactions]) {
        if (hidden.has(option.id)) continue
        const patch = patches.get(option.id)
        // A mudança de economia só vale entre Ação e Ação bônus (a reação tem janela própria).
        const next = patch && option.economy !== "reaction" ? patchOption(option, patch.patch, patch.reason) : option
        if (next.economy !== option.economy && !slotOpen(next, input.economy)) continue
        listOf(result, next.economy).push(next)
    }
    for (const entry of overlay?.add ?? []) {
        if (hidden.has(entry.option.id)) continue
        if ([...result.action, ...result.bonus, ...result.reactions].some((item) => item.id === entry.option.id)) continue
        const option = preparedOption(entry.option, entry.reason, input)
        if (option) insertOption(listOf(result, option.economy), option)
    }
    const sneak = (input.riders ?? []).find((rider) => rider.key === "sneak-attack")
    if (sneak) {
        const rider: CombatRider = { key: "sneak-attack", label: riderLabel(sneak), dice: sneak.dice }
        for (const list of [result.action, result.bonus]) {
            for (const [index, option] of list.entries()) if (sneakEligible(option)) list[index] = { ...option, attack: { ...option.attack!, riders: [rider] } }
        }
    }
    return result
}

/** Só "Outra ação" sobrou na Ação bônus (o painel avisa). */
export const onlyFreeBonus = (options: Pick<CombatOptions, "bonus">) => options.bonus.length > 0 && options.bonus.every((option) => option.id === "free")

export interface SneakAttackSource {
    level: number
    /** Texto da classe e da subclasse (com menções). */
    classText: string
    /** Características de classe, de espécie e notas (texto) e nomes das habilidades e talentos. */
    features: readonly string[]
}

/** Ataque furtivo pela classe (Ladino/Rogue) ou pela característica "Ataque Furtivo": ⌈nível/2⌉d6. */
export function detectSneakAttack(source: SneakAttackSource): string | null {
    const rogue = /\bladino\b|\brogue\b/.test(fold(source.classText))
    const feature = source.features.some((text) => /ataque furtivo|sneak attack/.test(fold(text)))
    if (!rogue && !feature) return null
    return `${Math.max(1, Math.ceil(Math.max(1, source.level) / 2))}d6`
}
