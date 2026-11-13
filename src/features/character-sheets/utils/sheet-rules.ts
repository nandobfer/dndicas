import type { AttributeType as CatalogAttributeType, CharacterClass, HitDiceType } from "@/features/classes/types/classes.types"
import type { Item, ItemType } from "@/features/items/types/items.types"
import type { Charges } from "@/features/shared/charges/types"
import type { Spell } from "@/features/spells/types/spells.types"
import { parseTraitChargeDice } from "@/features/traits/utils/trait-charges"
import { getDiceHex } from "@/features/rules/utils/dice-render-utils"
import type {
    AttributeType as SheetAttributeType,
    CharacterAttack,
    CharacterResourceCharge,
    CharacterResourceChargeSource,
    PatchSheetBody,
    ResourceChargeSourceKind,
} from "../types/character-sheet.types"

/**
 * Regras PURAS da ficha (sem DOM e sem "use client"), compartilhadas pela ficha no navegador e pelo servidor (a ficha
 * criada pela entrevista do Maddox). `mention-sync.ts`, `attack-autofill.ts`, `resource-charges.ts` e o preenchimento
 * automático da ficha re-exportam daqui: o resultado é o mesmo nos dois lados.
 */

export interface ParsedMention {
    id: string
    entityType: string
    label: string
}

export interface SpellcastingSource {
    spellcastingAttribute?: CatalogAttributeType | null
    progressionTable?: CharacterClass["progressionTable"]
}

export const CATALOG_TO_SHEET_ATTRIBUTE: Record<CatalogAttributeType, SheetAttributeType> = {
    Força: "strength",
    Destreza: "dexterity",
    Constituição: "constitution",
    Inteligência: "intelligence",
    Sabedoria: "wisdom",
    Carisma: "charisma",
}

export function mapCatalogAttributeToSheetAttribute(attribute: CatalogAttributeType | null | undefined): SheetAttributeType | null {
    if (!attribute) return null
    return CATALOG_TO_SHEET_ATTRIBUTE[attribute] ?? null
}

export function mapHitDiceToSheetHitDice(hitDice: HitDiceType | null | undefined): string | null {
    return hitDice ?? null
}

export function toMentionKey(mention: Pick<ParsedMention, "id" | "entityType">): string {
    return `${mention.entityType}:${mention.id}`
}

export function dedupeMentions(mentions: ParsedMention[]): ParsedMention[] {
    const seen = new Set<string>()
    const result: ParsedMention[] = []
    for (const mention of mentions) {
        const key = toMentionKey(mention)
        if (seen.has(key)) continue
        seen.add(key)
        result.push(mention)
    }
    return result
}

export function escapeHtmlAttr(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

export function escapeHtmlText(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

export function buildMentionHtml(mention: ParsedMention): string {
    const attrs = [
        `data-type="mention"`,
        `data-id="${escapeHtmlAttr(mention.id)}"`,
        `data-entity-type="${escapeHtmlAttr(mention.entityType)}"`,
        `data-label="${escapeHtmlAttr(mention.label)}"`,
        `class="mention"`,
    ].join(" ")
    return `<span ${attrs}>${escapeHtmlText(mention.label)}</span>`
}

const decodeEntities = (value: string) =>
    value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&nbsp;", " ").replaceAll("&amp;", "&")

const MENTION_SPAN = /<span\b([^>]*\bdata-type=["']mention["'][^>]*)>([\s\S]*?)<\/span>/gi
const attrOf = (attrs: string, name: string) => {
    const match = new RegExp(`\\b${name}=(["'])([\\s\\S]*?)\\1`, "i").exec(attrs)
    return match ? decodeEntities(match[2]!) : null
}

/** Menções de um HTML do catálogo sem DOM (servidor): mesmo resultado de `extractMentionsFromHtml` da ficha. */
export function parseMentionsFromHtml(html: string | null | undefined): ParsedMention[] {
    const value = String(html ?? "")
    if (!value.includes("mention")) return []
    const mentions: ParsedMention[] = []
    for (const match of value.matchAll(MENTION_SPAN)) {
        const attrs = match[1]!
        const id = attrOf(attrs, "data-id") ?? ""
        if (!id) continue
        const text = decodeEntities(match[2]!.replace(/<[^>]*>/g, ""))
        mentions.push({ id, entityType: attrOf(attrs, "data-entity-type") || "Regra", label: attrOf(attrs, "data-label") || text })
    }
    return mentions
}

/** Menções de habilidade dos traços até o nível (classe, subclasse ou raça), como o preenchimento da ficha. */
export function collectTraitMentionsUpTo(traits: readonly { level?: number; description: string }[], level: number): ParsedMention[] {
    return dedupeMentions(traits.filter((trait) => (trait.level ?? 1) <= level).flatMap((trait) => parseMentionsFromHtml(trait.description).filter((mention) => mention.entityType === "Habilidade")))
}

export function mapSpellSlotsForLevel(level: number, source?: SpellcastingSource | null, currentSlots?: Record<string, { total: number; used: number }>): PatchSheetBody["spellSlots"] {
    const levelData = source?.progressionTable?.spellSlots?.[level]
    const mapped: Record<string, { total: number; used: number }> = {}
    for (let slotLevel = 1; slotLevel <= 9; slotLevel += 1) {
        const key = String(slotLevel)
        const total = levelData?.slots?.[slotLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9] ?? 0
        if (total <= 0) continue
        const used = Math.min(currentSlots?.[key]?.used ?? 0, total)
        mapped[key] = { total, used }
    }
    return mapped
}

export function parseSubclassSearchId(id: string): { parentClassId: string; subclassId: string } | null {
    const match = /^subclass:([^:]+):(.+)$/.exec(id)
    if (!match) return null
    return { parentClassId: match[1]!, subclassId: match[2]! }
}

/** Lados do dado de vida ("d10" → 10); desconhecido → `null`. */
export function hitDieSides(hitDice: string | null | undefined): number | null {
    const sides = parseInt(String(hitDice ?? "").replace(/^d/i, ""), 10)
    return Number.isFinite(sides) && sides > 0 ? sides : null
}

/** PV máximo do nível 1: máximo do dado + modificador de Constituição (mínimo 1). */
export function getLevelOneHpMax(hitDice: string, constitutionModifier: number): number {
    const dieValue = parseInt(hitDice.replace(/^d/i, ""), 10)
    if (!Number.isFinite(dieValue)) return Math.max(1, constitutionModifier + 1)
    return Math.max(1, dieValue + constitutionModifier)
}

/** Ganho de PV ao subir de nível pela média, como o assistente de subir de nível da ficha: ⌈lados/2⌉ + CON (mínimo 1). */
export function averageHpGain(hitDice: string, constitutionModifier: number): number {
    return Math.max(1, Math.ceil((hitDieSides(hitDice) ?? 8) / 2) + constitutionModifier)
}

/** Ganho rolado (1 dado de vida + CON, mínimo 1), como o "Rolar vida" do assistente. */
export function rolledHpGain(dieResult: number, constitutionModifier: number): number {
    return Math.max(1, dieResult + constitutionModifier)
}

// ── Ataques ─────────────────────────────────────────────────────────────────────

export interface AttackCalcValues {
    spellAttackBonus: { value: number }
    profBonus: { value: number }
    attrMods: { strength: { value: number }; dexterity: { value: number } }
}

export function formatBonus(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

export function hasFinesseProperty(propertiesHtml: string[]): boolean {
    return propertiesHtml.some((value) => /acuidade|finesse/i.test(stripTags(value)))
}

export function resolveCatalogItemType(item: { type?: string | null; itemType?: string | null }): ItemType | null {
    const rawType = item.itemType ?? item.type
    if (rawType === "arma" || rawType === "armadura" || rawType === "escudo" || rawType === "ferramenta" || rawType === "consumível" || rawType === "munição" || rawType === "qualquer") return rawType
    return null
}

export function buildDiceValueHtml(quantity: number, faces: string, bonus?: number, colorHex?: string): string {
    const bonusAttr = bonus !== undefined ? ` data-bonus="${bonus}"` : ""
    const colorAttr = colorHex ? ` data-color-hex="${colorHex}"` : ""
    return `<span data-type="dice-value" data-qty="${quantity}" data-faces="${faces.replace("d", "")}"${bonusAttr}${colorAttr}></span>`
}

export function buildWeaponAttackAutofill(
    catalogItem: Pick<Item, "properties" | "damageDice" | "damageType">,
    calc: Pick<AttackCalcValues, "profBonus" | "attrMods">,
): Pick<CharacterAttack, "attackBonus" | "damageType"> {
    const propertiesHtml = (catalogItem.properties ?? []).map((property) => `${property.name ?? ""} ${property.description ?? ""}`)
    const hasFinesse = hasFinesseProperty(propertiesHtml)
    const attrMod = hasFinesse ? Math.max(calc.attrMods.dexterity.value, calc.attrMods.strength.value) : calc.attrMods.strength.value
    const attackBonusValue = calc.profBonus.value + attrMod
    let damageText = ""
    if (catalogItem.damageDice) {
        const { quantidade, tipo } = catalogItem.damageDice
        const colorHex = getDiceHex(catalogItem.damageType ?? "")
        damageText = buildDiceValueHtml(quantidade, tipo, attrMod, colorHex)
        if (catalogItem.damageType) damageText += ` ${catalogItem.damageType}`
    }
    return { damageType: damageText ? `<p>${damageText}</p>` : "", attackBonus: formatBonus(attackBonusValue) }
}

export function getCantripDamageDiceQuantity(baseQuantity: number, characterLevel: number): number {
    const multiplier = characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1
    return Math.max(1, baseQuantity) * multiplier
}

export function buildSpellAttackAutofill(
    catalogSpell: Pick<Spell, "circle" | "baseDice">,
    calc: Pick<AttackCalcValues, "spellAttackBonus">,
    characterLevel: number,
): Pick<CharacterAttack, "attackBonus" | "damageType"> {
    let damageText = ""
    if (catalogSpell.baseDice) {
        const { quantidade, tipo } = catalogSpell.baseDice
        const nextQuantity = catalogSpell.circle === 0 ? getCantripDamageDiceQuantity(quantidade, characterLevel) : quantidade
        damageText = buildDiceValueHtml(nextQuantity, tipo)
    }
    return { damageType: damageText ? `<p>${damageText}</p>` : "", attackBonus: formatBonus(calc.spellAttackBonus.value) }
}

export function getAutoSpellAttackNotes(spellId: string): string {
    return `auto:spell:${spellId}`
}

// ── Cargas de recursos ──────────────────────────────────────────────────────────

export interface ResourceChargeCalcContext {
    level: number
    proficiencyBonus: number
    attributeModifiers: Record<SheetAttributeType, number>
}

export interface ChargeBoundEntity {
    entityId: string
    entityType: CharacterResourceChargeSource["entityType"]
    kind: ResourceChargeSourceKind
    nameHtml: string
    charges?: Charges
}

export function createResourceChargeId() {
    return `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function clampResourceChargeRow(row: CharacterResourceCharge): CharacterResourceCharge {
    const total = Math.max(0, Math.trunc(row.total))
    const used = Math.max(0, Math.min(total, Math.trunc(row.used)))
    return { ...row, total, used }
}

function parseChargeCountValue(value: string): number | null {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
    const dice = parseTraitChargeDice(trimmed)
    return dice?.quantidade ?? null
}

function mapChargeAttribute(attribute: string): SheetAttributeType {
    return CATALOG_TO_SHEET_ATTRIBUTE[attribute as CatalogAttributeType] ?? "wisdom"
}

export function resolveChargesTotal(charges: Charges | undefined, context: ResourceChargeCalcContext): number | null {
    if (!charges) return null
    if (charges.mode === "fixed") return parseChargeCountValue(charges.value)
    if (charges.mode === "proficiency") return context.proficiencyBonus
    if (charges.mode === "attribute") return context.attributeModifiers[mapChargeAttribute(charges.attribute)] ?? 0
    const row = charges.values.reduce<(typeof charges.values)[number] | null>((closest, value) => {
        if (value.level > context.level) return closest
        if (!closest || value.level > closest.level) return value
        return closest
    }, null)
    return row ? parseChargeCountValue(row.value) : null
}

export function buildBoundResourceCharge(entity: ChargeBoundEntity, context: ResourceChargeCalcContext, existing?: CharacterResourceCharge | null): CharacterResourceCharge | null {
    const total = resolveChargesTotal(entity.charges, context)
    if (total === null) return null
    return clampResourceChargeRow({
        id: existing?.id ?? createResourceChargeId(),
        name: entity.nameHtml,
        total,
        used: existing?.used ?? 0,
        source: { kind: entity.kind, entityType: entity.entityType, entityId: entity.entityId },
    })
}

/** HTML de uma menção em parágrafo próprio (nome das cargas e campos com uma entidade). */
export function mentionParagraphHtml(mention: ParsedMention): string {
    return `<p>${buildMentionHtml(mention)}</p>`
}

/**
 * Acrescenta menções ao HTML de um campo, uma por parágrafo, sem repetir as que o campo já cita. Versão PURA (sem DOM)
 * do `appendMentionsToHtml` do navegador, com a mesma saída: o servidor (motor da subida de nível) usa esta, nunca a de
 * `mention-sync.ts`, que é `"use client"` e não pode ser chamada pelo servidor no bundle do Next.
 */
export function appendMentionParagraphs(html: string | null | undefined, mentionsToAdd: ParsedMention[]): string {
    const value = String(html ?? "").trim()
    const normalized = value === "<p></p>" ? "" : value
    const existing = new Set(parseMentionsFromHtml(normalized).map(toMentionKey))
    const mentions = dedupeMentions(mentionsToAdd).filter((mention) => !existing.has(toMentionKey(mention)))
    if (mentions.length === 0) return normalized
    return `${normalized}${mentions.map(mentionParagraphHtml).join("")}`
}

// ── Experiência (D&D 2024) ──────────────────────────────────────────────────────

/** XP mínima de cada nível (índice 0 = nível 1), pela tabela do D&D 2024. */
export const XP_BY_LEVEL = [0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000, 85_000, 100_000, 120_000, 140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000] as const

/** Limiar de XP do nível (1–20). */
export function xpForLevel(level: number): number {
    const index = Math.min(20, Math.max(1, Math.trunc(level))) - 1
    return XP_BY_LEVEL[index]!
}

/** Nível que a XP alcança (1–20). */
export function levelForXp(xp: number): number {
    let level = 1
    for (let index = 0; index < XP_BY_LEVEL.length; index++) if (xp >= XP_BY_LEVEL[index]!) level = index + 1
    return level
}

/** Quanto falta para o próximo nível; `null` no nível 20. */
export function xpToNextLevel(xp: number, level: number): { next: number; missing: number } | null {
    if (level >= 20) return null
    const next = xpForLevel(level + 1)
    return { next, missing: Math.max(0, next - Math.max(0, xp)) }
}

/** XP como número (fichas antigas guardavam texto livre). */
export function experienceValue(value: unknown): number {
    const parsed = typeof value === "number" ? value : parseInt(String(value ?? "").replace(/\D/g, ""), 10)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}
