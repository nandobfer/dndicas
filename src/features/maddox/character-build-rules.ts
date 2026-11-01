import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { ClassProgressionData } from "@/features/classes/types/classes.types"
import { averageHpGain, getLevelOneHpMax, hitDieSides, parseMentionsFromHtml, rolledHpGain } from "@/features/character-sheets/utils/sheet-rules"
import { MADDOX_EPIC_FEAT_ATTRIBUTE_CAP, MADDOX_FEAT_ATTRIBUTE_CAP } from "./constants"
import { ABILITY_BY_LABEL, ABILITY_KEYS, type AbilityScores } from "./interview-scores"
import { MADDOX_ABILITY_LABELS } from "./check-modifier"

/**
 * Regras PURAS da ficha montada na entrevista (Maddox 5): níveis de subclasse e de talento a partir dos traços da classe
 * no catálogo, escolhas de magia pela tabela de progressão, aumentos de atributo dos talentos e os pontos de vida por
 * nível (como o assistente de subir de nível da ficha). Usado pelo servidor e pela tela.
 */

export interface CatalogTraitLike {
    level?: number
    description: string
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

/** Nome do traço: o rótulo da menção (o catálogo guarda o traço como menção) ou o texto. */
export const traitLabel = (trait: CatalogTraitLike) => parseMentionsFromHtml(trait.description)[0]?.label ?? stripTags(trait.description)

const FEAT_SLOT = /melhoria de atributo|aumento de atributo|aumento no valor de (habilidade|atributo)|aperfei[cç]oamento d[ae] pontua[cç][aã]o de atributo|novo talento/i
const EPIC_SLOT = /d[aá]diva [ée]pica/i
const SUBCLASS_TRAIT = /^subclasse\b/i
const FIGHTING_STYLE_TRAIT = /^estilo de luta/i
const EXPERTISE_TRAIT = /^especialista/i
/** Talento de Aumento de Atributo (+2 em um ou +1 em dois, qualquer atributo). */
const ASI_FEAT = /aperfei[cç]oamento d[ae] pontua[cç][aã]o de atributo|aumento no valor de (habilidade|atributo)|melhoria de atributo/i

const levelOf = (trait: CatalogTraitLike) => trait.level ?? 1

export interface FeatSlot {
    level: number
    kind: "general" | "epic"
}

/** Níveis em que a classe concede talento (Aumento de Atributo / Novo Talento) ou Dádiva Épica, até o nível. */
export function featSlots(traits: readonly CatalogTraitLike[], level: number): FeatSlot[] {
    const slots = new Map<number, FeatSlot["kind"]>()
    for (const trait of traits) {
        if (levelOf(trait) > level) continue
        const label = traitLabel(trait)
        if (EPIC_SLOT.test(label)) slots.set(levelOf(trait), "epic")
        else if (FEAT_SLOT.test(label) && !slots.has(levelOf(trait))) slots.set(levelOf(trait), "general")
    }
    return [...slots.entries()].map(([slotLevel, kind]) => ({ level: slotLevel, kind })).sort((a, b) => a.level - b.level)
}

/** Nível em que a classe escolhe a subclasse (traço "Subclasse de …"); sem o traço, o 3 do D&D 2024. */
export function subclassLevel(traits: readonly CatalogTraitLike[]): number {
    const levels = traits.filter((trait) => SUBCLASS_TRAIT.test(traitLabel(trait))).map(levelOf)
    return levels.length ? Math.min(...levels) : 3
}

export const requiresFightingStyle = (traits: readonly CatalogTraitLike[], level: number) => traits.some((trait) => levelOf(trait) <= level && FIGHTING_STYLE_TRAIT.test(traitLabel(trait)))

/** Perícias de Especialista até o nível: 2 por ocorrência do traço. */
export const expertiseCount = (traits: readonly CatalogTraitLike[], level: number) => traits.filter((trait) => levelOf(trait) <= level && EXPERTISE_TRAIT.test(traitLabel(trait))).length * 2

export interface SpellLimits {
    cantrips: number
    prepared: number
    /** Maior círculo com espaço no nível (0 = só truques). */
    maxCircle: number
}

/** Truques, magias e círculo máximo pela tabela de progressão (da classe ou da subclasse que conjura). */
export function spellLimits(progression: ClassProgressionData | null | undefined, level: number): SpellLimits | null {
    const row = progression?.spellSlots?.[level]
    if (!row) return null
    const circles = Object.entries(row.slots ?? {})
        .filter(([, total]) => (total ?? 0) > 0)
        .map(([circle]) => Number(circle))
    const limits = { cantrips: row.cantrips ?? 0, prepared: row.preparedSpells ?? 0, maxCircle: circles.length ? Math.max(...circles) : 0 }
    return limits.cantrips || limits.prepared ? limits : null
}

export type FeatAttributeRule = { kind: "asi" } | { kind: "one-of"; options: AttributeType[] } | { kind: "none" }

/** Como o talento mexe nos atributos: Aumento de Atributo, +1 num dos atributos listados ou nada. */
export function featAttributeRule(feat: { name: string; attributeBonuses?: { attribute: string }[] | null }): FeatAttributeRule {
    if (ASI_FEAT.test(feat.name)) return { kind: "asi" }
    const options = [...new Set((feat.attributeBonuses ?? []).map((bonus) => ABILITY_BY_LABEL[bonus.attribute]).filter((key): key is AttributeType => Boolean(key)))]
    return options.length ? { kind: "one-of", options } : { kind: "none" }
}

const labels = (keys: readonly AttributeType[]) => keys.map((key) => MADDOX_ABILITY_LABELS[key]).join(", ")

/** Valida os pontos de atributo escolhidos para um talento; `null` = válido. */
export function validateFeatAttributes(rule: FeatAttributeRule, parts: Partial<Record<AttributeType, number>>, featName: string): string | null {
    const entries = Object.entries(parts).filter(([, value]) => value) as [AttributeType, number][]
    const total = entries.reduce((sum, [, value]) => sum + value, 0)
    if (rule.kind === "none") return entries.length ? `${featName} não aumenta atributos.` : null
    if (rule.kind === "asi") {
        if (total !== 2 || entries.some(([, value]) => value < 1 || value > 2)) return `${featName}: distribua +2 em um atributo ou +1 em dois.`
        return null
    }
    if (entries.length !== 1 || total !== 1 || !rule.options.includes(entries[0]![0])) return `${featName}: escolha +1 em um destes atributos: ${labels(rule.options)}.`
    return null
}

export const featAttributeCap = (epic: boolean) => (epic ? MADDOX_EPIC_FEAT_ATTRIBUTE_CAP : MADDOX_FEAT_ATTRIBUTE_CAP)

/** Atributos finais: card (base + bônus da origem) mais os aumentos dos talentos, cada um com o teto dele. */
export function applyFeatAttributes(scores: AbilityScores, feats: readonly { attributes: Partial<Record<AttributeType, number>>; cap?: number }[]): AbilityScores {
    const next = { ...scores }
    for (const feat of feats) {
        for (const key of ABILITY_KEYS) {
            const add = feat.attributes[key] ?? 0
            if (add) next[key] = Math.max(next[key], Math.min(feat.cap ?? MADDOX_FEAT_ATTRIBUTE_CAP, next[key] + add))
        }
    }
    return next
}

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2)

export interface HitPointLevelRow {
    level: number
    /** Ganho pela média (com CON). */
    average: number
    /** Dado rolado (sem CON) e o ganho com CON; `null` = não rolado. */
    die: number | null
    rolled: number | null
}

/** Linhas do card de PV (níveis 2 ao N), como o assistente de subir de nível. */
export function hitPointRows(level: number, hitDie: string, conMod: number, rolls: readonly { level: number; die: number }[]): HitPointLevelRow[] {
    const rows: HitPointLevelRow[] = []
    for (let current = 2; current <= level; current++) {
        const roll = rolls.find((item) => item.level === current)
        rows.push({ level: current, average: averageHpGain(hitDie, conMod), die: roll?.die ?? null, rolled: roll ? rolledHpGain(roll.die, conMod) : null })
    }
    return rows
}

/** PV máximo: nível 1 automático + cada nível pela média ou pelo dado rolado. `null` = falta rolar um nível escolhido. */
export function hitPointsTotal(level: number, hitDie: string, conMod: number, choices: Record<string, "average" | "roll"> | null, rolls: readonly { level: number; die: number }[]): number | null {
    let total = getLevelOneHpMax(hitDie, conMod)
    for (const row of hitPointRows(level, hitDie, conMod, rolls)) {
        const choice = choices?.[String(row.level)] ?? "average"
        if (choice === "roll") {
            if (row.rolled === null) return null
            total += row.rolled
        } else total += row.average
    }
    return total
}

export const isHitDie = (value: string | null | undefined) => hitDieSides(value) !== null
