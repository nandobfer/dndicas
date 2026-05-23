import dbConnect from "@/core/database/db"
import Fuse from "fuse.js"
import { CharacterSheetPusherService } from "../realtime/character-sheet-pusher-service"
import { CharacterSheet } from "../models/character-sheet"
import { CharacterItem } from "../models/character-item"
import { CharacterSpell } from "../models/character-spell"
import { CharacterTrait } from "../models/character-trait"
import { CharacterFeat } from "../models/character-feat"
import { CharacterAttack } from "../models/character-attack"
import { User } from "@/features/users/models/user"
import { generateSlug } from "../utils/slug"
import { getArmorClass } from "../utils/dnd-calculations"
import type {
    AdminSheetsListResponse,
    CharacterItem as CharacterItemType,
    CharacterSheet as CharacterSheetType,
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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

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
    const sheetIds = sheets.map((sheet) => String(sheet._id))
    const equippedItems = sheetIds.length > 0
        ? (await CharacterItem.find({ sheetId: { $in: sheetIds }, equipped: true }).lean()).map(toPlain) as CharacterItemType[]
        : []

    return {
        sheets: sheets.map((sheet) => withComputedArmorClass(toPlainSheet(sheet), equippedItems)),
        total,
        page,
        totalPages,
        hasNextPage: page < totalPages,
    }
}

export async function getAllSheetsForAdmin(search?: string, page = 1, limit = 10): Promise<AdminSheetsListResponse> {
    await dbConnect()

    const safePage = Math.max(1, page)
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const skip = (safePage - 1) * safeLimit
    const regex = search?.trim() ? new RegExp(escapeRegex(search.trim()), "i") : null

    const ownerCollection = User.collection.name
    const matchStage = regex
        ? {
              $match: {
                  $or: [
                      { name: regex },
                      { class: regex },
                      { subclass: regex },
                      { race: regex },
                      { origin: regex },
                      { username: regex },
                      { "owner.name": regex },
                      { "owner.username": regex },
                  ],
              },
          }
        : null

    const [result] = await CharacterSheet.aggregate([
        {
            $lookup: {
                from: ownerCollection,
                localField: "userId",
                foreignField: "clerkId",
                as: "owner",
            },
        },
        {
            $addFields: {
                owner: { $arrayElemAt: ["$owner", 0] },
            },
        },
        ...(matchStage ? [matchStage] : []),
        {
            $facet: {
                items: [
                    { $sort: { updatedAt: -1, _id: -1 } },
                    { $skip: skip },
                    { $limit: safeLimit },
                    {
                        $project: {
                            _id: 1,
                            slug: 1,
                            name: 1,
                            photo: 1,
                            class: 1,
                            subclass: 1,
                            race: 1,
                            origin: 1,
                            createdAt: 1,
                            updatedAt: 1,
                            userId: 1,
                            username: 1,
                            owner: {
                                _id: "$owner._id",
                                name: "$owner.name",
                                username: "$owner.username",
                                avatarUrl: "$owner.avatarUrl",
                            },
                        },
                    },
                ],
                meta: [{ $count: "total" }],
            },
        },
    ])

    const total = result?.meta?.[0]?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / safeLimit))
    const items = (result?.items ?? []).map((item: {
        _id: Types.ObjectId | string
        slug: string
        name?: string
        photo?: string | null
        class?: string
        subclass?: string
        race?: string
        origin?: string
        createdAt: Date | string
        updatedAt: Date | string
        owner?: {
            _id?: Types.ObjectId | string
            name?: string
            username?: string
            avatarUrl?: string | null
        }
        username?: string
    }) => ({
        id: String(item._id),
        slug: item.slug,
        name: item.name || "Ficha sem nome",
        photo: item.photo ?? null,
        class: item.class || "—",
        subclass: item.subclass || "—",
        race: item.race || "—",
        origin: item.origin || "—",
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString(),
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : new Date(item.updatedAt).toISOString(),
        owner: {
            id: item.owner?._id ? String(item.owner._id) : null,
            name: item.owner?.name || item.username || "Usuário desconhecido",
            username: item.owner?.username || item.username || "sem-username",
            avatarUrl: item.owner?.avatarUrl ?? null,
        },
    }))

    return {
        items,
        total,
        page: safePage,
        totalPages,
    }
}

export async function createBlankSheet(userId: string, username: string, name?: string) {
    await dbConnect()

    const sheetName = name || "Nova Ficha"
    const tempSlug = generateSlug(username || userId, `${sheetName} ${Date.now()}`)
    const doc = await CharacterSheet.create({
        userId,
        username: username || "",
        name: sheetName,
        slug: tempSlug,
    })

    // Set slug with the real name, ensuring uniqueness
    doc.slug = await ensureUniqueSlug(username || userId, doc.name, String(doc._id))
    await doc.save()

    return toPlainSheet(doc.toObject())
}

export async function getSheetBySlug(slug: string): Promise<CharacterSheetFull | null> {
    await dbConnect()

    // New format: username/character-name
    let sheet = await CharacterSheet.findOne({ slug }).lean()

    // Backward compat: old format mongoId-name (single segment, no slash)
    if (!sheet && !slug.includes("/")) {
        const id = slug.split("-")[0]
        if (/^[0-9a-f]{24}$/i.test(id)) {
            sheet = await CharacterSheet.findById(id).lean()
        }
    }

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

export async function patchSheet(id: string, userId: string, data: PatchSheetBody, originId?: string) {
    await dbConnect()

    // When name changes, also update the slug
    const updateData: Record<string, unknown> = { ...data }
    if (data.name !== undefined) {
        const existing = await CharacterSheet.findOne({ _id: id, userId }, { username: 1 }).lean()
        if (existing) {
            const username = (existing as { username?: string }).username || userId
            updateData.slug = await ensureUniqueSlug(username, data.name, id)
        }
    }

    const sheet = await CharacterSheet.findOneAndUpdate(
        { _id: id, userId },
        { $set: updateData },
        { returnDocument: 'after' },
    ).lean()

    if (!sheet) return null
    const plainSheet = toPlainSheet(sheet)
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishSheetPatched({ sheet: plainSheet, originId })
    })
    return plainSheet
}

export async function patchSheetWithAccess(id: string, data: PatchSheetBody, originId?: string) {
    await dbConnect()

    const existing = await CharacterSheet.findById(id, { username: 1, userId: 1 }).lean()
    if (!existing) return null

    const updateData: Record<string, unknown> = { ...data }
    if (data.name !== undefined) {
        const username = (existing as { username?: string; userId?: string }).username || (existing as { userId?: string }).userId || id
        updateData.slug = await ensureUniqueSlug(username, data.name, id)
    }

    const sheet = await CharacterSheet.findByIdAndUpdate(
        id,
        { $set: updateData },
        { returnDocument: 'after' },
    ).lean()

    if (!sheet) return null
    const plainSheet = toPlainSheet(sheet)
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishSheetPatched({ sheet: plainSheet, originId })
    })
    return plainSheet
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

export async function applyLongRest(id: string, userId: string, originId?: string) {
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
    const plainSheet = toPlainSheet(sheet.toObject())
    const spells = await getSpells(id)

    await publishCharacterSheetRealtime(async () => {
        await Promise.all([
            getCharacterSheetPusherService().publishSheetPatched({ sheet: plainSheet, originId }),
            getCharacterSheetPusherService().publishCollectionChanged({
                sheetId: id,
                collection: "spells",
                action: "reloaded",
                originId,
                records: spells,
            }),
        ])
    })

    return plainSheet
}

export async function applyLongRestWithAccess(id: string, originId?: string) {
    await dbConnect()

    const sheet = await CharacterSheet.findById(id)
    if (!sheet) return null

    sheet.hpCurrent = sheet.hpMax

    const slots = sheet.spellSlots as unknown as Map<string, { max: number; used: number }>
    for (const [circle, slot] of slots.entries()) {
        slots.set(circle, { max: slot.max, used: 0 })
    }
    sheet.markModified("spellSlots")

    await CharacterSpell.updateMany({ sheetId: id }, { $set: { prepared: false } })

    await sheet.save()
    const plainSheet = toPlainSheet(sheet.toObject())
    const spells = await getSpells(id)

    await publishCharacterSheetRealtime(async () => {
        await Promise.all([
            getCharacterSheetPusherService().publishSheetPatched({ sheet: plainSheet, originId }),
            getCharacterSheetPusherService().publishCollectionChanged({
                sheetId: id,
                collection: "spells",
                action: "reloaded",
                originId,
                records: spells,
            }),
        ])
    })

    return plainSheet
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function getItems(sheetId: string) {
    await dbConnect()
    const items = await CharacterItem.find({ sheetId }).lean()
    return items.map(toPlain)
}

export async function createItem(sheetId: string, data: CreateItemBody, originId?: string) {
    await dbConnect()
    const item = await CharacterItem.create({ sheetId, ...data })
    const plainItem = toPlain(item.toObject())
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "items",
            action: "created",
            originId,
            recordId: plainItem._id,
            record: plainItem,
        })
    })
    return plainItem
}

export async function updateItem(sheetId: string, itemId: string, data: PatchItemBody, originId?: string) {
    await dbConnect()
    const item = await CharacterItem.findOneAndUpdate(
        { _id: itemId, sheetId },
        { $set: data },
        { returnDocument: 'after' },
    ).lean()
    if (!item) return null

    const plainItem = toPlain(item)
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "items",
            action: "updated",
            originId,
            recordId: plainItem._id,
            record: plainItem,
        })
    })
    return plainItem
}

export async function deleteItem(sheetId: string, itemId: string, originId?: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterItem.deleteOne({ _id: itemId, sheetId })
    const deleted = result.deletedCount > 0
    if (deleted) {
        await publishCharacterSheetRealtime(async () => {
            await getCharacterSheetPusherService().publishCollectionChanged({
                sheetId,
                collection: "items",
                action: "deleted",
                originId,
                recordId: itemId,
            })
        })
    }
    return deleted
}

// ─── Spells ───────────────────────────────────────────────────────────────────

export async function getSpells(sheetId: string) {
    await dbConnect()
    const spells = await CharacterSpell.find({ sheetId }).lean()
    return spells.map(toPlain)
}

export async function createSpell(sheetId: string, data: CreateSpellBody, originId?: string) {
    await dbConnect()
    const spell = await CharacterSpell.create({ sheetId, ...data })
    const plainSpell = toPlain(spell.toObject())
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "spells",
            action: "created",
            originId,
            recordId: plainSpell._id,
            record: plainSpell,
        })
    })
    return plainSpell
}

export async function updateSpell(sheetId: string, spellId: string, data: PatchSpellBody, originId?: string) {
    await dbConnect()
    const spell = await CharacterSpell.findOneAndUpdate(
        { _id: spellId, sheetId },
        { $set: data },
        { returnDocument: 'after' },
    ).lean()
    if (!spell) return null

    const plainSpell = toPlain(spell)
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "spells",
            action: "updated",
            originId,
            recordId: plainSpell._id,
            record: plainSpell,
        })
    })
    return plainSpell
}

export async function deleteSpell(sheetId: string, spellId: string, originId?: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterSpell.deleteOne({ _id: spellId, sheetId })
    const deleted = result.deletedCount > 0
    if (deleted) {
        await publishCharacterSheetRealtime(async () => {
            await getCharacterSheetPusherService().publishCollectionChanged({
                sheetId,
                collection: "spells",
                action: "deleted",
                originId,
                recordId: spellId,
            })
        })
    }
    return deleted
}

// ─── Traits ───────────────────────────────────────────────────────────────────

export async function getTraits(sheetId: string) {
    await dbConnect()
    const traits = await CharacterTrait.find({ sheetId }).sort({ origin: 1, name: 1 }).lean()
    return traits.map(toPlain)
}

export async function createTrait(sheetId: string, data: CreateTraitBody, originId?: string) {
    await dbConnect()
    const trait = await CharacterTrait.create({ sheetId, ...data })
    const plainTrait = toPlain(trait.toObject())
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "traits",
            action: "created",
            originId,
            recordId: plainTrait._id,
            record: plainTrait,
        })
    })
    return plainTrait
}

export async function deleteTrait(sheetId: string, traitId: string, originId?: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterTrait.deleteOne({ _id: traitId, sheetId })
    const deleted = result.deletedCount > 0
    if (deleted) {
        await publishCharacterSheetRealtime(async () => {
            await getCharacterSheetPusherService().publishCollectionChanged({
                sheetId,
                collection: "traits",
                action: "deleted",
                originId,
                recordId: traitId,
            })
        })
    }
    return deleted
}

// ─── Feats ────────────────────────────────────────────────────────────────────

export async function getFeats(sheetId: string) {
    await dbConnect()
    const feats = await CharacterFeat.find({ sheetId }).lean()
    return feats.map(toPlain)
}

export async function createFeat(sheetId: string, data: CreateFeatBody, originId?: string) {
    await dbConnect()
    const feat = await CharacterFeat.create({ sheetId, ...data })
    const plainFeat = toPlain(feat.toObject())
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "feats",
            action: "created",
            originId,
            recordId: plainFeat._id,
            record: plainFeat,
        })
    })
    return plainFeat
}

export async function deleteFeat(sheetId: string, featId: string, originId?: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterFeat.deleteOne({ _id: featId, sheetId })
    const deleted = result.deletedCount > 0
    if (deleted) {
        await publishCharacterSheetRealtime(async () => {
            await getCharacterSheetPusherService().publishCollectionChanged({
                sheetId,
                collection: "feats",
                action: "deleted",
                originId,
                recordId: featId,
            })
        })
    }
    return deleted
}

// ─── Attacks ──────────────────────────────────────────────────────────────────

export async function getAttacks(sheetId: string) {
    await dbConnect()
    const attacks = await CharacterAttack.find({ sheetId }).lean()
    return attacks.map(toPlain)
}

export async function createAttack(sheetId: string, data: CreateAttackBody, originId?: string) {
    await dbConnect()
    const attack = await CharacterAttack.create({ sheetId, ...data })
    const plainAttack = toPlain(attack.toObject())
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "attacks",
            action: "created",
            originId,
            recordId: plainAttack._id,
            record: plainAttack,
        })
    })
    return plainAttack
}

export async function updateAttack(sheetId: string, attackId: string, data: PatchAttackBody, originId?: string) {
    await dbConnect()
    const attack = await CharacterAttack.findOneAndUpdate(
        { _id: attackId, sheetId },
        { $set: data },
        { returnDocument: 'after' },
    ).lean()
    if (!attack) return null

    const plainAttack = toPlain(attack)
    await publishCharacterSheetRealtime(async () => {
        await getCharacterSheetPusherService().publishCollectionChanged({
            sheetId,
            collection: "attacks",
            action: "updated",
            originId,
            recordId: plainAttack._id,
            record: plainAttack,
        })
    })
    return plainAttack
}

export async function deleteAttack(sheetId: string, attackId: string, originId?: string): Promise<boolean> {
    await dbConnect()
    const result = await CharacterAttack.deleteOne({ _id: attackId, sheetId })
    const deleted = result.deletedCount > 0
    if (deleted) {
        await publishCharacterSheetRealtime(async () => {
            await getCharacterSheetPusherService().publishCollectionChanged({
                sheetId,
                collection: "attacks",
                action: "deleted",
                originId,
                recordId: attackId,
            })
        })
    }
    return deleted
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

function stripHtml(html: string | null | undefined) {
    return String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function getArmorClassBonusValue(item: CharacterItemType): number | null {
    if (item.catalogAcType === "bonus" && item.catalogAc != null) {
        return item.catalogAc
    }

    if (item.catalogAcBonus != null) {
        return item.catalogAcBonus
    }

    return null
}

function withComputedArmorClass(sheet: CharacterSheetType, items: CharacterItemType[]) {
    const sheetItems = items.filter((item) => String(item.sheetId) === String(sheet._id))
    const equippedArmor = sheetItems.find(
        (item) => item.equipped && item.catalogItemType === "armadura" && item.catalogAcType === "base" && item.catalogAc != null
    ) ?? null
    const armorClassBonusSources = sheetItems
        .filter((item) => item.equipped)
        .map((item) => ({
            name: stripHtml(item.name) || "Item",
            acBonus: getArmorClassBonusValue(item),
        }))
        .filter((item): item is { name: string; acBonus: number } => item.acBonus != null)
        .map((item) => ({
            name: item.name,
            acBonus: item.acBonus,
        }))

    return {
        ...sheet,
        computedArmorClass: getArmorClass(
            sheet.dexterity,
            sheet.armorClassOverride ?? null,
            equippedArmor ? {
                name: stripHtml(equippedArmor.name) || "Armadura",
                ac: equippedArmor.catalogAc ?? null,
                armorType: equippedArmor.catalogArmorType ?? null,
            } : null,
            armorClassBonusSources,
            sheet.armorClassBonus ?? null,
        ).value,
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUniqueSlug(username: string, name: string, excludeId: string): Promise<string> {
    const base = generateSlug(username, name)
    let candidate = base
    let n = 1
    while (true) {
        const existing = await CharacterSheet.findOne({ slug: candidate }).lean()
        if (!existing || String(existing._id) === excludeId) return candidate
        n++
        candidate = `${base}-${n}`
    }
}

function getCharacterSheetPusherService() {
    return CharacterSheetPusherService.getInstance()
}

async function publishCharacterSheetRealtime(publish: () => Promise<void>) {
    try {
        await publish()
    } catch (error) {
        console.error("[Realtime] Failed to publish character-sheet update:", error)
    }
}
