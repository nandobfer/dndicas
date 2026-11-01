import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import { MADDOX_ABILITIES, checkModifier, proficiencyOf, type MaddoxCheckSheet } from "../check-modifier"
import { plainText, type OptionAbility, type OptionItem, type OptionSheet, type OptionSpell, type OptionWeapon } from "../combat-options"
import type { DeathSaves, HitPoints } from "../combat-rules"

/**
 * A ficha D&D no combate tático (Maddox 7) — SOMENTE servidor. Lê o que o combate precisa (PV, CA, iniciativa,
 * salvaguardas, armas equipadas, magias, consumíveis, habilidades e cargas) e grava, de forma atômica, o que o combate
 * muda: PV, PV temporários, testes contra a morte, espaços de magia, cargas e consumíveis. Cada gravação avisa a ficha
 * aberta (`CharacterSheetPusherService`), então o formulário de "Minha ficha" recebe o valor novo.
 */

const log = loggerFor({ module: "maddox", feature: "combat-sheet" })

type Dice = { quantidade: number; tipo: string }

export interface CombatSheet {
    sheetId: string
    level: number
    hp: HitPoints
    deathSaves: DeathSaves
    armorClass: number
    initiative: { value: number; parts: CalcPart[] }
    dexterity: number
    check: MaddoxCheckSheet
    option: OptionSheet
    weapons: OptionWeapon[]
    spells: OptionSpell[]
    items: OptionItem[]
    abilities: OptionAbility[]
}

const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T

interface StoredSheet extends MaddoxCheckSheet {
    _id: Types.ObjectId
    hpMax: number | null
    hpCurrent: number | null
    hpTemp: number
    deathSavesSuccess?: number
    deathSavesFailure?: number
    initiativeOverride?: number | null
    initiativeProficiency?: boolean
    spellcastingAttribute?: string | null
    spellSaveDCOverride?: number | null
    spellAttackBonusOverride?: number | null
    spellSlots?: Record<string, { total: number; used: number }> | Map<string, { total: number; used: number }>
    resourceCharges?: { id: string; name: string; total: number; used: number; source: { entityType: string; entityId: string } | null }[]
    armorClassOverride?: number | null
    armorClassBonus?: number | null
    unarmoredDefense?: { enabled: boolean; base: number; attributes: AttributeType[] }
}

/** Salvaguarda e perícia pela ficha (as mesmas contas do teste do Maddox 5). */
export const sheetSave = (sheet: CombatSheet, ability: AttributeType) => checkModifier(sheet.check, { kind: "save", ability, skill: null })
export const sheetSkill = (sheet: CombatSheet, skill: SkillName) => checkModifier(sheet.check, { kind: "skill", ability: "dexterity", skill })

const isAttribute = (value: unknown): value is AttributeType => MADDOX_ABILITIES.includes(value as AttributeType)

export async function loadCombatSheets(sheetIds: readonly string[]): Promise<Map<string, CombatSheet>> {
    const ids = [...new Set(sheetIds.filter((id) => Types.ObjectId.isValid(id)))].map((id) => new Types.ObjectId(id))
    const result = new Map<string, CombatSheet>()
    if (!ids.length) return result
    const [{ CharacterSheet }, { CharacterItem }, { CharacterSpell }, { CharacterTrait }, { CharacterFeat }, { computeSheetArmorClass }, calc] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/models/character-spell"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/utils/armor-class"),
        import("@/features/character-sheets/utils/dnd-calculations"),
    ])
    type StoredItem = Parameters<typeof computeSheetArmorClass>[1][number] & { _id: Types.ObjectId; sheetId: Types.ObjectId; catalogItemId: Types.ObjectId | null; quantity: number; name: string }
    type StoredSpell = { _id: Types.ObjectId; sheetId: Types.ObjectId; catalogSpellId: Types.ObjectId | null; name: string; circle: number | null; prepared: boolean; castingTime: string; concentration: boolean; notes?: string }
    type StoredTrait = { _id: Types.ObjectId; sheetId: Types.ObjectId; catalogTraitId?: Types.ObjectId | null; catalogFeatId?: Types.ObjectId | null; name: string; description: string }
    const [sheets, items, spells, traits, feats] = await Promise.all([
        CharacterSheet.find({ _id: { $in: ids } }).lean<StoredSheet[]>(),
        CharacterItem.find({ sheetId: { $in: ids } }).lean<StoredItem[]>(),
        CharacterSpell.find({ sheetId: { $in: ids } }).lean<StoredSpell[]>(),
        CharacterTrait.find({ sheetId: { $in: ids } }).lean<StoredTrait[]>(),
        CharacterFeat.find({ sheetId: { $in: ids } }).lean<StoredTrait[]>(),
    ])
    const itemIds = items.map((item) => item.catalogItemId).filter((id): id is Types.ObjectId => Boolean(id))
    const spellIds = spells.map((spell) => spell.catalogSpellId).filter((id): id is Types.ObjectId => Boolean(id))
    type CatalogItem = { _id: Types.ObjectId; type?: string; itemType?: string; damageDice?: Dice; damageType?: string; properties?: { name?: string }[]; effectDice?: Dice; description?: string }
    type CatalogSpell = { _id: Types.ObjectId; circle?: number; castingTime?: string; saveAttribute?: string; baseDice?: Dice; extraDicePerLevel?: Dice; description?: string }
    const [{ ItemModel }, { Spell }] = await Promise.all([import("@/features/items/database/item"), import("@/features/spells/models/spell")])
    const [catalogItems, catalogSpells] = await Promise.all([
        itemIds.length ? ItemModel.find({ _id: { $in: itemIds } }).lean<CatalogItem[]>() : Promise.resolve([] as CatalogItem[]),
        spellIds.length ? (Spell as unknown as { find: (q: unknown) => { lean: <T>() => Promise<T> } }).find({ _id: { $in: spellIds } }).lean<CatalogSpell[]>() : Promise.resolve([] as CatalogSpell[]),
    ])
    const itemById = new Map(catalogItems.map((item) => [String(item._id), item]))
    const spellById = new Map(catalogSpells.map((spell) => [String(spell._id), spell]))

    for (const sheet of sheets) {
        const sheetId = String(sheet._id)
        const own = <T extends { sheetId: Types.ObjectId }>(list: T[]) => list.filter((item) => String(item.sheetId) === sheetId)
        const ownItems = own(items)
        const prof = proficiencyOf(sheet)
        const abilities = Object.fromEntries(MADDOX_ABILITIES.map((ability) => [ability, Number.isFinite(sheet[ability]) ? sheet[ability] : 10])) as Record<AttributeType, number>
        const spellAttribute = isAttribute(sheet.spellcastingAttribute) ? sheet.spellcastingAttribute : null
        const spellScore = spellAttribute ? abilities[spellAttribute] : 10
        const slots = sheet.spellSlots instanceof Map ? Object.fromEntries(sheet.spellSlots) : { ...(sheet.spellSlots ?? {}) }
        const hpMax = Math.max(1, sheet.hpMax ?? 1)
        const charges = sheet.resourceCharges ?? []
        const chargeOf = (entityId: string | null | undefined, name: string) => {
            const found = charges.find((charge) => (entityId && charge.source?.entityId === entityId) || plainText(charge.name).toLowerCase() === plainText(name).toLowerCase())
            return found ? { id: found.id, total: found.total, used: found.used } : null
        }
        result.set(sheetId, {
            sheetId,
            level: Math.max(1, sheet.level || 1),
            hp: { hp: Math.max(0, sheet.hpCurrent ?? hpMax), hpMax, tempHp: Math.max(0, sheet.hpTemp ?? 0) },
            deathSaves: { success: sheet.deathSavesSuccess ?? 0, failure: sheet.deathSavesFailure ?? 0 },
            armorClass: computeSheetArmorClass(sheet as unknown as Parameters<typeof computeSheetArmorClass>[0], ownItems),
            initiative: (() => {
                const value = calc.getInitiative(abilities.dexterity, sheet.initiativeOverride ?? null, prof, Boolean(sheet.initiativeProficiency))
                return { value: value.value, parts: value.parts ?? [] }
            })(),
            dexterity: abilities.dexterity,
            check: sheet,
            option: {
                level: Math.max(1, sheet.level || 1),
                abilities,
                proficiencyBonus: prof,
                spellAttribute,
                spellSaveDc: calc.getSpellSaveDC(spellScore, prof, sheet.spellSaveDCOverride ?? null).value,
                spellAttackBonus: calc.getSpellAttackBonus(spellScore, prof, sheet.spellAttackBonusOverride ?? null).value,
                spellSlots: slots,
            },
            weapons: ownItems
                .filter((item) => item.equipped && item.catalogItemId && (itemById.get(String(item.catalogItemId))?.type ?? item.catalogItemType) === "arma")
                .map((item) => {
                    const catalog = itemById.get(String(item.catalogItemId))!
                    return { id: String(item._id), name: plainText(item.name), quantity: item.quantity ?? 1, damageDice: catalog.damageDice ?? null, damageType: catalog.damageType ?? null, properties: (catalog.properties ?? []).map((property) => plainText(property.name ?? "")) }
                }),
            spells: own(spells).map((spell) => {
                const catalog = spell.catalogSpellId ? spellById.get(String(spell.catalogSpellId)) : undefined
                return {
                    id: String(spell._id),
                    name: plainText(spell.name),
                    circle: spell.circle ?? catalog?.circle ?? 0,
                    prepared: Boolean(spell.prepared),
                    castingTime: catalog?.castingTime ?? spell.castingTime ?? "",
                    concentration: Boolean(spell.concentration),
                    saveAttribute: isAttribute(catalog?.saveAttribute) ? catalog!.saveAttribute as AttributeType : null,
                    baseDice: catalog?.baseDice ?? null,
                    extraDicePerLevel: catalog?.extraDicePerLevel ?? null,
                    damageType: null,
                    description: plainText(catalog?.description ?? spell.notes ?? ""),
                    profile: null,
                }
            }),
            items: ownItems
                .filter((item) => (item.catalogItemType ?? itemById.get(String(item.catalogItemId))?.type) === "consumível")
                .map((item) => {
                    const catalog = item.catalogItemId ? itemById.get(String(item.catalogItemId)) : undefined
                    return { id: String(item._id), name: plainText(item.name), quantity: item.quantity ?? 1, consumable: true, effectDice: catalog?.effectDice ?? null, description: plainText(catalog?.description ?? "") }
                }),
            abilities: [
                ...own(traits).map((trait) => ({ id: `trait:${String(trait._id)}`, catalogId: trait.catalogTraitId ? String(trait.catalogTraitId) : null, ...trait })),
                ...own(feats).map((feat) => ({ id: `feat:${String(feat._id)}`, catalogId: feat.catalogFeatId ? String(feat.catalogFeatId) : null, ...feat })),
            ].map((entry) => ({ id: entry.id, name: plainText(entry.name), description: plainText(entry.description ?? ""), profile: null, charge: chargeOf(entry.catalogId, entry.name), catalogId: entry.catalogId }) as OptionAbility & { catalogId: string | null }),
        })
    }
    return result
}

async function publishPatched(sheetId: string) {
    try {
        const [{ CharacterSheet }, { CharacterSheetPusherService }] = await Promise.all([import("@/features/character-sheets/models/character-sheet"), import("@/features/character-sheets/realtime/character-sheet-pusher-service")])
        const sheet = await CharacterSheet.findById(sheetId).lean()
        if (sheet) await CharacterSheetPusherService.getInstance().publishSheetPatched({ sheet: plain({ ...sheet, _id: String(sheet._id) }) })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[maddox] falha ao avisar a ficha em tempo real")
    }
}

/** Grava PV, PV temporários e (opcional) os testes contra a morte. */
export async function writeSheetHitPoints(sheetId: string, value: { hp: number; tempHp: number; deathSaves?: DeathSaves }): Promise<void> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const set: Record<string, number> = { hpCurrent: Math.max(0, Math.round(value.hp)), hpTemp: Math.max(0, Math.round(value.tempHp)) }
    if (value.deathSaves) Object.assign(set, { deathSavesSuccess: value.deathSaves.success, deathSavesFailure: value.deathSaves.failure })
    await CharacterSheet.updateOne({ _id: new Types.ObjectId(sheetId) }, { $set: set })
    await publishPatched(sheetId)
}

/** Gasta um espaço do círculo `level` (troca condicional pelo valor lido: dois cliques não gastam dois). */
export async function spendSpellSlot(sheetId: string, level: number): Promise<boolean> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(sheetId).select("spellSlots").lean<{ spellSlots?: Record<string, { total: number; used: number }> }>()
    const slot = sheet?.spellSlots?.[String(level)]
    if (!slot || slot.used >= slot.total) return false
    const updated = await CharacterSheet.updateOne({ _id: new Types.ObjectId(sheetId), [`spellSlots.${level}.used`]: slot.used }, { $inc: { [`spellSlots.${level}.used`]: 1 } })
    if (updated.modifiedCount === 0) return false
    await publishPatched(sheetId)
    return true
}

/** Gasta uma carga do recurso `chargeId` (só com carga restante). */
export async function spendResourceCharge(sheetId: string, chargeId: string): Promise<boolean> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(sheetId).select("resourceCharges").lean<{ resourceCharges?: { id: string; total: number; used: number }[] }>()
    const index = (sheet?.resourceCharges ?? []).findIndex((charge) => charge.id === chargeId)
    const charge = index >= 0 ? sheet!.resourceCharges![index]! : null
    if (!charge || charge.used >= charge.total) return false
    const updated = await CharacterSheet.updateOne({ _id: new Types.ObjectId(sheetId), [`resourceCharges.${index}.id`]: chargeId, [`resourceCharges.${index}.used`]: charge.used }, { $inc: { [`resourceCharges.${index}.used`]: 1 } })
    if (updated.modifiedCount === 0) return false
    await publishPatched(sheetId)
    return true
}

/** Gasta um consumível (quantidade − 1; só com quantidade). */
export async function consumeSheetItem(sheetId: string, itemId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(itemId)) return false
    const [{ CharacterItem }, { CharacterSheetPusherService }] = await Promise.all([import("@/features/character-sheets/models/character-item"), import("@/features/character-sheets/realtime/character-sheet-pusher-service")])
    const updated = await CharacterItem.findOneAndUpdate({ _id: new Types.ObjectId(itemId), sheetId: new Types.ObjectId(sheetId), quantity: { $gt: 0 } }, { $inc: { quantity: -1 } }, { returnDocument: "after" }).lean()
    if (!updated) return false
    try {
        await CharacterSheetPusherService.getInstance().publishCollectionChanged({ sheetId, collection: "items", action: "updated", recordId: itemId, record: plain({ ...updated, _id: String(updated._id), sheetId }) })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[maddox] falha ao avisar o item da ficha em tempo real")
    }
    return true
}
