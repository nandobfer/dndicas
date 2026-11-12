import { featAttributeCap, featAttributeRule, featSlots, requiresFightingStyle, spellLimits, subclassLevel, traitLabel, type CatalogTraitLike } from "@/features/maddox/character-build-rules"
import type { CatalogClass, CatalogFeat, CatalogSubclass } from "@/features/maddox/server/character-build"
import type { AttributeType, CharacterResourceCharge } from "../types/character-sheet.types"
import { getProficiencyBonus } from "../utils/dnd-calculations"
import { appendMentionsToHtml } from "../utils/mention-sync"
import { averageHpGain, buildBoundResourceCharge, hitDieSides, mapSpellSlotsForLevel, mentionParagraphHtml, parseMentionsFromHtml, type ParsedMention } from "../utils/sheet-rules"
import { ABILITY_KEYS, LevelUpError, loadCharges, loadFeats, loadLevelUpContext, loadTraitTexts, plainSlots, type LevelUpContext } from "./level-up-context"
import type { LevelUpFeatSlotKind, LevelUpOptions, LevelUpResourceChange, LevelUpSpellStep, LevelUpSpellSwap, LevelUpTraitOption } from "./level-up-types"

/**
 * Opções reais do próximo nível (DND-56) — SOMENTE servidor. Tudo vem do catálogo (classe, subclasse, raça, talentos e
 * a tabela de progressão): nada de traços, talentos, magias ou PV inventados.
 */

export interface SpellSwapInput {
    classId: string
    subclassId: string | null
    className: string
    traits: { id: string; label: string; text: string }[]
}
export type SpellSwapResolver = (input: SpellSwapInput) => Promise<LevelUpSpellSwap>

export interface LevelUpOptionsInput {
    /** Subclasse escolhida neste nível (muda traços e, em subclasses que conjuram, as magias). */
    subclassId?: string | null
    /** Decide se a classe permite trocar uma magia ao subir (decisão do Maddox pelo traço do catálogo). */
    resolveSpellSwap?: SpellSwapResolver | null
}

const SPELLCASTING_TRAIT = /conjura[çc][aã]o|magia do pacto|magias de/i
const NO_SWAP: LevelUpSpellSwap = { allowed: false, source: null }

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2)
export const subclassIdOf = (sub: CatalogSubclass) => String(sub._id ?? sub.name)

export function findSubclassById(cls: CatalogClass, id: string | null | undefined): CatalogSubclass | null {
    if (!id) return null
    const wanted = id.includes(":") ? id.split(":").pop()! : id
    return (cls.subclasses ?? []).find((sub) => subclassIdOf(sub) === wanted) ?? null
}

/** Habilidades citadas pelos traços que o filtro escolhe. */
function traitMentions(traits: readonly CatalogTraitLike[], keep: (level: number) => boolean): ParsedMention[] {
    const out: ParsedMention[] = []
    for (const trait of traits) {
        if (!keep(trait.level ?? 1)) continue
        const mentions = parseMentionsFromHtml(trait.description).filter((mention) => mention.entityType === "Habilidade")
        if (mentions.length) out.push(...mentions)
    }
    return out.filter((mention, index) => out.findIndex((other) => other.id === mention.id) === index)
}

const traitOptions = (mentions: ParsedMention[], source: LevelUpTraitOption["source"]): LevelUpTraitOption[] => mentions.map((mention) => ({ id: mention.id, label: mention.label, source }))

export function scoresOf(ctx: LevelUpContext): Record<AttributeType, number> {
    return Object.fromEntries(ABILITY_KEYS.map((key) => [key, Number(ctx.sheet[key] ?? 10)])) as Record<AttributeType, number>
}

/** Traços ganhos no nível de destino (classe, subclasse e raça). */
export function gainedTraits(ctx: LevelUpContext, target: number, subclass: CatalogSubclass | null): LevelUpTraitOption[] {
    const newSubclass = Boolean(subclass && !ctx.currentSubclass)
    return [
        ...traitOptions(traitMentions(ctx.cls.traits ?? [], (level) => level === target), "classe"),
        ...(subclass ? traitOptions(traitMentions(subclass.traits ?? [], (level) => (newSubclass ? level <= target : level === target)), "subclasse") : []),
        ...traitOptions(traitMentions(ctx.race?.traits ?? [], (level) => level === target), "raça"),
    ]
}

export interface FeatSlotInfo {
    kind: LevelUpFeatSlotKind
    cap: number
}

export function featSlotAt(ctx: LevelUpContext, target: number): FeatSlotInfo | null {
    const traits = ctx.cls.traits ?? []
    const slot = featSlots(traits, target).find((item) => item.level === target)
    if (slot) return { kind: slot.kind, cap: featAttributeCap(slot.kind === "epic") }
    if (requiresFightingStyle(traits, target) && !requiresFightingStyle(traits, target - 1)) return { kind: "fighting-style", cap: featAttributeCap(false) }
    return null
}

const FEAT_CATEGORY: Record<LevelUpFeatSlotKind, string> = { general: "Geral", epic: "Dádiva Épica", "fighting-style": "Estilo de Luta" }

export function featFits(feat: CatalogFeat, slot: FeatSlotInfo, target: number): boolean {
    if ((feat.level ?? 1) > target) return false
    const category = feat.category ?? null
    if (slot.kind === "general") return category === FEAT_CATEGORY.general || category === null
    return category === FEAT_CATEGORY[slot.kind]
}

/** Talentos que a ficha já tem (as menções em "Talentos e características"). */
const featIdsOf = (html: string | undefined) => new Set(parseMentionsFromHtml(html).filter((mention) => mention.entityType === "Talento").map((mention) => mention.id))

export function featOptions(ctx: LevelUpContext, feats: CatalogFeat[], slot: FeatSlotInfo, target: number) {
    const taken = featIdsOf(ctx.sheet.featuresNotes)
    return feats
        .filter((feat) => featFits(feat, slot, target))
        .filter((feat) => featAttributeRule(feat).kind === "asi" || !taken.has(String(feat._id)))
        .map((feat) => ({ id: String(feat._id), name: feat.name, category: feat.category ?? null, attributeRule: featAttributeRule(feat) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Fonte das magias: a subclasse que conjura (com tabela) ou a classe — a mesma regra da entrevista do Maddox. */
export function spellSourceOf(cls: CatalogClass, subclass: CatalogSubclass | null) {
    if (subclass && Object.keys(subclass.progressionTable?.spellSlots ?? {}).length) return { progression: subclass.progressionTable, list: subclass.spells?.length ? subclass.spells : (cls.spells ?? []), attribute: subclass.spellcastingAttribute ?? cls.spellcastingAttribute ?? null }
    if (Object.keys(cls.progressionTable?.spellSlots ?? {}).length) return { progression: cls.progressionTable, list: cls.spells ?? [], attribute: subclass?.spellcastingAttribute ?? cls.spellcastingAttribute ?? null }
    return null
}

/** Magias da ficha que vieram da lista da classe (as de espécie e talentos não contam no limite). */
export function knownClassSpells(ctx: LevelUpContext, list: { id: string }[]) {
    const ids = new Set(list.map((item) => String(item.id)))
    return ctx.spells
        .filter((spell) => spell.catalogSpellId && ids.has(String(spell.catalogSpellId)))
        .map((spell) => ({ id: String(spell._id), catalogId: spell.catalogSpellId ? String(spell.catalogSpellId) : null, name: parseMentionsFromHtml(spell.name)[0]?.label ?? spell.name.replace(/<[^>]*>/g, "").trim(), circle: spell.circle ?? 0 }))
}

export async function spellStep(ctx: LevelUpContext, target: number, subclass: CatalogSubclass | null, resolveSpellSwap?: SpellSwapResolver | null): Promise<LevelUpSpellStep | null> {
    const source = spellSourceOf(ctx.cls, subclass)
    const limits = source ? spellLimits(source.progression, target) : null
    if (!source || !limits) return null
    const known = knownClassSpells(ctx, source.list)
    const knownIds = new Set(known.map((spell) => spell.catalogId))
    const cantrips = Math.max(0, limits.cantrips - known.filter((spell) => spell.circle === 0).length)
    const spells = Math.max(0, limits.prepared - known.filter((spell) => spell.circle > 0).length)
    const free = source.list.filter((item) => !knownIds.has(String(item.id))).map((item) => ({ id: String(item.id), name: item.name, circle: item.circle ?? 0 }))
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR")
    const cantripOptions = free.filter((item) => item.circle === 0).sort(byName)
    const spellOptions = free.filter((item) => item.circle >= 1 && item.circle <= limits.maxCircle).sort((a, b) => a.circle - b.circle || byName(a, b))
    let swap = NO_SWAP
    if (resolveSpellSwap && known.some((spell) => spell.circle > 0) && spellOptions.length) {
        const traits = [...(ctx.cls.traits ?? []), ...(subclass?.traits ?? [])].filter((trait) => (trait.level ?? 1) <= target && SPELLCASTING_TRAIT.test(traitLabel(trait)))
        const mentions = traits.flatMap((trait) => parseMentionsFromHtml(trait.description).filter((mention) => mention.entityType === "Habilidade"))
        const texts = await loadTraitTexts(mentions.map((mention) => mention.id))
        const input = mentions.filter((mention) => texts.has(mention.id)).map((mention) => ({ id: mention.id, label: mention.label, text: texts.get(mention.id)! }))
        if (input.length) swap = await resolveSpellSwap({ classId: String(ctx.cls._id), subclassId: subclass ? subclassIdOf(subclass) : null, className: ctx.cls.name, traits: input }).catch(() => NO_SWAP)
    }
    if (!cantrips && !spells && !swap.allowed) return null
    return { cantrips: Math.min(cantrips, cantripOptions.length), spells: Math.min(spells, spellOptions.length), maxCircle: limits.maxCircle, cantripOptions, spellOptions, known, swap }
}

const totals = (slots: Record<string, { total: number }>) => Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, value.total]))

export function nextSpellSlots(ctx: LevelUpContext, target: number, subclass: CatalogSubclass | null) {
    const before = plainSlots(ctx.sheet.spellSlots)
    const source = spellSourceOf(ctx.cls, subclass)
    const after = source ? (mapSpellSlotsForLevel(target, { progressionTable: source.progression }, before) ?? {}) : before
    return { before, after }
}

/** Campos de menções depois da subida (traços de classe, subclasse, raça e o talento escolhido). */
export function nextMentionFields(ctx: LevelUpContext, target: number, subclass: CatalogSubclass | null, feat: ParsedMention | null) {
    const traits = gainedTraits(ctx, target, subclass)
    const toMention = (trait: LevelUpTraitOption): ParsedMention => ({ id: trait.id, entityType: "Habilidade", label: trait.label })
    const classFeatures = appendMentionsToHtml(ctx.sheet.classFeatures ?? "", traits.filter((trait) => trait.source !== "raça").map(toMention))
    const speciesTraits = appendMentionsToHtml(ctx.sheet.speciesTraits ?? "", traits.filter((trait) => trait.source === "raça").map(toMention))
    const notes = ctx.sheet.featuresNotes ?? ""
    const featuresNotes = feat ? `${notes}${mentionParagraphHtml(feat)}` : notes
    return { traits, classFeatures, speciesTraits, featuresNotes }
}

const plainLabel = (html: string) => parseMentionsFromHtml(html)[0]?.label ?? html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

/** Cargas dos recursos no nível novo (traços e talentos citados), preservando as gastas; mais o que mudou. */
export async function nextResourceCharges(ctx: LevelUpContext, fields: { classFeatures: string; speciesTraits: string; featuresNotes: string }, level: number, scores: Record<AttributeType, number>): Promise<{ rows: CharacterResourceCharge[]; changes: LevelUpResourceChange[] }> {
    const current = ctx.sheet.resourceCharges ?? []
    const bound = [
        ...parseMentionsFromHtml(fields.classFeatures).filter((mention) => mention.entityType === "Habilidade").map((mention) => ({ mention, kind: "class-feature" as const, entityType: "Habilidade" as const })),
        ...parseMentionsFromHtml(fields.speciesTraits).filter((mention) => mention.entityType === "Habilidade").map((mention) => ({ mention, kind: "species-trait" as const, entityType: "Habilidade" as const })),
        ...parseMentionsFromHtml(fields.featuresNotes).filter((mention) => mention.entityType === "Talento").map((mention) => ({ mention, kind: "feat" as const, entityType: "Talento" as const })),
    ]
    const charges = await loadCharges(
        bound.filter((row) => row.entityType === "Habilidade").map((row) => row.mention.id),
        bound.filter((row) => row.entityType === "Talento").map((row) => row.mention.id),
    )
    const mods = Object.fromEntries(ABILITY_KEYS.map((key) => [key, abilityModifier(scores[key])])) as Record<AttributeType, number>
    const context = { level, proficiencyBonus: getProficiencyBonus(level, ctx.sheet.proficiencyBonusOverride ?? null).value, attributeModifiers: mods }
    const rows = current.map((row) => ({ ...row }))
    const changes: LevelUpResourceChange[] = []
    const seen = new Set<string>()
    for (const { mention, kind, entityType } of bound) {
        const key = `${entityType}:${mention.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const index = rows.findIndex((row) => row.source?.entityId === mention.id && row.source?.entityType === entityType)
        const existing = index >= 0 ? rows[index]! : null
        const next = buildBoundResourceCharge({ entityId: mention.id, entityType, kind, nameHtml: mentionParagraphHtml(mention), charges: charges.get(mention.id) }, context, existing)
        if (!next) continue
        if (existing) {
            if (existing.total === next.total) continue
            rows[index] = next
        } else rows.push(next)
        changes.push({ name: plainLabel(next.name), before: existing?.total ?? null, after: next.total })
    }
    return { rows, changes }
}

export async function buildLevelUpOptions(sheetId: string, input: LevelUpOptionsInput = {}, loaded?: LevelUpContext): Promise<LevelUpOptions> {
    const ctx = loaded ?? (await loadLevelUpContext(sheetId))
    const current = ctx.sheet.level ?? 1
    if (current >= 20) throw new LevelUpError("O personagem já está no nível 20.")
    const target = current + 1
    const subclassRequired = !ctx.currentSubclass && target >= subclassLevel(ctx.cls.traits ?? []) && (ctx.cls.subclasses ?? []).length > 0
    const chosen = ctx.currentSubclass ?? (subclassRequired ? findSubclassById(ctx.cls, input.subclassId) : null)
    const slot = featSlotAt(ctx, target)
    const feats = slot ? await loadFeats() : []
    const scores = scoresOf(ctx)
    const conMod = abilityModifier(scores.constitution)
    const hitDie = ctx.cls.hitDice || ctx.sheet.hitDiceTotal || "d8"
    const fields = nextMentionFields(ctx, target, chosen, null)
    const resources = await nextResourceCharges(ctx, fields, target, scores)
    const slots = nextSpellSlots(ctx, target, chosen)
    return {
        sheetId: String(ctx.sheet._id),
        currentLevel: current,
        targetLevel: target,
        className: ctx.cls.name,
        hitDie,
        hitDieSides: hitDieSides(hitDie) ?? 8,
        constitutionModifier: conMod,
        hpAverage: averageHpGain(hitDie, conMod),
        hpMax: Number(ctx.sheet.hpMax ?? 0),
        subclass: {
            required: subclassRequired,
            options: subclassRequired ? (ctx.cls.subclasses ?? []).map((sub) => ({ id: subclassIdOf(sub), name: sub.name })) : [],
            current: ctx.currentSubclass ? { id: subclassIdOf(ctx.currentSubclass), name: ctx.currentSubclass.name } : null,
        },
        feat: slot ? { kind: slot.kind, options: featOptions(ctx, feats, slot, target), cap: slot.cap } : null,
        traits: fields.traits.filter((trait) => !(subclassRequired && trait.source === "subclasse")),
        subclassTraits: subclassRequired ? Object.fromEntries((ctx.cls.subclasses ?? []).map((sub) => [subclassIdOf(sub), traitOptions(traitMentions(sub.traits ?? [], (level) => level <= target), "subclasse")])) : {},
        spells: await spellStep(ctx, target, chosen, input.resolveSpellSwap),
        spellSlots: { before: totals(slots.before), after: totals(slots.after) },
        resources: resources.changes,
        scores,
    }
}
