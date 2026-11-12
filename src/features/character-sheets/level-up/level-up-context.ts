import { Types } from "mongoose"
import type { CatalogClass, CatalogFeat, CatalogRace, CatalogSubclass } from "@/features/maddox/server/character-build"
import type { Charges } from "@/features/shared/charges/types"
import type { AttributeType, CharacterResourceCharge } from "../types/character-sheet.types"
import { experienceValue } from "../utils/sheet-rules"

/**
 * Leitura da ficha e do catálogo para a subida de nível (DND-56) — SOMENTE servidor. Usada pelas opções e pela
 * aplicação, que precisam ver exatamente o mesmo estado.
 */

export class LevelUpError extends Error {
    constructor(
        message: string,
        readonly status = 422,
    ) {
        super(message)
    }
}

export const ABILITY_KEYS: AttributeType[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]

export interface LevelUpSheetDoc {
    _id: Types.ObjectId
    userId: string
    name: string
    level: number
    experience?: unknown
    class?: string
    subclass?: string
    classRef?: Types.ObjectId | null
    subclassRef?: Types.ObjectId | null
    raceRef?: Types.ObjectId | null
    hpMax?: number | null
    hpCurrent?: number | null
    hitDiceTotal?: string | null
    classFeatures?: string
    speciesTraits?: string
    featuresNotes?: string
    spellcastingAttribute?: AttributeType | null
    spellSlots?: Record<string, { total: number; used: number }> | Map<string, { total: number; used: number }>
    resourceCharges?: CharacterResourceCharge[]
    proficiencyBonusOverride?: number | null
    strength: number
    dexterity: number
    constitution: number
    intelligence: number
    wisdom: number
    charisma: number
}

export interface SheetSpellDoc {
    _id: Types.ObjectId
    catalogSpellId: Types.ObjectId | null
    name: string
    circle: number | null
}

export interface LevelUpContext {
    sheet: LevelUpSheetDoc
    cls: CatalogClass
    currentSubclass: CatalogSubclass | null
    race: CatalogRace | null
    spells: SheetSpellDoc[]
    experience: number
}

export const plainSlots = (slots: LevelUpSheetDoc["spellSlots"]): Record<string, { total: number; used: number }> =>
    slots instanceof Map ? Object.fromEntries(slots) : { ...(slots ?? {}) }

export const isObjectId = (value: string | null | undefined): value is string => Boolean(value && /^[a-f0-9]{24}$/i.test(value))

export async function loadLevelUpContext(sheetId: string): Promise<LevelUpContext> {
    if (!isObjectId(sheetId)) throw new LevelUpError("Ficha não encontrada.", 404)
    const [{ default: dbConnect }, { CharacterSheet }, { CharacterSpell }, { CharacterClass }, { RaceModel }] = await Promise.all([
        import("@/core/database/db"),
        import("../models/character-sheet"),
        import("../models/character-spell"),
        import("@/features/classes/models/character-class"),
        import("@/features/races/models/race"),
    ])
    await dbConnect()
    const sheet = await CharacterSheet.findById(sheetId).lean<LevelUpSheetDoc>()
    if (!sheet) throw new LevelUpError("Ficha não encontrada.", 404)
    if (!sheet.classRef) throw new LevelUpError("A ficha precisa de uma classe do catálogo para subir de nível.")
    const cls = await CharacterClass.findById(sheet.classRef).lean<CatalogClass>()
    if (!cls) throw new LevelUpError("A classe da ficha não está no catálogo.")
    const race = sheet.raceRef ? await RaceModel.findById(sheet.raceRef).lean<CatalogRace>() : null
    const currentSubclass = sheet.subclassRef ? (cls.subclasses ?? []).find((sub) => String(sub._id ?? "") === String(sheet.subclassRef)) ?? null : null
    const spells = await CharacterSpell.find({ sheetId: sheet._id }).select("_id catalogSpellId name circle").lean<SheetSpellDoc[]>()
    return { sheet, cls, currentSubclass, race, spells, experience: experienceValue(sheet.experience) }
}

export async function loadFeats(): Promise<CatalogFeat[]> {
    const { Feat } = await import("@/features/feats/models/feat")
    return Feat.find({ status: "active" }).select("_id name level category attributeBonuses charges").lean<CatalogFeat[]>()
}

/** Cargas dos traços e talentos citados (para os recursos). */
export async function loadCharges(traitIds: readonly string[], featIds: readonly string[]): Promise<Map<string, Charges | undefined>> {
    const ids = (values: readonly string[]) => [...new Set(values.filter(isObjectId))].map((id) => new Types.ObjectId(id))
    const [{ Trait }, { Feat }] = await Promise.all([import("@/features/traits/database/trait"), import("@/features/feats/models/feat")])
    const [traits, feats] = await Promise.all([
        Trait.find({ _id: { $in: ids(traitIds) } }).select("charges").lean<{ _id: Types.ObjectId; charges?: Charges }[]>(),
        Feat.find({ _id: { $in: ids(featIds) } }).select("charges").lean<{ _id: Types.ObjectId; charges?: Charges }[]>(),
    ])
    return new Map([...traits, ...feats].map((doc) => [String(doc._id), doc.charges]))
}

/** Texto dos traços (descrição sem HTML), para a decisão da troca de magia. */
export async function loadTraitTexts(traitIds: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(traitIds.filter(isObjectId))]
    if (!valid.length) return new Map()
    const { Trait } = await import("@/features/traits/database/trait")
    const docs = await Trait.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).select("name description").lean<{ _id: Types.ObjectId; name?: string; description?: string }[]>()
    return new Map(docs.map((doc) => [String(doc._id), `${doc.name ?? ""}\n${String(doc.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}`]))
}
