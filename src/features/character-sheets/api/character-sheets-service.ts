import dbConnect from "@/core/database/db"
import Fuse from "fuse.js"
import { CharacterSheet, type ICharacterSheet } from "../models/character-sheet"
import { CharacterItem } from "../models/character-item"
import { CharacterSpell } from "../models/character-spell"
import { CharacterTrait } from "../models/character-trait"
import { CharacterFeat } from "../models/character-feat"
import { CharacterAttack } from "../models/character-attack"
import { generateSlug } from "../utils/slug"
import type {
    SheetsListResponse,
    CharacterSheetFull,
    PatchSheetBody,
    CreateItemBody,
    PatchItemBody,
    CreateSpellBody,
    PatchSpellBody,
    CreateTraitBody,
    CreateFeatBody,
    CreateAttackBody,
    PatchAttackBody,
} from "../types/character-sheet.types"
import type { Types } from "mongoose"

// ─── Sheets ───────────────────────────────────────────────────────────────────

export async function getAllUserSheets(
    userId: string,
    search?: string,
    page = 1,
    limit = 12,
): Promise<SheetsListResponse> {
    await dbConnect()

    const all = await CharacterSheet.find({ userId }).sort({ updatedAt: -1 }).lean()

    const searched = search
        ? new Fuse(all, {
              keys: [
                  { name: "name", weight: 10 },
                  { name: "class", weight: 5 },
                  { name: "race", weight: 5 },
                  { name: "subclass", weight: 3 },
              ],
              threshold: 0.35,
          })
              .search(search)
              .map((r) => r.item)
        : all

    const total = searched.length
    const totalPages = Math.ceil(total / limit) || 1
    const start = (page - 1) * limit
    const sheets = searched.slice(start, start + limit)

    return {
        sheets: sheets.map(toPlainSheet),
        total,
        page,
        totalPages,
        hasNextPage: page < totalPages,
    }
}

export async function createBlankSheet(userId: string) {
    await dbConnect()

    const doc = await CharacterSheet.create({
        userId,
        name: "Nova Ficha",
        slug: generateSlug(new Date().getTime().toString(), "Nova Ficha"),
    })

    // Set slug with the real mongo _id
    doc.slug = generateSlug(String(doc._id), doc.name)
    await doc.save()

    return toPlainSheet(doc.toObject())
}

export async function getSheetById(id: string): Promise<CharacterSheetFull | null> {
    await dbConnect()

    const sheet = await CharacterSheet.findById(id).lean()
    if (!sheet) return null

    const sheetId = sheet._id as Types.ObjectId

    const [items, spells, traits, feats, attacks] = await Promise.all([
        CharacterItem.find({ sheetId }).lean(),
        CharacterSpell.find({ sheetId }).lean(),
        CharacterTrait.find({ sheetId }).sort({ origin: 1, name: 1 }).lean(),
        CharacterFeat.find({ sheetId }).lean(),
        CharacterAttack.find({ sheetId }).lean(),
    ])

    return {
        ...toPlainSheet(sheet),
        items: items.map(toPlain),
        spells: spells.map(toPlain),
        traits: traits.map(toPlain),
        feats: feats.map(toPlain),
        attacks: attacks.map(toPlain),
    } as unknown as CharacterSheetFull
}

export async function patchSheet(id: string, userId: string, data: PatchSheetBody) {
    await dbConnect()

    const sheet = await CharacterSheet.findOneAndUpdate(
        { _id: id, userId },
        { $set: data },
        { new: true },
    ).lean()

    if (!sheet) return null
    return toPlainSheet(sheet)
}

export async function deleteSheet(id: string, userId: string): Promise<boolean> {
    await dbConnect()

    const sheet = await CharacterSheet.findOne({ _id: id, userId }).lean()
    if (!sheet) return false

    await Promise.all([
        CharacterItem.deleteMany({ sheetId: id }),
        CharacterSpell.deleteMany({ sheetId: id }),
        CharacterTrait.deleteMany({ sheetId: id }),
        CharacterFeat.deleteMany({ sheetId: id }),
        CharacterAttack.deleteMany({ sheetId: id }),
    ])
    await CharacterSheet.deleteOne({ _id: id })
    return true
}

export async function applyLongRest(id: string, userId: string) {
    await dbConnect()

    const sheet = await CharacterSheet.findOne({ _id: id, userId })
    if (!sheet) return null

    // Restore all HP (current ← max)
    sheet.hpCurrent = sheet.hpMax

    // Restore all spell slots
    const slots = sheet.spellSlots as unknown as Map<string, { max: number; used: number }>
    for (const [circle, slot] of slots.entries()) {
        slots.set(circle, { max: slot.max, used: 0 })
    }
    sheet.markModified("spellSlots")

    // Unmark all exhausted items  
    await CharacterSpell.updateMany({ sheetId: id }, { $set: { prepared: false } })

    await sheet.save()
    return toPlainSheet(sheet.toObject())
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function getItems(sheetId: string) {
    await dbConnect()
    const items = await CharacterItem.find({ sheetId }).lean()
    return items.map(toPlain)
}

export async function createItem(sheetId: string, data: CreateItemBody) {
    await dbConnect()
    const item = await CharacterItem.create({ sheetId, ...data })
    return toPlain(item.toObject())
}

export async function updateItem(sheetId: string, itemId: string, data: PatchItemBody) {
    await dbConnect()
    const item = await CharacterItem.findOneAndUpdate(
        { _id: itemId, sheetId },
        { $set: data },
        { new: true },
    ).lean()
    return item ? toPlain(item) : null
}

export async function deleteItem(sheetId: string, itemId: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterItem.deleteOne({ _id: itemId, sheetId })
    return result.deletedCount > 0
}

// ─── Spells ───────────────────────────────────────────────────────────────────

export async function getSpells(sheetId: string) {
    await dbConnect()
    const spells = await CharacterSpell.find({ sheetId }).lean()
    return spells.map(toPlain)
}

export async function createSpell(sheetId: string, data: CreateSpellBody) {
    await dbConnect()
    const spell = await CharacterSpell.create({ sheetId, ...data })
    return toPlain(spell.toObject())
}

export async function updateSpell(sheetId: string, spellId: string, data: PatchSpellBody) {
    await dbConnect()
    const spell = await CharacterSpell.findOneAndUpdate(
        { _id: spellId, sheetId },
        { $set: data },
        { new: true },
    ).lean()
    return spell ? toPlain(spell) : null
}

export async function deleteSpell(sheetId: string, spellId: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterSpell.deleteOne({ _id: spellId, sheetId })
    return result.deletedCount > 0
}

// ─── Traits ───────────────────────────────────────────────────────────────────

export async function getTraits(sheetId: string) {
    await dbConnect()
    const traits = await CharacterTrait.find({ sheetId }).sort({ origin: 1, name: 1 }).lean()
    return traits.map(toPlain)
}

export async function createTrait(sheetId: string, data: CreateTraitBody) {
    await dbConnect()
    const trait = await CharacterTrait.create({ sheetId, ...data })
    return toPlain(trait.toObject())
}

export async function deleteTrait(sheetId: string, traitId: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterTrait.deleteOne({ _id: traitId, sheetId })
    return result.deletedCount > 0
}

// ─── Feats ────────────────────────────────────────────────────────────────────

export async function getFeats(sheetId: string) {
    await dbConnect()
    const feats = await CharacterFeat.find({ sheetId }).lean()
    return feats.map(toPlain)
}

export async function createFeat(sheetId: string, data: CreateFeatBody) {
    await dbConnect()
    const feat = await CharacterFeat.create({ sheetId, ...data })
    return toPlain(feat.toObject())
}

export async function deleteFeat(sheetId: string, featId: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterFeat.deleteOne({ _id: featId, sheetId })
    return result.deletedCount > 0
}

// ─── Attacks ──────────────────────────────────────────────────────────────────

export async function getAttacks(sheetId: string) {
    await dbConnect()
    const attacks = await CharacterAttack.find({ sheetId }).lean()
    return attacks.map(toPlain)
}

export async function createAttack(sheetId: string, data: CreateAttackBody) {
    await dbConnect()
    const attack = await CharacterAttack.create({ sheetId, ...data })
    return toPlain(attack.toObject())
}

export async function updateAttack(sheetId: string, attackId: string, data: PatchAttackBody) {
    await dbConnect()
    const attack = await CharacterAttack.findOneAndUpdate(
        { _id: attackId, sheetId },
        { $set: data },
        { new: true },
    ).lean()
    return attack ? toPlain(attack) : null
}

export async function deleteAttack(sheetId: string, attackId: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterAttack.deleteOne({ _id: attackId, sheetId })
    return result.deletedCount > 0
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlain(doc: any) {
    const obj = { ...doc }
    if (obj._id) obj._id = String(obj._id)
    if (obj.sheetId) obj.sheetId = String(obj.sheetId)
    if (obj.catalogItemId) obj.catalogItemId = String(obj.catalogItemId)
    if (obj.catalogSpellId) obj.catalogSpellId = String(obj.catalogSpellId)
    if (obj.catalogTraitId) obj.catalogTraitId = String(obj.catalogTraitId)
    if (obj.catalogFeatId) obj.catalogFeatId = String(obj.catalogFeatId)
    return obj
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlainSheet(doc: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { ...doc }
    if (obj._id) obj._id = String(obj._id)

    // Convert Maps to plain objects for JSON serialisation
    if (obj.savingThrows instanceof Map) {
        obj.savingThrows = Object.fromEntries(obj.savingThrows)
    }
    if (obj.skills instanceof Map) {
        obj.skills = Object.fromEntries(obj.skills)
    }
    if (obj.spellSlots instanceof Map) {
        obj.spellSlots = Object.fromEntries(obj.spellSlots)
    }
    // lean() returns plain objects but savingThrows/skills/spellSlots may be plain already
    return obj
}
