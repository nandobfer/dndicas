import { z } from "zod"
import { Types } from "mongoose"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { ClassProgressionData, ClassTrait } from "@/features/classes/types/classes.types"
import {
    MADDOX_BUILD_EQUIPMENT_MAX,
    MADDOX_BUILD_LIST_MAX,
    MADDOX_CATALOG_ORIGIN_RIGORS,
    MADDOX_CATALOG_TOOL_NAMES,
    MADDOX_INTERVIEW_TOOL_NAMES,
    MADDOX_LEVEL_MAX,
    MADDOX_LEVEL_MIN,
    MADDOX_SHEET_RIGORS,
    MADDOX_WORLD_CATALOG_RIGORS,
    type MaddoxRigorLevel,
} from "../constants"
import { worldAllows, worldCatalogOf, worldNames, type WorldCatalog } from "../world-catalog"
import { normalizeCatalogName } from "../catalog-markup"
import { MADDOX_ABILITY_LABELS, MADDOX_SKILLS } from "../check-modifier"
import { ABILITY_BY_LABEL, ABILITY_LABEL_LIST, finalScores, type AbilityScores } from "../interview-scores"
import {
    abilityModifier,
    applyFeatAttributes,
    expertiseCount,
    featAttributeCap,
    featAttributeRule,
    featSlots,
    requiresFightingStyle,
    spellLimits,
    subclassLevel,
    type FeatSlot,
    type SpellLimits,
    validateFeatAttributes,
} from "../character-build-rules"
import { MaddoxCampaignModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxBuildRef, type IMaddoxCharacterBuild, type IMaddoxExtraSpell, type IMaddoxInterview } from "../models"
import { submittedAbilityCard, submittedHitPointsCard } from "./interview-cards"

/**
 * Escolhas da ficha na entrevista de personagem (Maddox 5, graus com ficha) — SOMENTE servidor. O Maddox grava com
 * `update_character_build` (gravação parcial, validada contra o catálogo: tudo ou nada) e consulta com
 * `get_character_build`; o retorno traz o que falta (`faltando`). A ficha é montada a partir daqui (`sheet-builder.ts`).
 */

export class MaddoxBuildToolError extends Error {}

// ── Catálogo ────────────────────────────────────────────────────────────────────

interface NamedDoc {
    _id: Types.ObjectId
    name: string
    originalName?: string
}
interface QueryModel<T> {
    findOne(filter: Record<string, unknown>): { lean<R = T>(): Promise<R | null> }
    find(filter: Record<string, unknown>): { select(fields: string): { lean<R = T[]>(): Promise<R> } }
}

export interface CatalogSubclass {
    _id?: Types.ObjectId | string
    name: string
    spellcasting?: boolean
    spellcastingAttribute?: string
    spells?: { id: string; name: string; circle?: number }[]
    traits: ClassTrait[]
    progressionTable?: ClassProgressionData
}
export interface CatalogClass extends NamedDoc {
    hitDice: string
    savingThrows: string[]
    armorProficiencies: string[]
    weaponProficiencies: string[]
    skillCount: number
    availableSkills: string[]
    spellcasting: boolean
    spellcastingAttribute?: string
    spells?: { id: string; name: string; circle?: number }[]
    subclasses: CatalogSubclass[]
    traits: ClassTrait[]
    progressionTable?: ClassProgressionData
}
export interface CatalogRace extends NamedDoc {
    size?: string
    speed?: string
    traits: { name?: string; description: string; level?: number }[]
}
export interface CatalogBackground extends NamedDoc {
    skillProficiencies: string[]
    suggestedAttributes: string[]
    featId?: string
}
export interface CatalogFeat extends NamedDoc {
    level?: number
    category?: string
    attributeBonuses?: { attribute: string; value: number }[]
    charges?: unknown
}
export interface CatalogSpell extends NamedDoc {
    circle: number
    school?: string
    image?: string
    castingTime?: string
    range?: string
    component?: string[]
}
export interface CatalogItem extends NamedDoc {
    type?: string
    image?: string
    ac?: number
    acType?: "base" | "bonus"
    armorType?: string
    acBonus?: number
    damageDice?: { quantidade: number; tipo: string }
    damageType?: string
    properties?: { name?: string; description?: string }[]
    charges?: unknown
}

export type CatalogKind = "race" | "class" | "background" | "feat" | "spell" | "item"

const KIND_LABEL: Record<CatalogKind, string> = { race: "Raça", class: "Classe", background: "Origem", feat: "Talento", spell: "Magia", item: "Item" }

async function modelOf(kind: CatalogKind): Promise<QueryModel<NamedDoc>> {
    const model = await (async () => {
        if (kind === "race") return (await import("@/features/races/models/race")).RaceModel
        if (kind === "class") return (await import("@/features/classes/models/character-class")).CharacterClass
        if (kind === "background") return (await import("@/features/backgrounds/models/background")).BackgroundModel
        if (kind === "feat") return (await import("@/features/feats/models/feat")).Feat
        if (kind === "spell") return (await import("@/features/spells/models/spell")).Spell
        return (await import("@/features/items/database/item")).ItemModel
    })()
    return model as unknown as QueryModel<NamedDoc>
}

/** Entidade ATIVA do catálogo pelo id ou pelo nome/nome original (sem acento, caixa e espaços). */
export async function findCatalogEntity<T extends NamedDoc>(kind: CatalogKind, ref: string): Promise<T | null> {
    const model = await modelOf(kind)
    const value = ref.trim()
    if (Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value)) {
        const byId = await model.findOne({ _id: new Types.ObjectId(value), status: "active" }).lean<T>()
        if (byId) return byId
    }
    const wanted = normalizeCatalogName(value)
    if (!wanted) return null
    const all = await model.find({ status: "active" }).select("_id name originalName").lean<NamedDoc[]>()
    const hit = all.find((doc) => normalizeCatalogName(doc.name) === wanted || (doc.originalName && normalizeCatalogName(doc.originalName) === wanted))
    return hit ? model.findOne({ _id: hit._id }).lean<T>() : null
}

export async function catalogNames(kind: CatalogKind, limit = 40): Promise<string[]> {
    const model = await modelOf(kind)
    const all = await model.find({ status: "active" }).select("name").lean<NamedDoc[]>()
    return all.map((doc) => doc.name).sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, limit)
}

/** Nomes ATIVOS parecidos (mesmo começo de palavra), para sugerir quando um nome não está no catálogo. */
export async function similarCatalogNames(kind: CatalogKind, ref: string, limit = 10): Promise<string[]> {
    const stem = normalizeCatalogName(ref.trim().split(/\s+/)[0] ?? "").slice(0, 4)
    if (stem.length < 3) return []
    const model = await modelOf(kind)
    const all = await model.find({ status: "active" }).select("name").lean<NamedDoc[]>()
    return all
        .filter((doc) => doc.name.split(/\s+/).some((word) => normalizeCatalogName(word).startsWith(stem)))
        .map((doc) => doc.name)
        .slice(0, limit)
}

export const subclassRefId = (cls: Pick<CatalogClass, "_id">, sub: CatalogSubclass) => `subclass:${String(cls._id)}:${String(sub._id || sub.name)}`

export function findSubclass(cls: CatalogClass, ref: string): CatalogSubclass | null {
    const value = ref.trim()
    const wanted = normalizeCatalogName(value)
    return cls.subclasses.find((sub) => subclassRefId(cls, sub) === value || String(sub._id ?? "") === value || normalizeCatalogName(sub.name) === wanted) ?? null
}

// ── Estado ──────────────────────────────────────────────────────────────────────

export const emptyBuild = (): IMaddoxCharacterBuild => ({
    level: null,
    race: null,
    class: null,
    subclass: null,
    origin: null,
    classSkills: [],
    expertise: [],
    fightingStyle: null,
    feats: [],
    cantrips: [],
    spells: [],
    equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    languages: [],
    tools: [],
})

export interface BuildContext {
    rigor: MaddoxRigorLevel
    /** Nível da mesa (definido no cenário); `null` = o personagem informa. */
    startingLevel: number | null
    /** Povos e classes do mundo (Fiel ao D&D, Maddox 8); listas vazias ou ausente = todo o catálogo. */
    world?: WorldCatalog | null
}

/** Contexto da ficha a partir da campanha (rigor, nível da mesa e povos/classes do mundo). */
export function buildContextOfCampaign(campaign: Pick<IMaddoxCampaign, "rigor" | "startingLevel" | "worldCatalog">): BuildContext {
    return { rigor: campaign.rigor, startingLevel: campaign.startingLevel ?? null, world: MADDOX_WORLD_CATALOG_RIGORS.includes(campaign.rigor) ? worldCatalogOf(campaign.worldCatalog) : null }
}

/** Lista do mundo que restringe a raça ou a classe (só no Fiel ao D&D com lista gravada). */
const worldListOf = (ctx: BuildContext, kind: "race" | "class") => (ctx.world ? (kind === "race" ? ctx.world.races : ctx.world.classes) : [])

/** Raça e classe fora dos povos e classes do mundo (Fiel ao D&D): mensagens para a conclusão. */
export function outOfWorldItems(build: Pick<IMaddoxCharacterBuild, "race" | "class"> | null | undefined, ctx: BuildContext): string[] {
    const out: string[] = []
    const races = worldListOf(ctx, "race")
    const classes = worldListOf(ctx, "class")
    if (build?.race && !worldAllows(races, build.race.id)) out.push(`o povo ${build.race.name} não existe neste mundo (povos: ${worldNames(races)})`)
    if (build?.class && !worldAllows(classes, build.class.id)) out.push(`a classe ${build.class.name} não existe neste mundo (classes: ${worldNames(classes)})`)
    return out
}

export const effectiveLevel = (build: IMaddoxCharacterBuild | null | undefined, ctx: BuildContext) => ctx.startingLevel ?? build?.level ?? null
const strictCatalog = (ctx: BuildContext) => MADDOX_CATALOG_ORIGIN_RIGORS.includes(ctx.rigor)

/** Catálogo das escolhas atuais (classe, raça, origem, talentos, magias e itens), carregado de uma vez. */
export interface BuildCatalog {
    race: CatalogRace | null
    cls: CatalogClass | null
    subclass: CatalogSubclass | null
    background: CatalogBackground | null
    originFeat: CatalogFeat | null
    feats: Map<string, CatalogFeat>
    spells: Map<string, CatalogSpell>
    items: Map<string, CatalogItem>
}

async function byIds<T extends NamedDoc>(kind: CatalogKind, ids: readonly (string | null)[]): Promise<Map<string, T>> {
    const valid = [...new Set(ids.filter((id): id is string => Boolean(id && /^[a-f0-9]{24}$/i.test(id))))]
    if (!valid.length) return new Map()
    const model = await modelOf(kind)
    const docs = await model.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).select("").lean<T[]>()
    return new Map(docs.map((doc) => [String(doc._id), doc]))
}

export async function loadBuildCatalog(build: IMaddoxCharacterBuild): Promise<BuildCatalog> {
    const [race, cls, background] = await Promise.all([
        build.race?.id ? findCatalogEntity<CatalogRace>("race", build.race.id) : null,
        build.class?.id ? findCatalogEntity<CatalogClass>("class", build.class.id) : null,
        build.origin?.id ? findCatalogEntity<CatalogBackground>("background", build.origin.id) : null,
    ])
    const featIds = [...build.feats.map((feat) => feat.id), build.fightingStyle?.id ?? null, background?.featId ?? null]
    const [feats, spells, items] = await Promise.all([
        byIds<CatalogFeat>("feat", featIds),
        byIds<CatalogSpell>("spell", [...build.cantrips, ...build.spells, ...(build.extraSpells ?? [])].map((spell) => spell.id)),
        byIds<CatalogItem>("item", build.equipment.map((item) => item.id)),
    ])
    const subclass = cls && build.subclass?.id ? findSubclass(cls, build.subclass.id) : null
    return { race, cls, subclass, background, originFeat: background?.featId ? (feats.get(String(background.featId)) ?? null) : null, feats, spells, items }
}

/** Fonte das magias: a subclasse que conjura (com tabela) ou a classe. */
export function spellSource(catalog: Pick<BuildCatalog, "cls" | "subclass">): { progression: ClassProgressionData | undefined; list: { id: string; name: string; circle?: number }[]; attribute: string | null } | null {
    const sub = catalog.subclass
    if (sub && Object.keys(sub.progressionTable?.spellSlots ?? {}).length) return { progression: sub.progressionTable, list: sub.spells?.length ? sub.spells : (catalog.cls?.spells ?? []), attribute: sub.spellcastingAttribute ?? catalog.cls?.spellcastingAttribute ?? null }
    const cls = catalog.cls
    if (cls && Object.keys(cls.progressionTable?.spellSlots ?? {}).length) return { progression: cls.progressionTable, list: cls.spells ?? [], attribute: sub?.spellcastingAttribute ?? cls.spellcastingAttribute ?? null }
    return null
}

const allClassTraits = (catalog: Pick<BuildCatalog, "cls">) => catalog.cls?.traits ?? []

/** Regras da classe no nível (para validar e para mostrar ao modelo). */
export function classRules(catalog: BuildCatalog, level: number | null) {
    const lvl = level ?? 1
    const traits = allClassTraits(catalog)
    const source = spellSource(catalog)
    return {
        subclassLevel: catalog.cls ? subclassLevel(traits) : null,
        featSlots: catalog.cls ? featSlots(traits, lvl) : ([] as FeatSlot[]),
        fightingStyle: catalog.cls ? requiresFightingStyle(traits, lvl) : false,
        expertise: catalog.cls ? expertiseCount(traits, lvl) : 0,
        spells: source ? spellLimits(source.progression, lvl) : (null as SpellLimits | null),
    }
}

/** Atributos finais (card + bônus da origem + talentos); `null` sem card enviado. */
export function buildFinalScores(doc: Pick<IMaddoxInterview, "messages" | "build">): AbilityScores | null {
    const card = submittedAbilityCard(doc.messages)
    if (!card?.base) return null
    return applyFeatAttributes(finalScores(card.base, card.bonus?.parts), doc.build?.feats ?? [])
}

export const constitutionModifier = (doc: Pick<IMaddoxInterview, "messages" | "build">) => abilityModifier(buildFinalScores(doc)?.constitution ?? 10)

/** O card de PV enviado vale para o nível e o dado de vida atuais. */
export function hitPointsSettled(doc: Pick<IMaddoxInterview, "messages">, level: number, hitDie: string | null): boolean {
    if (level <= 1) return true
    const card = submittedHitPointsCard(doc.messages)
    return Boolean(card && card.level === level && card.hitDie === hitDie)
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** O que ainda falta para a ficha (lista para o modelo, a situação do turno e o 409 da conclusão). */
export function missingItems(doc: Pick<IMaddoxInterview, "messages" | "build">, catalog: BuildCatalog, ctx: BuildContext): string[] {
    const build = doc.build ?? emptyBuild()
    const level = effectiveLevel(build, ctx)
    const missing: string[] = []
    if (!level) missing.push("nível inicial")
    if (!build.race) missing.push("raça")
    if (!build.class) missing.push("classe")
    if (!build.origin) missing.push("origem")
    if (!submittedAbilityCard(doc.messages)) missing.push("atributos (card de atributos)")
    const rules = classRules(catalog, level)
    if (catalog.cls) {
        const left = catalog.cls.skillCount - build.classSkills.length
        if (left > 0) missing.push(`${plural(left, "perícia da classe", "perícias da classe")} (entre: ${catalog.cls.availableSkills.join(", ")})`)
        if (level && rules.subclassLevel !== null && level >= rules.subclassLevel && !build.subclass) missing.push(`subclasse (nível ${rules.subclassLevel})`)
        if (rules.fightingStyle && !build.fightingStyle) missing.push("estilo de luta (talento da categoria Estilo de Luta)")
        if (rules.expertise > build.expertise.length) missing.push(`${plural(rules.expertise - build.expertise.length, "perícia de Especialista", "perícias de Especialista")}`)
        for (const slot of rules.featSlots) if (!build.feats.some((feat) => feat.level === slot.level)) missing.push(`talento do nível ${slot.level}${slot.kind === "epic" ? " (Dádiva Épica)" : ""}`)
        if (rules.spells) {
            if (rules.spells.cantrips > build.cantrips.length) missing.push(plural(rules.spells.cantrips - build.cantrips.length, "truque", "truques"))
            if (rules.spells.prepared > build.spells.length) missing.push(`${plural(rules.spells.prepared - build.spells.length, "magia preparada", "magias preparadas")} (até o ${rules.spells.maxCircle}º círculo)`)
        }
    }
    missing.push(...extraSpellsMissing(build, catalog))
    if (!build.equipment.length) missing.push("equipamento inicial")
    if (!build.languages.length) missing.push("idiomas")
    if (level && level > 1 && catalog.cls && !hitPointsSettled(doc, level, catalog.cls.hitDice)) missing.push(`pontos de vida dos níveis 2 a ${level} (card de PV: \`${MADDOX_INTERVIEW_TOOL_NAMES.hitPoints}\`)`)
    return missing
}

const refText = (ref: IMaddoxBuildRef | null) => (ref ? `${ref.name}${ref.id ? "" : " (própria)"}` : null)

/** Resumo das escolhas (para o modelo e a situação do turno). */
export function buildSummary(doc: Pick<IMaddoxInterview, "messages" | "build">, catalog: BuildCatalog, ctx: BuildContext) {
    const build = doc.build ?? emptyBuild()
    const level = effectiveLevel(build, ctx)
    const rules = classRules(catalog, level)
    return {
        nivel: level,
        nivelDaMesa: ctx.startingLevel,
        raca: refText(build.race),
        classe: refText(build.class),
        subclasse: refText(build.subclass),
        origem: refText(build.origin),
        talentoDaOrigem: catalog.originFeat?.name ?? null,
        periciasDaOrigem: catalog.background?.skillProficiencies ?? [],
        periciasClasse: build.classSkills,
        especialista: build.expertise,
        estiloLuta: refText(build.fightingStyle),
        talentos: build.feats.map((feat) => ({ nivel: feat.level, talento: feat.name, atributos: Object.fromEntries(Object.entries(feat.attributes).map(([key, value]) => [MADDOX_ABILITY_LABELS[key as AttributeType], value])) })),
        truques: build.cantrips.map((spell) => spell.name),
        magias: build.spells.map((spell) => spell.name),
        magiasExtras: (build.extraSpells ?? []).map((spell) => ({ magia: spell.name, fonte: spell.source.name, circulo: spell.circle })),
        atributoConjuracao: build.spellcastingAttribute ? MADDOX_ABILITY_LABELS[build.spellcastingAttribute] : null,
        equipamento: build.equipment.map((item) => ({ item: `${item.name}${item.id ? "" : " (fora do catálogo)"}`, quantidade: item.quantity, equipado: item.equipped })),
        moedas: { po: build.coins.gp, pp: build.coins.sp, pc: build.coins.cp, pe: build.coins.ep, pl: build.coins.pp },
        idiomas: build.languages,
        ferramentas: build.tools,
        regras: {
            periciasDaClasse: catalog.cls ? { quantidade: catalog.cls.skillCount, opcoes: catalog.cls.availableSkills } : null,
            nivelDaSubclasse: rules.subclassLevel,
            niveisDeTalento: rules.featSlots.map((slot) => `${slot.level}${slot.kind === "epic" ? " (Dádiva Épica)" : ""}`),
            estiloDeLuta: rules.fightingStyle,
            especialista: rules.expertise,
            magias: rules.spells ? { truques: rules.spells.cantrips, preparadas: rules.spells.prepared, circuloMaximo: rules.spells.maxCircle } : null,
            dadoDeVida: catalog.cls?.hitDice ?? null,
        },
        faltando: missingItems(doc, catalog, ctx),
        ...(outOfWorldItems(build, ctx).length ? { foraDoMundo: outOfWorldItems(build, ctx) } : {}),
        ...(ctx.world && (ctx.world.races.length || ctx.world.classes.length) ? { mundo: { povos: ctx.world.races.map((item) => item.name), classes: ctx.world.classes.map((item) => item.name) } } : {}),
    }
}

/** Situação da ficha para o prompt de cada turno. */
export async function buildStatusText(doc: Pick<IMaddoxInterview, "messages" | "build">, ctx: BuildContext): Promise<string> {
    const catalog = await loadBuildCatalog(doc.build ?? emptyBuild())
    const summary = buildSummary(doc, catalog, ctx)
    const chosen = [
        summary.nivel ? `nível ${summary.nivel}${ctx.startingLevel ? " (da mesa)" : ""}` : null,
        summary.raca && `raça ${summary.raca}`,
        summary.classe && `classe ${summary.classe}`,
        summary.subclasse && `subclasse ${summary.subclasse}`,
        summary.origem && `origem ${summary.origem}`,
        summary.periciasClasse.length ? `perícias ${summary.periciasClasse.join(", ")}` : null,
        summary.talentos.length ? `talentos ${summary.talentos.map((feat) => `${feat.talento} (nível ${feat.nivel})`).join(", ")}` : null,
        summary.truques.length ? `truques ${summary.truques.join(", ")}` : null,
        summary.magias.length ? `magias ${summary.magias.join(", ")}` : null,
        summary.magiasExtras.length ? `magias da espécie e dos talentos ${summary.magiasExtras.map((spell) => `${spell.magia} (${spell.fonte})`).join(", ")}` : null,
        summary.atributoConjuracao ? `atributo de conjuração ${summary.atributoConjuracao}` : null,
        summary.equipamento.length ? `${summary.equipamento.length} itens de equipamento` : null,
        summary.idiomas.length ? `idiomas ${summary.idiomas.join(", ")}` : null,
    ].filter(Boolean)
    return [`- Já gravado: ${chosen.length ? chosen.join("; ") : "nada ainda"}.`, `- Falta: ${summary.faltando.length ? summary.faltando.join("; ") : "nada — a ficha está completa"}.`].join("\n")
}

// ── Gravação ────────────────────────────────────────────────────────────────────

const ref = z.string().trim().min(1).max(200)
const attributesShape = z.object(Object.fromEntries(ABILITY_LABEL_LIST.map((label) => [label, z.number().int().min(1).max(2).optional()]))).optional()

export const updateBuildInput = z.object({
    nivel: z.number().int().min(MADDOX_LEVEL_MIN).max(MADDOX_LEVEL_MAX).optional().describe("Nível inicial (só quando a mesa não definiu)"),
    raca: ref.optional().describe("Raça: id do search_catalog ou nome"),
    classe: ref.optional().describe("Classe: id ou nome"),
    subclasse: ref.optional().describe("Subclasse da classe: id `subclass:…` ou nome"),
    origem: ref.optional().describe("Origem (antecedente): id ou nome"),
    periciasClasse: z.array(z.enum(MADDOX_SKILLS as [SkillName, ...SkillName[]])).max(8).optional().describe("Perícias escolhidas da lista da classe"),
    especialista: z.array(z.enum(MADDOX_SKILLS as [SkillName, ...SkillName[]])).max(8).optional().describe("Perícias de Especialista (entre as proficientes)"),
    estiloLuta: ref.optional().describe("Talento da categoria Estilo de Luta"),
    talentos: z
        .array(z.object({ nivel: z.number().int().min(1).max(MADDOX_LEVEL_MAX), talento: ref, atributos: attributesShape.describe('Pontos de atributo do talento, ex.: { "Força": 2 } ou { "Força": 1, "Constituição": 1 }') }))
        .max(10)
        .optional()
        .describe("Talentos por nível de talento da classe (substitui a lista)"),
    truques: z.array(ref).max(10).optional().describe("Truques (substitui a lista)"),
    magias: z.array(ref).max(30).optional().describe("Magias preparadas (substitui a lista)"),
    magiasExtras: z
        .array(z.object({ fonte: ref.describe("A espécie ou o talento que concede a magia (id ou nome)"), magia: ref.describe("A magia (id ou nome)") }))
        .max(20)
        .optional()
        .describe("Magias que não vêm da classe: as da espécie e as dos talentos (ex.: os truques e a magia do Iniciado em Magia). Substitui a lista"),
    atributoConjuracao: z.enum(["Inteligência", "Sabedoria", "Carisma"]).optional().describe("Atributo de conjuração que o JOGADOR escolheu quando a espécie ou o talento oferece a escolha"),
    equipamento: z
        .array(z.object({ item: ref, quantidade: z.number().int().min(1).max(999).optional(), equipado: z.boolean().optional() }))
        .max(MADDOX_BUILD_EQUIPMENT_MAX)
        .optional()
        .describe("Equipamento inicial (substitui a lista): itens do catálogo; `equipado` para armadura, escudo e armas em uso"),
    moedas: z.object({ po: z.number().int().min(0).max(1_000_000).optional(), pp: z.number().int().min(0).max(1_000_000).optional(), pc: z.number().int().min(0).max(1_000_000).optional(), pe: z.number().int().min(0).max(1_000_000).optional(), pl: z.number().int().min(0).max(1_000_000).optional() }).optional(),
    idiomas: z.array(z.string().trim().min(1).max(60)).max(MADDOX_BUILD_LIST_MAX).optional(),
    ferramentas: z.array(z.string().trim().min(1).max(80)).max(MADDOX_BUILD_LIST_MAX).optional(),
})
export type UpdateBuildInput = z.infer<typeof updateBuildInput>

const sameRef = (a: IMaddoxBuildRef | null, b: IMaddoxBuildRef | null) => (a?.id ?? a?.name ?? null) === (b?.id ?? b?.name ?? null)

/**
 * Aplica a entrada sobre as escolhas atuais e valida tudo contra o catálogo. Erros = nada é gravado (lista com os
 * motivos e as opções). Trocar classe ou nível apaga as escolhas que dependiam deles (avisado).
 */
export async function applyBuildInput(doc: Pick<IMaddoxInterview, "messages" | "build">, input: UpdateBuildInput, ctx: BuildContext): Promise<{ build: IMaddoxCharacterBuild; warnings: string[]; clearHitPoints: boolean }> {
    const strict = strictCatalog(ctx)
    const current = doc.build ?? emptyBuild()
    const next: IMaddoxCharacterBuild = { ...emptyBuild(), ...current, coins: { ...emptyBuild().coins, ...current.coins } }
    const errors: string[] = []
    const warnings: string[] = []

    if (input.nivel !== undefined) {
        if (ctx.startingLevel && input.nivel !== ctx.startingLevel) errors.push(`O nível é da mesa: ${ctx.startingLevel}. Só o dono da campanha muda o nível inicial.`)
        else next.level = input.nivel
    }

    const resolveMain = async (kind: "race" | "class" | "background", value: string | undefined): Promise<IMaddoxBuildRef | null | undefined> => {
        if (value === undefined) return undefined
        const found = await findCatalogEntity(kind, value)
        if (found && kind !== "background") {
            // Fiel ao D&D: além do catálogo, a raça e a classe precisam existir no mundo combinado no cenário.
            const world = worldListOf(ctx, kind)
            if (!worldAllows(world, String(found._id))) {
                errors.push(`${kind === "race" ? "O povo" : "A classe"} “${found.name}” não existe no mundo desta campanha. Opções deste mundo: ${worldNames(world)}.`)
                return undefined
            }
        }
        if (found) return { id: String(found._id), name: found.name }
        if (strict) {
            errors.push(`${KIND_LABEL[kind]} “${value}” não está no catálogo do DnDicas. Opções: ${(await catalogNames(kind)).join(", ")}.`)
            return undefined
        }
        warnings.push(`${KIND_LABEL[kind]} “${value}” é própria (fora do catálogo): os campos dela na ficha ficam em texto, sem preenchimento automático.`)
        return { id: null, name: value.trim() }
    }
    const race = await resolveMain("race", input.raca)
    const cls = await resolveMain("class", input.classe)
    const origin = await resolveMain("background", input.origem)
    if (race) next.race = race
    if (origin) next.origin = origin
    let clearHitPoints = false
    if (cls && !sameRef(cls, current.class)) {
        next.class = cls
        if (current.class) {
            next.subclass = null
            next.classSkills = []
            next.expertise = []
            next.fightingStyle = null
            next.feats = []
            next.cantrips = []
            next.spells = []
            warnings.push("A classe mudou: subclasse, perícias da classe, Especialista, estilo de luta, talentos e magias foram apagados para escolher de novo.")
        }
        clearHitPoints = true
    }
    if (input.nivel !== undefined && next.level !== current.level) {
        clearHitPoints = true
        const kept = next.feats.filter((feat) => feat.level <= (next.level ?? 1))
        if (kept.length !== next.feats.length) warnings.push("Talentos acima do novo nível foram apagados.")
        next.feats = kept
    }

    const catalog = await loadBuildCatalog(next)
    const level = effectiveLevel(next, ctx) ?? 1
    const rules = classRules(catalog, level)

    if (input.subclasse !== undefined) {
        if (!next.class) errors.push("Escolha a classe antes da subclasse.")
        else if (!catalog.cls) next.subclass = { id: null, name: input.subclasse.trim() }
        else {
            const sub = findSubclass(catalog.cls, input.subclasse)
            if (!sub) {
                if (strict) errors.push(`A subclasse “${input.subclasse}” não é de ${catalog.cls.name}. Opções: ${catalog.cls.subclasses.map((item) => item.name).join(", ")}.`)
                else {
                    next.subclass = { id: null, name: input.subclasse.trim() }
                    warnings.push(`Subclasse “${input.subclasse}” é própria (fora do catálogo).`)
                }
            } else if (rules.subclassLevel !== null && level < rules.subclassLevel) errors.push(`${catalog.cls.name} escolhe a subclasse no nível ${rules.subclassLevel}; o personagem está no nível ${level}.`)
            else next.subclass = { id: subclassRefId(catalog.cls, sub), name: sub.name }
        }
    }
    const withSub = next.subclass?.id && catalog.cls ? { ...catalog, subclass: findSubclass(catalog.cls, next.subclass.id) } : catalog
    const finalRules = classRules(withSub, level)

    const originSkills = catalog.background?.skillProficiencies ?? []
    if (input.periciasClasse !== undefined) {
        const skills = [...new Set(input.periciasClasse)]
        if (catalog.cls) {
            const outside = skills.filter((skill) => !catalog.cls!.availableSkills.includes(skill))
            const repeated = skills.filter((skill) => originSkills.includes(skill))
            if (outside.length) errors.push(`${outside.join(", ")} não ${outside.length === 1 ? "está" : "estão"} entre as perícias de ${catalog.cls.name}: ${catalog.cls.availableSkills.join(", ")}.`)
            if (repeated.length) errors.push(`${repeated.join(", ")} já vem da origem: escolha outra perícia da classe.`)
            if (skills.length > catalog.cls.skillCount) errors.push(`${catalog.cls.name} escolhe ${catalog.cls.skillCount} perícias.`)
        }
        next.classSkills = skills
    }
    if (input.especialista !== undefined) {
        const skills = [...new Set(input.especialista)]
        const proficient = new Set([...originSkills, ...next.classSkills])
        if (catalog.cls && finalRules.expertise === 0) errors.push(`${catalog.cls.name} não tem Especialista no nível ${level}.`)
        else if (skills.length > finalRules.expertise && catalog.cls) errors.push(`Especialista no nível ${level}: ${finalRules.expertise} perícias.`)
        const notProficient = skills.filter((skill) => !proficient.has(skill))
        if (notProficient.length) errors.push(`Especialista só em perícias proficientes: ${notProficient.join(", ")} não ${notProficient.length === 1 ? "é" : "são"}.`)
        next.expertise = skills
    }

    const resolveFeat = async (value: string, label: string): Promise<CatalogFeat | IMaddoxBuildRef | null> => {
        const feat = await findCatalogEntity<CatalogFeat>("feat", value)
        if (feat) return feat
        if (strict) {
            errors.push(`${label}: o talento “${value}” não está no catálogo. Consulte \`${MADDOX_CATALOG_TOOL_NAMES.search}\` com { "tipos": ["Talento"] }.`)
            return null
        }
        warnings.push(`${label}: “${value}” é um talento próprio (fora do catálogo).`)
        return { id: null, name: value.trim() }
    }
    if (input.estiloLuta !== undefined) {
        if (catalog.cls && !finalRules.fightingStyle) errors.push(`${catalog.cls.name} não tem Estilo de Luta no nível ${level}.`)
        const feat = await resolveFeat(input.estiloLuta, "Estilo de luta")
        if (feat && "_id" in feat) {
            if (feat.category && feat.category !== "Estilo de Luta") errors.push(`“${feat.name}” não é um talento de Estilo de Luta.`)
            else next.fightingStyle = { id: String(feat._id), name: feat.name }
        } else if (feat) next.fightingStyle = feat
    }
    if (input.talentos !== undefined) {
        const feats: IMaddoxCharacterBuild["feats"] = []
        const levels = new Set<number>()
        for (const entry of input.talentos) {
            const label = `Talento do nível ${entry.nivel}`
            const slot = finalRules.featSlots.find((item) => item.level === entry.nivel)
            const extraOrigin = entry.nivel === 1
            if (catalog.cls && !slot && !extraOrigin) {
                errors.push(`${label}: ${catalog.cls.name} não ganha talento nesse nível. Níveis de talento até o ${level}: ${finalRules.featSlots.map((item) => item.level).join(", ") || "nenhum"}.`)
                continue
            }
            if (entry.nivel > level) {
                errors.push(`${label}: acima do nível do personagem (${level}).`)
                continue
            }
            if (levels.has(entry.nivel)) {
                errors.push(`${label}: um talento por nível.`)
                continue
            }
            levels.add(entry.nivel)
            const feat = await resolveFeat(entry.talento, label)
            if (!feat) continue
            const parts = Object.fromEntries(Object.entries(entry.atributos ?? {}).filter(([, value]) => typeof value === "number").map(([key, value]) => [ABILITY_BY_LABEL[key], value])) as Partial<Record<AttributeType, number>>
            if (!("_id" in feat)) {
                feats.push({ level: entry.nivel, id: "", name: feat.name, attributes: {} })
                continue
            }
            const epic = slot?.kind === "epic"
            if (extraOrigin && !slot && feat.category && feat.category !== "Origem") errors.push(`${label}: no nível 1 (talento extra, como o do Humano Versátil) só talentos de Origem.`)
            if (epic && feat.category && feat.category !== "Dádiva Épica") errors.push(`${label}: no nível ${entry.nivel} vale uma Dádiva Épica, e “${feat.name}” é da categoria ${feat.category}.`)
            if (!epic && slot && feat.category === "Dádiva Épica") errors.push(`${label}: Dádiva Épica só no nível dela.`)
            if ((feat.level ?? 1) > entry.nivel) errors.push(`${label}: “${feat.name}” exige nível ${feat.level}.`)
            const attrError = validateFeatAttributesSafe(feat, parts)
            if (attrError) errors.push(`${label}: ${attrError}`)
            feats.push({ level: entry.nivel, id: String(feat._id), name: feat.name, attributes: parts, cap: featAttributeCap(epic) })
        }
        next.feats = feats.sort((a, b) => a.level - b.level)
    }

    const source = spellSource(withSub)
    const resolveSpells = async (values: string[] | undefined, cantrip: boolean): Promise<IMaddoxBuildRef[] | undefined> => {
        if (values === undefined) return undefined
        const label = cantrip ? "Truque" : "Magia"
        const limit = finalRules.spells ? (cantrip ? finalRules.spells.cantrips : finalRules.spells.prepared) : 0
        if (catalog.cls && !finalRules.spells) {
            if (values.length) errors.push(`${catalog.cls.name} não conjura magias no nível ${level}${next.subclass ? ` com ${next.subclass.name}` : ""}.`)
            return []
        }
        if (catalog.cls && values.length > limit) errors.push(`${cantrip ? "Truques" : "Magias preparadas"} no nível ${level}: ${limit}.`)
        const out: IMaddoxBuildRef[] = []
        for (const value of values) {
            const spell = await findCatalogEntity<CatalogSpell>("spell", value)
            if (!spell) {
                if (strict || catalog.cls) errors.push(`${label} “${value}” não está no catálogo.`)
                else out.push({ id: null, name: value.trim() })
                continue
            }
            if (cantrip && spell.circle !== 0) errors.push(`“${spell.name}” não é truque (${spell.circle}º círculo).`)
            if (!cantrip && spell.circle === 0) errors.push(`“${spell.name}” é truque: use \`truques\`.`)
            if (!cantrip && finalRules.spells && spell.circle > finalRules.spells.maxCircle) errors.push(`“${spell.name}” é do ${spell.circle}º círculo; no nível ${level} o máximo é o ${finalRules.spells.maxCircle}º.`)
            if (source?.list.length && !source.list.some((item) => String(item.id) === String(spell._id))) errors.push(`“${spell.name}” não está na lista de magias de ${next.subclass?.name && source.list !== (catalog.cls?.spells ?? []) ? next.subclass.name : (catalog.cls?.name ?? "da classe")}.`)
            if (!out.some((item) => item.id === String(spell._id))) out.push({ id: String(spell._id), name: spell.name })
        }
        return out
    }
    if (input.magiasExtras !== undefined) {
        const extra: IMaddoxExtraSpell[] = []
        const sources = extraSpellSources(next, withSub)
        for (const entry of input.magiasExtras) {
            const wanted = normalizeCatalogName(entry.fonte)
            const source = sources.find((item) => item.id === entry.fonte.trim() || normalizeCatalogName(item.name) === wanted)
            if (!source) {
                errors.push(`Magia extra: “${entry.fonte}” não é a espécie nem um talento deste personagem (${sources.map((item) => item.name).join(", ") || "nenhum"}).`)
                continue
            }
            const spell = await findCatalogEntity<CatalogSpell>("spell", entry.magia)
            if (!spell) {
                errors.push(`Magia extra “${entry.magia}” não está no catálogo.`)
                continue
            }
            if (!extra.some((item) => item.id === String(spell._id))) extra.push({ id: String(spell._id), name: spell.name, circle: spell.circle, source })
        }
        next.extraSpells = extra
    }
    if (input.atributoConjuracao !== undefined) next.spellcastingAttribute = ABILITY_BY_LABEL[input.atributoConjuracao] ?? null

    const cantrips = await resolveSpells(input.truques, true)
    const spells = await resolveSpells(input.magias, false)
    if (cantrips) next.cantrips = cantrips
    if (spells) next.spells = spells

    if (input.equipamento !== undefined) {
        const equipment: IMaddoxCharacterBuild["equipment"] = []
        const docs: (CatalogItem | null)[] = []
        for (const entry of input.equipamento) {
            const item = await findCatalogEntity<CatalogItem>("item", entry.item)
            if (!item && strict) {
                errors.push(`Item “${entry.item}” não está no catálogo. Consulte \`${MADDOX_CATALOG_TOOL_NAMES.search}\` com { "tipos": ["Item"] }.`)
                continue
            }
            docs.push(item)
            equipment.push({ id: item ? String(item._id) : null, name: item?.name ?? entry.item.trim(), quantity: entry.quantidade ?? 1, equipped: Boolean(entry.equipado) })
        }
        const equippedArmor = equipment.filter((entry, index) => entry.equipped && docs[index]?.type === "armadura" && docs[index]?.acType === "base")
        const equippedShields = equipment.filter((entry, index) => entry.equipped && docs[index]?.type === "escudo")
        if (equippedArmor.length > 1) errors.push(`Só uma armadura equipada por vez (${equippedArmor.map((item) => item.name).join(", ")}).`)
        if (equippedShields.length > 1) errors.push("Só um escudo equipado por vez.")
        if (!strict) for (const entry of equipment) if (!entry.id) warnings.push(`Item “${entry.name}” fora do catálogo: entra na ficha só como texto.`)
        next.equipment = equipment
    }
    if (input.moedas) {
        next.coins = { gp: input.moedas.po ?? next.coins.gp, sp: input.moedas.pp ?? next.coins.sp, cp: input.moedas.pc ?? next.coins.cp, ep: input.moedas.pe ?? next.coins.ep, pp: input.moedas.pl ?? next.coins.pp }
    }
    if (input.idiomas) next.languages = [...new Set(input.idiomas)]
    if (input.ferramentas) next.tools = [...new Set(input.ferramentas)]

    const bonusOrigin = submittedAbilityCard(doc.messages)?.bonus?.background
    if (next.origin && bonusOrigin && normalizeCatalogName(bonusOrigin) !== normalizeCatalogName(next.origin.name)) {
        warnings.push(`O bônus de atributos foi aplicado para “${bonusOrigin}”, mas a origem da ficha é “${next.origin.name}”: reaplique o bônus com \`${MADDOX_INTERVIEW_TOOL_NAMES.bonus}\`.`)
    }
    if (errors.length) throw new MaddoxBuildToolError(`Nada foi gravado. ${errors.join(" ")}`)
    return { build: next, warnings, clearHitPoints }
}

/** Fontes das magias extras: a espécie e os talentos do personagem (o da origem, o estilo de luta e os de nível). */
function extraSpellSources(build: IMaddoxCharacterBuild, catalog: BuildCatalog): IMaddoxExtraSpell["source"][] {
    const out: IMaddoxExtraSpell["source"][] = []
    if (build.race) out.push({ kind: "race", id: build.race.id, name: build.race.name })
    if (catalog.originFeat) out.push({ kind: "feat", id: String(catalog.originFeat._id), name: catalog.originFeat.name })
    for (const feat of [...build.feats, ...(build.fightingStyle ? [build.fightingStyle] : [])]) if (!out.some((item) => item.name === feat.name)) out.push({ kind: "feat", id: feat.id || null, name: feat.name })
    return out
}

const grantsSpells = (text: string | undefined) => /\btruques?\b|\bmagias? de 1|\bvoc[eê] (sabe|conhece|aprende)\b/i.test(text ?? "")

/**
 * DND-51: a espécie ou um talento que concede magias (texto com "truque") e ainda não tem magia extra registrada; e o
 * atributo de conjuração quando há magia extra sem atributo da classe.
 */
function extraSpellsMissing(build: IMaddoxCharacterBuild, catalog: BuildCatalog): string[] {
    const extra = build.extraSpells ?? []
    const missing: string[] = []
    const raceText = (catalog.race?.traits ?? []).map((trait) => trait.description).join(" ")
    if (catalog.race && grantsSpells(raceText) && !extra.some((spell) => spell.source.kind === "race")) missing.push(`magias da espécie ${catalog.race.name} (\`magiasExtras\`)`)
    const feats = [catalog.originFeat, ...build.feats.map((feat) => (feat.id ? (catalog.feats.get(feat.id) ?? null) : null))].filter((feat): feat is CatalogFeat => Boolean(feat))
    for (const feat of feats) {
        if (grantsSpells((feat as CatalogFeat & { description?: string }).description) && !extra.some((spell) => spell.source.kind === "feat" && spell.source.name === feat.name)) missing.push(`magias do talento ${feat.name} (\`magiasExtras\`)`)
    }
    if (extra.length && !spellSource(catalog)?.attribute && !build.spellcastingAttribute) missing.push("atributo de conjuração das magias da espécie e dos talentos (escolha do jogador: `atributoConjuracao`)")
    return missing
}

function validateFeatAttributesSafe(feat: CatalogFeat, parts: Partial<Record<AttributeType, number>>): string | null {
    return validateFeatAttributes(featAttributeRule(feat), parts, feat.name)
}

// ── Ferramentas ─────────────────────────────────────────────────────────────────

export interface BuildToolContext {
    interviewId: Types.ObjectId
    lockToken: string
}

async function loadForBuild(context: BuildToolContext): Promise<{ doc: IMaddoxInterview; ctx: BuildContext }> {
    const doc = await MaddoxInterviewModel.findOne({ _id: context.interviewId, "generating.token": context.lockToken }).lean<IMaddoxInterview>()
    if (!doc) throw new MaddoxBuildToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
    if (doc.kind !== "character") throw new MaddoxBuildToolError("A ficha só existe na entrevista de personagem.")
    const campaign = await MaddoxCampaignModel.findById(doc.campaignId).select("rigor startingLevel worldCatalog").lean<Pick<IMaddoxCampaign, "rigor" | "startingLevel" | "worldCatalog">>()
    if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new MaddoxBuildToolError("Este grau de rigor não usa ficha: o personagem é só narrativo.")
    return { doc, ctx: buildContextOfCampaign(campaign) }
}

export async function updateCharacterBuild(context: BuildToolContext, input: UpdateBuildInput) {
    const { doc, ctx } = await loadForBuild(context)
    const { build, warnings, clearHitPoints } = await applyBuildInput(doc, input, ctx)
    const saved = await MaddoxInterviewModel.updateOne({ _id: context.interviewId, "generating.token": context.lockToken }, { $set: { build, ...(clearHitPoints && doc.hitPointRolls?.length ? { hitPointRolls: null } : {}) } })
    if (saved.matchedCount === 0) throw new MaddoxBuildToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
    const fresh = { ...doc, build }
    const summary = buildSummary(fresh, await loadBuildCatalog(build), ctx)
    return { gravado: true, ...summary, ...(warnings.length ? { avisos: warnings } : {}) }
}

export async function getCharacterBuild(context: BuildToolContext) {
    const { doc, ctx } = await loadForBuild(context)
    return buildSummary(doc, await loadBuildCatalog(doc.build ?? emptyBuild()), ctx)
}

export const BUILD_TOOL_DESCRIPTIONS = {
    update: `Grava as escolhas da ficha do personagem (só o que vier; o resto fica). Valida contra o catálogo e devolve o que falta (\`faltando\`). Se algo for inválido, NADA é gravado e o erro traz o motivo e as opções. Use ids ou nomes do \`${MADDOX_CATALOG_TOOL_NAMES.search}\`. Listas (talentos, truques, magias, magias extras, equipamento, idiomas, ferramentas) substituem as anteriores. Magias da espécie e dos talentos (ex.: Iniciado em Magia) vão em \`magiasExtras\`, com a fonte; quando a espécie ou o talento manda escolher o atributo de conjuração, pergunte ao jogador e grave a escolha dele em \`atributoConjuracao\` (nunca escolha por ele). Grave assim que o jogador confirmar cada escolha.`,
    get: "Consulta as escolhas da ficha, as regras da classe no nível (perícias, subclasse, níveis de talento, magias, dado de vida) e o que falta. Use antes da síntese: ela só vale com `faltando` vazio.",
}
