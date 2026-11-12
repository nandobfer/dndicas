import { createHash, randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { CharacterSheetCollectionName } from "@/features/character-sheets/realtime/character-sheet-pusher"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { plainText } from "../combat-options"
import type { CombatSheetChange } from "../combat-prep-schemas"
import type { CombatPrepChange } from "../combat-types"
import { MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX, MADDOX_SHEET_AUDIT_ENTITY } from "../constants"
import { masteryLabel } from "../weapon-mastery"

/**
 * Gravação das correções do Maddox na ficha (DND-41) — SOMENTE servidor. Só as operações da lista fechada
 * (`combatSheetChangeSchema`). Cada uma é condicional ao valor lido (não apaga, em silêncio, o que o jogador mudou
 * enquanto isso), é auditada (antes, depois e motivo) e avisa a ficha aberta (`CharacterSheetPusherService`).
 */

const log = loggerFor({ module: "maddox", feature: "combat-sheet-writes" })

const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const paragraph = (value: string) => `<p>${escapeHtml(value)}</p>`
const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))
const yesNo = (value: unknown) => (value ? "sim" : "não")

/** HTML do dano de um ataque da ficha (o mesmo formato do `dice-value` do editor). */
export const attackDamageHtml = (damage: { quantity: number; faces: number; bonus: number; type: string }) =>
    `<p><span data-type="dice-value" data-qty="${damage.quantity}" data-faces="${damage.faces}"${damage.bonus ? ` data-bonus="${damage.bonus}"` : ""} data-color-hex="#8c8c8c"></span>${damage.type ? ` ${escapeHtml(damage.type)}` : ""}</p>`

/** Dano legível a partir do HTML do ataque ("1d4+3 perfurante"). */
export function attackDamageText(html: string): string {
    const match = /data-qty="(\d+)"[^>]*data-faces="(\d+)"(?:[^>]*data-bonus="(-?\d+)")?/.exec(html)
    const rest = plainText(html)
    if (!match) return rest
    const bonus = Number(match[3] ?? 0)
    return `${match[1]}d${match[2]}${bonus ? signed(bonus) : ""}${rest ? ` ${rest}` : ""}`
}

const models = async () => {
    const [{ CharacterSheet }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }, { CharacterItem }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
        import("@/features/character-sheets/models/character-item"),
    ])
    return { CharacterSheet, CharacterAttack, CharacterTrait, CharacterFeat, CharacterSpell, CharacterItem }
}

/**
 * Carimbo da ficha e das coleções filhas: muda quando o jogador (ou outra gravação) altera qualquer coisa. As coleções
 * filhas não guardam `updatedAt`, então o carimbo é o hash do conteúdo.
 */
export async function readSheetStamp(sheetId: string): Promise<string> {
    const { CharacterSheet, CharacterAttack, CharacterTrait, CharacterFeat, CharacterSpell, CharacterItem } = await models()
    const id = new Types.ObjectId(sheetId)
    const [sheet, ...children] = await Promise.all([
        CharacterSheet.findById(id).select("updatedAt").lean<{ updatedAt?: Date }>(),
        CharacterAttack.find({ sheetId: id }).sort({ _id: 1 }).lean(),
        CharacterTrait.find({ sheetId: id }).sort({ _id: 1 }).lean(),
        CharacterFeat.find({ sheetId: id }).sort({ _id: 1 }).lean(),
        CharacterSpell.find({ sheetId: id }).sort({ _id: 1 }).lean(),
        CharacterItem.find({ sheetId: id }).sort({ _id: 1 }).lean(),
    ])
    return createHash("sha1")
        .update(JSON.stringify([sheet?.updatedAt ? new Date(sheet.updatedAt).toISOString() : null, children]))
        .digest("hex")
}

export interface SheetWriteContext {
    sheetId: string
    campaignId: string
    /** Quem aparece na auditoria: quem pediu o ajuste, ou o dono da campanha na preparação automática (autor: `depois.by`). */
    auditUserId: string
    /** Jogador que pediu o ajuste (`null` na preparação automática). */
    requestedBy?: string | null
    characterName: string
    /** Origem: preparação do combate, pedido de ajuste ou "Pergunte ao mestre" (DND-51). */
    origin: "combat-prep" | "combat-adjust" | "question"
}

export interface SheetWriteResult {
    changes: CombatPrepChange[]
    /** `ref` da operação → id da opção que a criação gerou na lista base (`ability:trait:<id>`). */
    created: Map<string, string>
}

type Outcome = {
    label: string
    before: string
    after: string
    applied: boolean
    sheet?: boolean
    collection?: { name: CharacterSheetCollectionName; action: "created" | "updated" | "deleted"; recordId: string }
    /** Valor anterior completo para a auditoria (quando `before` é só um resumo). */
    auditBefore?: unknown
} | null

const abilityLabel = (attribute: string) => MADDOX_ABILITY_LABELS[attribute as AttributeType] ?? attribute

/** Aplica as operações em ordem. Uma que não bate com o valor atual da ficha fica como "não aplicada". */
export async function applySheetChanges(changes: readonly CombatSheetChange[], context: SheetWriteContext): Promise<SheetWriteResult> {
    const result: SheetWriteResult = { changes: [], created: new Map() }
    if (!changes.length || !Types.ObjectId.isValid(context.sheetId)) return result
    const m = await models()
    const sheetObjectId = new Types.ObjectId(context.sheetId)
    let sheetTouched = false
    const collectionEvents: SheetEvent[] = []

    for (const change of changes) {
        let outcome: Outcome = null
        try {
            outcome = await applyOne(change, sheetObjectId, m, result.created, collectionEvents)
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), sheetId: context.sheetId, type: change.type }, "[maddox] falha ao gravar uma correção na ficha")
            outcome = { label: describeSheetChange(change), before: "—", after: "—", applied: false }
        }
        if (!outcome) continue
        result.changes.push({ area: "ficha", label: outcome.label, before: outcome.before, after: outcome.after, reason: change.reason, applied: outcome.applied })
        if (!outcome.applied) continue
        if (outcome.sheet) sheetTouched = true
        if (outcome.collection) collectionEvents.push(outcome.collection)
        await recordAudit({
            userId: context.auditUserId,
            entidade: MADDOX_SHEET_AUDIT_ENTITY,
            entidadeId: context.sheetId,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { [outcome.label]: outcome.auditBefore ?? outcome.before },
            depois: { by: "maddox", origin: context.origin, requestedBy: context.requestedBy ?? null, campaign: context.campaignId, character: context.characterName, [outcome.label]: outcome.after, reason: change.reason },
        })
    }
    await publish(context.sheetId, sheetTouched, collectionEvents, m)
    return result
}

export function describeSheetChange(change: CombatSheetChange): string {
    switch (change.type) {
        case "ability":
            return abilityLabel(change.attribute)
        case "save-proficiency":
            return `Salvaguarda de ${abilityLabel(change.attribute)}`
        case "skill-proficiency":
            return `Perícia ${change.skill}`
        case "spellcasting-attribute":
            return "Atributo de conjuração"
        case "spell-slots":
            return `Espaços de magia do ${change.circle}º círculo`
        case "charge-upsert":
            return `Recurso ${change.name}`
        case "attack-upsert":
            return `Ataque ${change.name}`
        case "attack-remove":
            return "Ataque removido"
        case "trait-upsert":
            return `Característica ${change.name}`
        case "feat-upsert":
            return `Talento ${change.name}`
        case "spell-update":
            return "Magia"
        case "item-equip":
            return "Item equipado"
        case "text-append":
            return "Anotação da ficha"
        case "weapon-mastery":
            return `Maestria de arma (${masteryLabel(change.mastery)})`
        case "spell-add":
            return "Magia acrescentada"
        case "spell-remove":
            return "Magia removida"
        case "trait-remove":
            return "Característica removida"
        case "feat-remove":
            return "Talento removido"
        case "item-add":
            return `Item ${change.name ?? "acrescentado"}`
        case "item-remove":
            return "Item removido"
        case "item-quantity":
            return "Quantidade do item"
    }
}

/** Bônus de ataque mágico da ficha (atributo de conjuração + proficiência), para os ataques automáticos dos truques. */
async function spellAttackBonusOf(sheet: Record<string, unknown>): Promise<{ bonus: number; level: number }> {
    const { getProficiencyBonus } = await import("@/features/character-sheets/utils/dnd-calculations")
    const level = Math.max(1, Number(sheet.level) || 1)
    const prof = getProficiencyBonus(level, null).value
    const attribute = typeof sheet.spellcastingAttribute === "string" ? sheet.spellcastingAttribute : null
    const score = attribute ? Number(sheet[attribute]) || 10 : 10
    return { bonus: prof + Math.floor((score - 10) / 2), level }
}

const AUTO_SPELL_PREFIX = "auto:spell:"

type Models = Awaited<ReturnType<typeof models>>

type SheetEvent = { name: CharacterSheetCollectionName; action: "created" | "updated" | "deleted"; recordId: string }

async function applyOne(change: CombatSheetChange, sheetId: Types.ObjectId, m: Models, created: Map<string, string>, extra: SheetEvent[]): Promise<Outcome> {
    const label = describeSheetChange(change)
    const sheet = await m.CharacterSheet.findById(sheetId).lean<Record<string, unknown> & { _id: Types.ObjectId }>()
    if (!sheet) return { label, before: "—", after: "—", applied: false }
    const setIf = async (path: string, before: unknown, after: unknown) => {
        const filter: Record<string, unknown> = { _id: sheetId, [path]: before === undefined || before === null ? { $in: [null] } : before === false ? { $in: [null, false] } : before }
        const updated = await m.CharacterSheet.updateOne(filter, { $set: { [path]: after } })
        return updated.modifiedCount > 0
    }
    switch (change.type) {
        case "ability": {
            const before = sheet[change.attribute] as number | undefined
            if (before === change.value) return null
            return { label, before: String(before ?? "—"), after: String(change.value), applied: await setIf(change.attribute, before, change.value), sheet: true }
        }
        case "save-proficiency": {
            const before = Boolean((sheet.savingThrows as Record<string, boolean> | undefined)?.[change.attribute])
            if (before === change.proficient) return null
            return { label, before: before ? "proficiente" : "sem proficiência", after: change.proficient ? "proficiente" : "sem proficiência", applied: await setIf(`savingThrows.${change.attribute}`, before, change.proficient), sheet: true }
        }
        case "skill-proficiency": {
            const current = (sheet.skills as Record<string, { proficient?: boolean; expertise?: boolean }> | undefined)?.[change.skill] ?? {}
            const expertise = change.expertise ?? Boolean(current.expertise)
            if (Boolean(current.proficient) === change.proficient && Boolean(current.expertise) === expertise) return null
            const updated = await m.CharacterSheet.updateOne(
                { _id: sheetId, [`skills.${change.skill}.proficient`]: current.proficient ? true : { $in: [null, false] } },
                { $set: { [`skills.${change.skill}.proficient`]: change.proficient, [`skills.${change.skill}.expertise`]: expertise } },
            )
            const text = (proficient: boolean, exp: boolean) => (exp ? "especialista" : proficient ? "proficiente" : "sem proficiência")
            return { label, before: text(Boolean(current.proficient), Boolean(current.expertise)), after: text(change.proficient, expertise), applied: updated.modifiedCount > 0, sheet: true }
        }
        case "spellcasting-attribute": {
            const before = (sheet.spellcastingAttribute as string | null | undefined) ?? null
            if (before === change.attribute) return null
            const applied = await setIf("spellcastingAttribute", before, change.attribute)
            if (applied) await refreshAutoSpellAttacks(sheetId, m, extra)
            return { label, before: before ? abilityLabel(before) : "nenhum", after: change.attribute ? abilityLabel(change.attribute) : "nenhum", applied, sheet: true }
        }
        case "spell-slots": {
            const slots = (sheet.spellSlots as Record<string, { total: number; used: number }> | undefined) ?? {}
            const slot = slots[String(change.circle)]
            const before = slot?.total ?? 0
            if (before === change.total) return null
            const updated = slot
                ? await m.CharacterSheet.updateOne({ _id: sheetId, [`spellSlots.${change.circle}.total`]: before }, { $set: { [`spellSlots.${change.circle}.total`]: change.total, [`spellSlots.${change.circle}.used`]: Math.min(slot.used ?? 0, change.total) } })
                : await m.CharacterSheet.updateOne({ _id: sheetId, [`spellSlots.${change.circle}`]: { $exists: false } }, { $set: { [`spellSlots.${change.circle}`]: { total: change.total, used: 0 } } })
            return { label, before: String(before), after: String(change.total), applied: updated.modifiedCount > 0, sheet: true }
        }
        case "charge-upsert": {
            const charges = (sheet.resourceCharges as { id: string; name: string; total: number; used: number }[] | undefined) ?? []
            const existing = change.chargeId ? charges.find((charge) => charge.id === change.chargeId) : charges.find((charge) => plainText(charge.name).toLowerCase() === change.name.toLowerCase())
            if (existing) {
                const used = Math.min(change.used ?? existing.used, change.total)
                if (existing.total === change.total && existing.used === used) return null
                const updated = await m.CharacterSheet.updateOne({ _id: sheetId, resourceCharges: { $elemMatch: { id: existing.id, total: existing.total, used: existing.used } } }, { $set: { "resourceCharges.$.total": change.total, "resourceCharges.$.used": used } })
                return { label, before: `${existing.total - existing.used}/${existing.total} usos`, after: `${change.total - used}/${change.total} usos`, applied: updated.modifiedCount > 0, sheet: true }
            }
            const used = Math.min(change.used ?? 0, change.total)
            const updated = await m.CharacterSheet.updateOne({ _id: sheetId }, { $push: { resourceCharges: { id: randomUUID(), name: change.name, total: change.total, used, source: null } } })
            return { label, before: "não existia", after: `${change.total - used}/${change.total} usos`, applied: updated.modifiedCount > 0, sheet: true }
        }
        case "attack-upsert": {
            const damageHtml = attackDamageHtml({ quantity: change.damage.quantity, faces: change.damage.faces, bonus: change.damage.bonus, type: change.damage.type })
            const after = `${signed(change.attackBonus)} · ${attackDamageText(damageHtml)}`
            if (change.attackId && Types.ObjectId.isValid(change.attackId)) {
                const current = await m.CharacterAttack.findOne({ _id: new Types.ObjectId(change.attackId), sheetId }).lean<{ _id: Types.ObjectId; name: string; attackBonus: string; damageType: string }>()
                if (!current) return { label, before: "—", after, applied: false }
                const before = `${current.attackBonus} · ${attackDamageText(current.damageType)}`
                if (before === after) return null
                const updated = await m.CharacterAttack.updateOne({ _id: current._id, attackBonus: current.attackBonus, damageType: current.damageType }, { $set: { attackBonus: signed(change.attackBonus), damageType: damageHtml } })
                return { label: `Ataque ${plainText(current.name) || change.name}`, before, after, applied: updated.modifiedCount > 0, collection: { name: "attacks", action: "updated", recordId: String(current._id) } }
            }
            const doc = await m.CharacterAttack.create({ sheetId, name: paragraph(change.name), attackBonus: signed(change.attackBonus), damageType: damageHtml, notes: "" })
            return { label, before: "não existia", after, applied: true, collection: { name: "attacks", action: "created", recordId: String(doc._id) } }
        }
        case "attack-remove": {
            if (!Types.ObjectId.isValid(change.attackId)) return { label, before: "—", after: "removido", applied: false }
            const current = await m.CharacterAttack.findOneAndDelete({ _id: new Types.ObjectId(change.attackId), sheetId }).lean<{ _id: Types.ObjectId; name: string; attackBonus: string; damageType: string }>()
            if (!current) return { label, before: "—", after: "removido", applied: false }
            return { label: `Ataque ${plainText(current.name)}`, before: `${current.attackBonus} · ${attackDamageText(current.damageType)}`, after: "removido", applied: true, collection: { name: "attacks", action: "deleted", recordId: String(current._id) } }
        }
        case "trait-upsert":
        case "feat-upsert": {
            const Model = (change.type === "trait-upsert" ? m.CharacterTrait : m.CharacterFeat) as unknown as typeof m.CharacterTrait
            const collection: CharacterSheetCollectionName = change.type === "trait-upsert" ? "traits" : "feats"
            const prefix = change.type === "trait-upsert" ? "trait" : "feat"
            const description = paragraph(change.description)
            if (change.id && Types.ObjectId.isValid(change.id)) {
                const current = await Model.findOne({ _id: new Types.ObjectId(change.id), sheetId }).lean<{ _id: Types.ObjectId; name: string; description: string }>()
                if (!current) return { label, before: "—", after: change.name, applied: false }
                // O modelo só viu um trecho em texto puro: descrição maior que o trecho, ou com menções, não é reescrita
                // (perderia o texto e as menções). Nesse caso a correção é acrescentada ao fim, e o nome fica.
                const original = current.description ?? ""
                const replace = plainText(original).length <= MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX && !/data-type="mention"/.test(original)
                const next = replace ? { name: change.name, description } : { description: `${original}${description}` }
                const updated = await Model.updateOne({ _id: current._id, description: current.description }, { $set: next })
                return {
                    label,
                    before: plainText(original).slice(0, 160) || plainText(current.name),
                    after: replace ? change.description.slice(0, 160) : `acrescentado: ${change.description.slice(0, 160)}`,
                    applied: updated.modifiedCount > 0,
                    auditBefore: { name: current.name, description: original },
                    collection: { name: collection, action: "updated", recordId: String(current._id) },
                }
            }
            const doc = await Model.create({ sheetId, name: change.name, description, ...(change.type === "trait-upsert" ? { origin: "manual" } : {}) })
            if (change.ref) created.set(change.ref, `ability:${prefix}:${String(doc._id)}`)
            return { label, before: "não existia", after: change.description.slice(0, 160), applied: true, collection: { name: collection, action: "created", recordId: String(doc._id) } }
        }
        case "spell-update": {
            if (!Types.ObjectId.isValid(change.spellId)) return { label, before: "—", after: "—", applied: false }
            const current = await m.CharacterSpell.findOne({ _id: new Types.ObjectId(change.spellId), sheetId }).lean<{ _id: Types.ObjectId; name: string; prepared: boolean; circle: number | null }>()
            if (!current) return { label, before: "—", after: "—", applied: false }
            const set: Record<string, unknown> = {}
            if (change.prepared !== undefined && change.prepared !== current.prepared) set.prepared = change.prepared
            if (change.circle !== undefined && change.circle !== current.circle) set.circle = change.circle
            if (!Object.keys(set).length) return null
            const updated = await m.CharacterSpell.updateOne({ _id: current._id, prepared: current.prepared, circle: current.circle }, { $set: set })
            const text = (prepared: boolean, circle: number | null) => `${prepared ? "preparada" : "não preparada"}${circle !== null ? ` · ${circle === 0 ? "truque" : `${circle}º círculo`}` : ""}`
            return { label: `Magia ${plainText(current.name)}`, before: text(current.prepared, current.circle), after: text((set.prepared as boolean | undefined) ?? current.prepared, (set.circle as number | undefined) ?? current.circle), applied: updated.modifiedCount > 0, collection: { name: "spells", action: "updated", recordId: String(current._id) } }
        }
        case "item-equip": {
            if (!Types.ObjectId.isValid(change.itemId)) return { label, before: "—", after: "—", applied: false }
            const current = await m.CharacterItem.findOne({ _id: new Types.ObjectId(change.itemId), sheetId }).lean<{ _id: Types.ObjectId; name: string; equipped: boolean }>()
            if (!current) return { label, before: "—", after: "—", applied: false }
            if (Boolean(current.equipped) === change.equipped) return null
            const updated = await m.CharacterItem.updateOne({ _id: current._id, equipped: current.equipped }, { $set: { equipped: change.equipped } })
            return { label: `Item ${plainText(current.name)} equipado`, before: yesNo(current.equipped), after: yesNo(change.equipped), applied: updated.modifiedCount > 0, collection: { name: "items", action: "updated", recordId: String(current._id) } }
        }
        case "weapon-mastery": {
            // DND-49: limite da classe, item de catálogo e a maestria do item já foram conferidos em `interpretPrep`.
            if (!Types.ObjectId.isValid(change.catalogItemId)) return { label, before: "—", after: "—", applied: false }
            const list = (sheet.weaponMasteries as { catalogItemId: Types.ObjectId | string; mastery: string }[] | undefined) ?? []
            if (list.some((entry) => String(entry.catalogItemId) === change.catalogItemId)) return null
            const updated = await m.CharacterSheet.updateOne({ _id: sheetId, "weaponMasteries.catalogItemId": { $ne: new Types.ObjectId(change.catalogItemId) } }, { $push: { weaponMasteries: { catalogItemId: new Types.ObjectId(change.catalogItemId), mastery: change.mastery } } })
            return { label, before: list.length ? `${list.length} maestria(s)` : "nenhuma", after: `${masteryLabel(change.mastery)} na arma`, applied: updated.modifiedCount > 0, sheet: true }
        }
        case "text-append": {
            const before = (sheet[change.field] as string | undefined) ?? ""
            const after = `${before}${paragraph(change.text)}`
            const updated = await m.CharacterSheet.updateOne({ _id: sheetId, [change.field]: before === "" ? { $in: ["", null] } : before }, { $set: { [change.field]: after } })
            return { label, before: "—", after: change.text, applied: updated.modifiedCount > 0, sheet: true }
        }
        case "spell-add": {
            if (!Types.ObjectId.isValid(change.catalogSpellId)) return { label, before: "—", after: "—", applied: false }
            const catalogId = new Types.ObjectId(change.catalogSpellId)
            const [{ Spell }, { catalogSpellDoc }, rules] = await Promise.all([import("@/features/spells/models/spell"), import("./sheet-builder"), import("@/features/character-sheets/utils/sheet-rules")])
            const spell = await (Spell as unknown as { findOne: (q: unknown) => { lean: <T>() => Promise<T | null> } }).findOne({ _id: catalogId }).lean<Parameters<typeof catalogSpellDoc>[2] & { baseDice?: { quantidade: number; tipo: string } }>()
            if (!spell) return { label, before: "—", after: "—", applied: false }
            const name = `Magia ${spell.name}`
            if (await m.CharacterSpell.exists({ sheetId, catalogSpellId: catalogId })) return null
            const doc = await m.CharacterSpell.create({ ...catalogSpellDoc(sheetId, spell.name, spell), prepared: change.prepared })
            const circleText = spell.circle === 0 ? "truque" : `${spell.circle}º círculo`
            const outcome: NonNullable<Outcome> = { label: name, before: "não existia", after: `${circleText}${spell.circle ? (change.prepared ? " · preparada" : " · não preparada") : ""}`, applied: true, collection: { name: "spells", action: "created", recordId: String(doc._id) } }
            // Truque com dano: o ataque automático da ficha, como na criação pela entrevista.
            if (spell.circle === 0 && spell.baseDice && !(await m.CharacterAttack.exists({ sheetId, notes: rules.getAutoSpellAttackNotes(String(spell._id)) }))) {
                const { bonus, level } = await spellAttackBonusOf(sheet)
                const attack = await m.CharacterAttack.create({ sheetId, name: catalogSpellDoc(sheetId, spell.name, spell).name, ...rules.buildSpellAttackAutofill(spell as never, { spellAttackBonus: { value: bonus } }, level), notes: rules.getAutoSpellAttackNotes(String(spell._id)) })
                extra.push({ name: "attacks", action: "created", recordId: String(attack._id) })
            }
            return outcome
        }
        case "spell-remove": {
            if (!Types.ObjectId.isValid(change.spellId)) return { label, before: "—", after: "removida", applied: false }
            const current = await m.CharacterSpell.findOneAndDelete({ _id: new Types.ObjectId(change.spellId), sheetId }).lean<{ _id: Types.ObjectId; name: string; circle: number | null; catalogSpellId?: Types.ObjectId | null }>()
            if (!current) return { label, before: "—", after: "removida", applied: false }
            if (current.catalogSpellId) {
                const attack = await m.CharacterAttack.findOneAndDelete({ sheetId, notes: `${AUTO_SPELL_PREFIX}${String(current.catalogSpellId)}` }).lean<{ _id: Types.ObjectId }>()
                if (attack) extra.push({ name: "attacks", action: "deleted", recordId: String(attack._id) })
            }
            return { label: `Magia ${plainText(current.name)}`, before: current.circle === 0 ? "truque" : current.circle ? `${current.circle}º círculo` : "na ficha", after: "removida", applied: true, auditBefore: current, collection: { name: "spells", action: "deleted", recordId: String(current._id) } }
        }
        case "trait-remove":
        case "feat-remove": {
            const Model = (change.type === "trait-remove" ? m.CharacterTrait : m.CharacterFeat) as unknown as typeof m.CharacterTrait
            if (!Types.ObjectId.isValid(change.id)) return { label, before: "—", after: "removido", applied: false }
            const current = await Model.findOneAndDelete({ _id: new Types.ObjectId(change.id), sheetId }).lean<{ _id: Types.ObjectId; name: string; description?: string }>()
            if (!current) return { label, before: "—", after: "removido", applied: false }
            const kind = change.type === "trait-remove" ? "Característica" : "Talento"
            return { label: `${kind} ${plainText(current.name)}`, before: plainText(current.description ?? "").slice(0, 160) || plainText(current.name), after: "removido", applied: true, auditBefore: current, collection: { name: change.type === "trait-remove" ? "traits" : "feats", action: "deleted", recordId: String(current._id) } }
        }
        case "item-add": {
            const { ItemModel } = await import("@/features/items/database/item")
            const catalog = change.catalogItemId && Types.ObjectId.isValid(change.catalogItemId) ? await ItemModel.findOne({ _id: new Types.ObjectId(change.catalogItemId), status: "active" }).lean<{ _id: Types.ObjectId; name: string; type?: string; image?: string | null }>() : null
            if (change.catalogItemId && !catalog) return { label, before: "—", after: "—", applied: false }
            const name = catalog?.name ?? change.name
            if (!name) return { label, before: "—", after: "—", applied: false }
            const existing = catalog ? await m.CharacterItem.findOne({ sheetId, catalogItemId: catalog._id }).lean<{ _id: Types.ObjectId; quantity: number }>() : null
            if (existing) {
                const updated = await m.CharacterItem.updateOne({ _id: existing._id, quantity: existing.quantity }, { $inc: { quantity: change.quantity } })
                return { label: `Item ${name}`, before: `qtd ${existing.quantity ?? 1}`, after: `qtd ${(existing.quantity ?? 1) + change.quantity}`, applied: updated.modifiedCount > 0, collection: { name: "items", action: "updated", recordId: String(existing._id) } }
            }
            const { mentionParagraphHtml } = await import("@/features/character-sheets/utils/sheet-rules")
            const doc = await m.CharacterItem.create({ sheetId, catalogItemId: catalog?._id ?? null, name: catalog ? mentionParagraphHtml({ id: String(catalog._id), entityType: "Item", label: catalog.name }) : paragraph(name), image: catalog?.image ?? null, quantity: change.quantity, equipped: change.equipped, notes: "", catalogItemType: catalog?.type ?? null })
            return { label: `Item ${name}`, before: "não existia", after: `qtd ${change.quantity}${change.equipped ? " · equipado" : ""}`, applied: true, collection: { name: "items", action: "created", recordId: String(doc._id) } }
        }
        case "item-remove": {
            if (!Types.ObjectId.isValid(change.itemId)) return { label, before: "—", after: "removido", applied: false }
            const current = await m.CharacterItem.findOneAndDelete({ _id: new Types.ObjectId(change.itemId), sheetId }).lean<{ _id: Types.ObjectId; name: string; quantity: number }>()
            if (!current) return { label, before: "—", after: "removido", applied: false }
            return { label: `Item ${plainText(current.name)}`, before: `qtd ${current.quantity ?? 1}`, after: "removido", applied: true, auditBefore: current, collection: { name: "items", action: "deleted", recordId: String(current._id) } }
        }
        case "item-quantity": {
            if (!Types.ObjectId.isValid(change.itemId)) return { label, before: "—", after: "—", applied: false }
            const current = await m.CharacterItem.findOne({ _id: new Types.ObjectId(change.itemId), sheetId }).lean<{ _id: Types.ObjectId; name: string; quantity: number }>()
            if (!current) return { label, before: "—", after: "—", applied: false }
            if ((current.quantity ?? 1) === change.quantity) return null
            const updated = await m.CharacterItem.updateOne({ _id: current._id, quantity: current.quantity }, { $set: { quantity: change.quantity } })
            return { label: `Quantidade de ${plainText(current.name)}`, before: String(current.quantity ?? 1), after: String(change.quantity), applied: updated.modifiedCount > 0, collection: { name: "items", action: "updated", recordId: String(current._id) } }
        }
    }
}

/** DND-51: o atributo de conjuração mudou — o bônus dos ataques automáticos dos truques acompanha. */
async function refreshAutoSpellAttacks(sheetId: Types.ObjectId, m: Models, extra: SheetEvent[]) {
    const sheet = await m.CharacterSheet.findById(sheetId).lean<Record<string, unknown>>()
    if (!sheet) return
    const { bonus } = await spellAttackBonusOf(sheet)
    const attacks = await m.CharacterAttack.find({ sheetId, notes: { $regex: `^${AUTO_SPELL_PREFIX}` } }).select("_id attackBonus").lean<{ _id: Types.ObjectId; attackBonus: string }[]>()
    for (const attack of attacks) {
        if (attack.attackBonus === signed(bonus)) continue
        await m.CharacterAttack.updateOne({ _id: attack._id }, { $set: { attackBonus: signed(bonus) } })
        extra.push({ name: "attacks", action: "updated", recordId: String(attack._id) })
    }
}

async function publish(sheetId: string, sheetTouched: boolean, events: { name: CharacterSheetCollectionName; action: "created" | "updated" | "deleted"; recordId: string }[], m: Models) {
    if (!sheetTouched && !events.length) return
    try {
        const { CharacterSheetPusherService } = await import("@/features/character-sheets/realtime/character-sheet-pusher-service")
        const pusher = CharacterSheetPusherService.getInstance()
        if (sheetTouched) {
            const sheet = await m.CharacterSheet.findById(sheetId).lean()
            if (sheet) await pusher.publishSheetPatched({ sheet: plain({ ...sheet, _id: String(sheet._id) }) })
        }
        const byCollection = { attacks: m.CharacterAttack, traits: m.CharacterTrait, feats: m.CharacterFeat, spells: m.CharacterSpell, items: m.CharacterItem } as const
        for (const event of events) {
            const record = event.action === "deleted" ? undefined : await (byCollection[event.name] as unknown as typeof m.CharacterAttack).findById(event.recordId).lean()
            await pusher.publishCollectionChanged({ sheetId, collection: event.name, action: event.action, recordId: event.recordId, ...(record ? { record: plain({ ...record, _id: String(record._id), sheetId }) } : {}) } as never)
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[maddox] falha ao avisar a ficha em tempo real")
    }
}
