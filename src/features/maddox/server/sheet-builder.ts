import { Types } from "mongoose"
import type { AttributeType, CharacterResourceCharge, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { Charges } from "@/features/shared/charges/types"
import { getProficiencyBonus } from "@/features/character-sheets/utils/dnd-calculations"
import {
    buildBoundResourceCharge,
    buildMentionHtml,
    buildSpellAttackAutofill,
    buildWeaponAttackAutofill,
    collectTraitMentionsUpTo,
    dedupeMentions,
    escapeHtmlText,
    getAutoSpellAttackNotes,
    getLevelOneHpMax,
    mapCatalogAttributeToSheetAttribute,
    mapHitDiceToSheetHitDice,
    mapSpellSlotsForLevel,
    mentionParagraphHtml,
    resolveCatalogItemType,
    type ParsedMention,
} from "@/features/character-sheets/utils/sheet-rules"
import type { AttributeType as CatalogAttributeType } from "@/features/classes/types/classes.types"
import { MENTION_HREF_PREFIX } from "@/features/opex-agent/mentions"
import { CATALOG_MARKUP } from "../catalog-markup"
import { MADDOX_SKILLS } from "../check-modifier"
import { ABILITY_KEYS, type AbilityScores } from "../interview-scores"
import { abilityModifier, hitPointsTotal } from "../character-build-rules"
import type { CharacterSheetSeed } from "../interview-schemas"
import type { IMaddoxCharacterBuild, IMaddoxInterview } from "../models"
import { buildFinalScores, effectiveLevel, emptyBuild, loadBuildCatalog, spellSource, subclassRefId, type BuildCatalog, type BuildContext, type CatalogItem, type CatalogSpell } from "./character-build"
import { submittedHitPointsCard } from "./interview-cards"
import { linkCatalogMentions } from "./catalog-mentions"
import { itemMastery } from "./catalog-references"
import { isWeaponMasteryFeature, masteryLimit, type MaddoxMasteryKey } from "../weapon-mastery"

/**
 * Ficha D&D COMPLETA montada no servidor a partir das escolhas da entrevista (Maddox 5): os mesmos valores que o
 * preenchimento automático da ficha produz no navegador (menções de raça/classe/subclasse/origem com as referências,
 * dado de vida, PV, salvaguardas, proficiências, traços, talentos, espaços de magia e cargas) mais itens, ataques e
 * magias. A ficha criada pela entrevista é reconstruída inteira a cada tentativa (sem duplicar coleções).
 */

const SHEET_TEXT_MAX = 2_000
const ARMOR_KEY: Record<string, "light" | "medium" | "heavy" | "shields"> = { "Armaduras Leves": "light", "Armaduras Médias": "medium", "Armaduras Pesadas": "heavy", Escudos: "shields" }

const paragraph = (mention: ParsedMention) => mentionParagraphHtml(mention)
const mentionsHtml = (mentions: ParsedMention[]) => dedupeMentions(mentions).map(paragraph).join("")
const textParagraph = (text: string) => `<p>${escapeHtmlText(text)}</p>`

/** Remove a marcação `{{Tipo:Nome}}` deixando só o nome (campos de texto simples da ficha). */
export const stripCatalogMarkup = (text: string) => text.replace(CATALOG_MARKUP, (_whole, _type: string, name: string) => name.trim()).replace(/\*\*/g, "").trim()

const MENTION_LINK = new RegExp(`\\[([^\\]\\n]+)\\]\\(${MENTION_HREF_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^):\\s]+):([^)\\s]+)\\)`, "g")

/**
 * Texto do modelo (parágrafos, **negrito** e citações `{{Tipo:Nome}}`) no HTML rico da ficha: citações do catálogo
 * viram menções (as não encontradas, só o nome), negrito vira `<strong>`.
 */
export async function textToSheetHtml(text: string | null | undefined, reserved: string[] = []): Promise<string> {
    const raw = (text ?? "").trim()
    if (!raw) return ""
    const linked = await linkCatalogMentions(raw, { reserved })
    return linked
        .split(/\n\s*\n|\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
            const tokens: string[] = []
            const withTokens = block.replace(MENTION_LINK, (_whole, label: string, type: string, id: string) => {
                tokens.push(buildMentionHtml({ id: decodeURIComponent(id), entityType: decodeURIComponent(type), label }))
                return `\u0000${tokens.length - 1}\u0000`
            })
            const html = escapeHtmlText(withTokens.replace(/^#+\s*/, "").replace(/^[-*]\s+/, "• "))
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                .replace(/\u0000(\d+)\u0000/g, (_whole, index: string) => tokens[Number(index)] ?? "")
            return `<p>${html}</p>`
        })
        .join("")
}

const plain = (value: string | null | undefined, max = SHEET_TEXT_MAX) => stripCatalogMarkup(value ?? "").slice(0, max)

/** Valores derivados (sem banco): o que vai no `$set` da ficha. */
export function deriveSheetFields(build: IMaddoxCharacterBuild, catalog: BuildCatalog, scores: AbilityScores, level: number, hitPoints: { choices: Record<string, "average" | "roll"> | null; rolls: { level: number; die: number }[] }) {
    const set: Record<string, unknown> = { level, ...scores }
    const mods = Object.fromEntries(ABILITY_KEYS.map((key) => [key, abilityModifier(scores[key])])) as Record<AttributeType, number>
    const prof = getProficiencyBonus(level, null).value

    const field = (ref: { id: string | null; name: string } | null, entityType: string, id?: string | null) => (ref ? (id ? paragraph({ id, entityType, label: ref.name }) : textParagraph(ref.name)) : "")
    set.race = field(build.race, "Raça", catalog.race ? String(catalog.race._id) : null)
    set.class = field(build.class, "Classe", catalog.cls ? String(catalog.cls._id) : null)
    set.subclass = field(build.subclass, "Subclasse", catalog.cls && catalog.subclass ? subclassRefId(catalog.cls, catalog.subclass) : null)
    set.origin = field(build.origin, "Origem", catalog.background ? String(catalog.background._id) : null)
    set.raceRef = catalog.race?._id ?? null
    set.classRef = catalog.cls?._id ?? null
    // A referência é o `_id` da subclasse (o assistente da ficha compara por ele); a menção usa o id da busca.
    set.subclassRef = catalog.subclass?._id && Types.ObjectId.isValid(String(catalog.subclass._id)) ? new Types.ObjectId(String(catalog.subclass._id)) : null
    set.originRef = catalog.background?._id ?? null

    if (catalog.race) {
        if (catalog.race.size) set.size = catalog.race.size
        if (catalog.race.speed) set.movementSpeed = catalog.race.speed
    }

    const savingThrows = Object.fromEntries(ABILITY_KEYS.map((key) => [key, false])) as Record<AttributeType, boolean>
    const skills = Object.fromEntries(MADDOX_SKILLS.map((skill) => [skill, { proficient: false, expertise: false }])) as Record<SkillName, { proficient: boolean; expertise: boolean }>
    for (const skill of [...(catalog.background?.skillProficiencies ?? []), ...build.classSkills]) if (skill in skills) skills[skill as SkillName].proficient = true
    for (const skill of build.expertise) if (skill in skills) skills[skill as SkillName] = { proficient: true, expertise: true }
    set.skills = skills

    if (catalog.cls) {
        const cls = catalog.cls
        for (const attr of cls.savingThrows ?? []) {
            const key = mapCatalogAttributeToSheetAttribute(attr as CatalogAttributeType)
            if (key) savingThrows[key] = true
        }
        set.hitDiceTotal = mapHitDiceToSheetHitDice(cls.hitDice as never)
        set.armorTraining = {
            light: cls.armorProficiencies.some((item) => ARMOR_KEY[item] === "light"),
            medium: cls.armorProficiencies.some((item) => ARMOR_KEY[item] === "medium"),
            heavy: cls.armorProficiencies.some((item) => ARMOR_KEY[item] === "heavy"),
            shields: cls.armorProficiencies.some((item) => ARMOR_KEY[item] === "shields"),
        }
        set.weaponProficiencies = (cls.weaponProficiencies ?? []).join(", ")
        const con = mods.constitution
        const total = level > 1 ? hitPointsTotal(level, cls.hitDice, con, hitPoints.choices, hitPoints.rolls) : getLevelOneHpMax(cls.hitDice, con)
        if (total !== null) {
            set.hpMax = total
            set.hpCurrent = total
        }
        set.classFeatures = mentionsHtml([...collectTraitMentionsUpTo(cls.traits ?? [], level), ...collectTraitMentionsUpTo(catalog.subclass?.traits ?? [], level)])
        const source = spellSource(catalog)
        if (source) {
            set.spellcastingAttribute = mapCatalogAttributeToSheetAttribute(source.attribute as CatalogAttributeType)
            set.spellSlots = mapSpellSlotsForLevel(level, { progressionTable: source.progression })
        }
    }
    set.savingThrows = savingThrows
    if (catalog.race) set.speciesTraits = mentionsHtml(collectTraitMentionsUpTo(catalog.race.traits ?? [], level))

    const featMentions: ParsedMention[] = []
    const featText: string[] = []
    if (catalog.originFeat) featMentions.push({ id: String(catalog.originFeat._id), entityType: "Talento", label: catalog.originFeat.name })
    if (build.fightingStyle) {
        if (build.fightingStyle.id) featMentions.push({ id: build.fightingStyle.id, entityType: "Talento", label: build.fightingStyle.name })
        else featText.push(build.fightingStyle.name)
    }
    for (const feat of build.feats) {
        if (feat.id) featMentions.push({ id: feat.id, entityType: "Talento", label: feat.name })
        else featText.push(feat.name)
    }
    set.featuresNotes = mentionsHtml(featMentions) + featText.map(textParagraph).join("")
    set.toolProficiencies = build.tools.join(", ")
    set.coins = { ...build.coins }
    if (build.languages.length) set.notes = textParagraph(`Idiomas: ${build.languages.join(", ")}`)
    return { set, mods, prof, featMentions }
}

/** Cargas dos traços, talentos e itens (como o preenchimento da ficha). */
async function resourceCharges(set: Record<string, unknown>, featMentions: ParsedMention[], items: CatalogItem[], level: number, prof: number, mods: Record<AttributeType, number>): Promise<CharacterResourceCharge[]> {
    const { parseMentionsFromHtml } = await import("@/features/character-sheets/utils/sheet-rules")
    const traitMentions = [
        ...parseMentionsFromHtml(String(set.classFeatures ?? "")).map((mention) => ({ mention, kind: "class-feature" as const })),
        ...parseMentionsFromHtml(String(set.speciesTraits ?? "")).map((mention) => ({ mention, kind: "species-trait" as const })),
    ].filter(({ mention }) => mention.entityType === "Habilidade")
    const ids = (values: string[]) => values.filter((id) => /^[a-f0-9]{24}$/i.test(id)).map((id) => new Types.ObjectId(id))
    const [{ Trait }, { Feat }] = await Promise.all([import("@/features/traits/database/trait"), import("@/features/feats/models/feat")])
    const [traits, feats] = await Promise.all([
        Trait.find({ _id: { $in: ids(traitMentions.map(({ mention }) => mention.id)) } }).select("charges").lean<{ _id: Types.ObjectId; charges?: Charges }[]>(),
        Feat.find({ _id: { $in: ids(featMentions.map((mention) => mention.id)) } }).select("charges").lean<{ _id: Types.ObjectId; charges?: Charges }[]>(),
    ])
    const chargesOf = new Map([...traits, ...feats].map((doc) => [String(doc._id), doc.charges]))
    const context = { level, proficiencyBonus: prof, attributeModifiers: mods }
    const rows = [
        ...traitMentions.map(({ mention, kind }) => buildBoundResourceCharge({ entityId: mention.id, entityType: "Habilidade", kind, nameHtml: paragraph(mention), charges: chargesOf.get(mention.id) }, context)),
        ...featMentions.map((mention) => buildBoundResourceCharge({ entityId: mention.id, entityType: "Talento", kind: "feat", nameHtml: paragraph(mention), charges: chargesOf.get(mention.id) }, context)),
        ...items.map((item) => buildBoundResourceCharge({ entityId: String(item._id), entityType: "Item", kind: "item", nameHtml: paragraph({ id: String(item._id), entityType: "Item", label: item.name }), charges: item.charges as Charges | undefined }, context)),
    ]
    const seen = new Set<string>()
    return rows.filter((row): row is CharacterResourceCharge => {
        if (!row?.source) return false
        const key = `${row.source.entityType}:${row.source.entityId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

const armorType = (value?: string | null) => (value === "leve" || value === "média" || value === "pesada" ? value : null)

export interface BuildSheetInput {
    sheetId: Types.ObjectId
    name: string
    portraitUrl: string | null
    doc: Pick<IMaddoxInterview, "messages" | "build" | "hitPointRolls">
    seed: CharacterSheetSeed | null
    ctx: BuildContext
    reserved: string[]
}

/** Ficha que a entrevista gera (campos + itens, ataques e magias), sem gravar: a conclusão grava; o reinício (DND-50) compara. */
export interface ComputedCharacterSheet {
    set: Record<string, unknown>
    items: Record<string, unknown>[]
    attacks: Record<string, unknown>[]
    spells: Record<string, unknown>[]
}

/** Calcula a ficha completa da entrevista (sem gravar nada). */
export async function computeCharacterSheet(input: BuildSheetInput): Promise<ComputedCharacterSheet> {
    const build = input.doc.build ?? emptyBuild()
    const catalog = await loadBuildCatalog(build)
    const level = effectiveLevel(build, input.ctx) ?? 1
    const scores = buildFinalScores(input.doc)
    if (!scores) throw new Error("Atributos não enviados")
    const hpCard = submittedHitPointsCard(input.doc.messages)
    const { set, mods, prof, featMentions } = deriveSheetFields(build, catalog, scores, level, { choices: hpCard?.choices ?? null, rolls: input.doc.hitPointRolls ?? [] })
    set.name = input.name
    if (input.portraitUrl) set.photo = input.portraitUrl

    const seed = input.seed
    if (seed) {
        for (const key of ["age", "height", "weight", "eyes", "skin", "hair"] as const) if (seed[key]) set[key] = plain(seed[key])
        const [appearance, history, personalityTraits, ideals, bonds, flaws] = await Promise.all(
            (["appearance", "history", "personalityTraits", "ideals", "bonds", "flaws"] as const).map((key) => textToSheetHtml(seed[key], input.reserved)),
        )
        Object.assign(set, Object.fromEntries(Object.entries({ appearance, history, personalityTraits, ideals, bonds, flaws }).filter(([, value]) => value)))
    }

    const items = build.equipment.map((entry) => ({ entry, item: entry.id ? (catalog.items.get(entry.id) ?? null) : null }))
    set.resourceCharges = await resourceCharges(set, featMentions, items.filter((row): row is { entry: typeof row.entry; item: CatalogItem } => Boolean(row.item)).map((row) => row.item), level, prof, mods)
    set.weaponMasteries = await initialWeaponMasteries(catalog, level, items.map((row) => row.item))

    const itemDocs = items.map(({ entry, item }) => {
        const label = item?.name ?? entry.name
        return {
            sheetId: input.sheetId,
            catalogItemId: item ? item._id : null,
            name: item ? paragraph({ id: String(item._id), entityType: "Item", label }) : textParagraph(label),
            image: item?.image || null,
            quantity: entry.quantity,
            notes: "",
            equipped: entry.equipped,
            catalogItemType: item ? resolveCatalogItemType(item) : null,
            catalogAc: item?.ac ?? null,
            catalogAcType: item?.acType ?? null,
            catalogArmorType: armorType(item?.armorType),
            catalogAcBonus: item?.acBonus ?? null,
        }
    })

    const calc = { profBonus: { value: prof }, attrMods: { strength: { value: mods.strength }, dexterity: { value: mods.dexterity } } }
    const attacks: { sheetId: Types.ObjectId; name: string; attackBonus: string; damageType: string; notes: string }[] = []
    for (const { entry, item } of items) {
        if (!item || !entry.equipped || resolveCatalogItemType(item) !== "arma") continue
        attacks.push({ sheetId: input.sheetId, name: paragraph({ id: String(item._id), entityType: "Item", label: item.name }), ...buildWeaponAttackAutofill(item as never, calc), notes: "" })
    }

    const source = spellSource(catalog)
    // DND-51: sem atributo da classe, vale o que o jogador escolheu para as magias da espécie e dos talentos.
    const attribute = (source?.attribute ? mapCatalogAttributeToSheetAttribute(source.attribute as CatalogAttributeType) : null) ?? build.spellcastingAttribute ?? null
    if (!set.spellcastingAttribute && build.spellcastingAttribute) set.spellcastingAttribute = build.spellcastingAttribute
    const spellMod = attribute ? mods[attribute] : 0
    const extraSpells = (build.extraSpells ?? []).filter((extra) => ![...build.cantrips, ...build.spells].some((ref) => ref.id === extra.id))
    const spellDocs = [...build.cantrips, ...build.spells, ...extraSpells].map((ref) => {
        const spell = ref.id ? (catalog.spells.get(ref.id) ?? null) : null
        return catalogSpellDoc(input.sheetId, ref.name, spell)
    })
    for (const ref of [...build.cantrips, ...extraSpells]) {
        const spell = ref.id ? (catalog.spells.get(ref.id) as (CatalogSpell & { baseDice?: { quantidade: number; tipo: string } }) | undefined) : undefined
        if (!spell || spell.circle !== 0 || !spell.baseDice) continue
        attacks.push({ sheetId: input.sheetId, name: paragraph({ id: String(spell._id), entityType: "Magia", label: spell.name }), ...buildSpellAttackAutofill(spell as never, { spellAttackBonus: { value: prof + spellMod } }, level), notes: getAutoSpellAttackNotes(String(spell._id)) })
    }
    return { set, items: itemDocs, attacks, spells: spellDocs }
}

/** Grava a ficha completa (campos + itens, ataques e magias). */
export async function writeCharacterSheet(input: BuildSheetInput): Promise<void> {
    const computed = await computeCharacterSheet(input)
    const [{ CharacterSheet }, { CharacterItem }, { CharacterAttack }, { CharacterSpell }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-spell"),
    ])
    await CharacterSheet.updateOne({ _id: input.sheetId }, { $set: computed.set })

    // Coleções reconstruídas: confirmar de novo não duplica nada.
    await Promise.all([CharacterItem.deleteMany({ sheetId: input.sheetId }), CharacterAttack.deleteMany({ sheetId: input.sheetId }), CharacterSpell.deleteMany({ sheetId: input.sheetId })])
    if (computed.items.length) await CharacterItem.insertMany(computed.items)
    if (computed.spells.length) await CharacterSpell.insertMany(computed.spells)
    if (computed.attacks.length) await CharacterAttack.insertMany(computed.attacks)
}

/**
 * Maestrias de arma da consolidação (DND-49), só pelo catálogo, sem IA: a classe (ou subclasse) tem até o nível uma
 * característica "Maestria em/com Arma(s)"; o limite vem da coluna da progressão ou do número no texto dela (decisão do
 * dono D1); as armas são as do equipamento que têm maestria no catálogo, na ordem do inventário. O catálogo não marca
 * arma simples/marcial, então vale o equipamento escolhido na entrevista. Sem como decidir, fica vazio e a preparação do
 * combate propõe (com fonte).
 */
export async function initialWeaponMasteries(catalog: Pick<BuildCatalog, "cls" | "subclass">, level: number, items: readonly (CatalogItem | null)[]): Promise<{ catalogItemId: Types.ObjectId; mastery: MaddoxMasteryKey }[]> {
    const cls = catalog.cls
    if (!cls) return []
    const feature = [...collectTraitMentionsUpTo(cls.traits ?? [], level), ...collectTraitMentionsUpTo(catalog.subclass?.traits ?? [], level)].find((mention) => isWeaponMasteryFeature(mention.label))
    if (!feature) return []
    const { Trait } = await import("@/features/traits/database/trait")
    const trait = Types.ObjectId.isValid(feature.id) ? await Trait.findOne({ _id: new Types.ObjectId(feature.id), status: "active" }).select("description").lean<{ description?: string }>() : null
    const limit = masteryLimit((cls as { progressionTable?: Parameters<typeof masteryLimit>[0] }).progressionTable, level, trait?.description ? plain(trait.description) : "")
    if (!limit) return []
    const chosen: { catalogItemId: Types.ObjectId; mastery: MaddoxMasteryKey }[] = []
    for (const item of items) {
        if (chosen.length >= limit) break
        if (!item || resolveCatalogItemType(item) !== "arma" || chosen.some((entry) => String(entry.catalogItemId) === String(item._id))) continue
        const mastery = itemMastery((item as CatalogItem & { mastery?: unknown }).mastery)?.key
        if (mastery) chosen.push({ catalogItemId: new Types.ObjectId(String(item._id)), mastery })
    }
    return chosen
}

/** Registro de magia da ficha a partir do catálogo (entrevista e correções do Maddox, DND-51). */
export function catalogSpellDoc(sheetId: Types.ObjectId, name: string, spell: CatalogSpell | null) {
    const components = spell?.component ?? []
    return {
        sheetId,
        catalogSpellId: spell ? spell._id : null,
        name: spell ? paragraph({ id: String(spell._id), entityType: "Magia", label: spell.name }) : textParagraph(name),
        circle: spell?.circle ?? null,
        school: spell?.school ?? "",
        image: spell?.image || null,
        prepared: true,
        components,
        castingTime: spell?.castingTime ?? "",
        range: spell?.range ?? "",
        concentration: components.includes("Concentração"),
        ritual: components.includes("Ritual"),
        material: components.includes("Material"),
        notes: "",
    }
}
