import { randomUUID } from "node:crypto"
import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import type { ArmorClassBonus } from "@/features/character-sheets/utils/armor-class-bonuses"
import { logger } from "@/lib/logger"

export const LEGACY_ARMOR_CLASS_BONUS_NAME = "Bônus manual"

/**
 * DND-66: o bônus de CA único (`armorClassBonus`, número) virou a lista de bônus nomeados (`armorClassBonuses`). O número
 * diferente de 0 vira o bônus "Bônus manual" (permanente) e o campo antigo sai. Idempotente pelo filtro (só toca fichas
 * que ainda têm o campo antigo), sem marca em `migration_marks` de propósito: um retrato de turno ou cópia inicial do
 * Maddox anterior à mudança devolve a ficha com o campo antigo, e o próximo boot a converte de novo.
 */
/** O valor antigo não tinha teto: acima de ±10 (teto por bônus nomeado) vira mais de um bônus, sem perder nada. */
export function legacyParts(value: number): number[] {
    const parts: number[] = []
    let rest = value
    while (rest !== 0) {
        const part = Math.max(-10, Math.min(10, rest))
        parts.push(part)
        rest -= part
    }
    return parts
}

export async function sheetArmorClassBonuses(): Promise<void> {
    const rows = await CharacterSheet.collection.find({ armorClassBonus: { $exists: true } }, { projection: { armorClassBonus: 1, armorClassBonuses: 1 } }).toArray()
    if (!rows.length) return
    const now = new Date().toISOString()
    await CharacterSheet.collection.bulkWrite(
        rows.map((row) => {
            const value = typeof row.armorClassBonus === "number" && Number.isFinite(row.armorClassBonus) ? Math.trunc(row.armorClassBonus) : 0
            const current = Array.isArray(row.armorClassBonuses) ? (row.armorClassBonuses as ArmorClassBonus[]) : []
            const exists = current.some((bonus) => typeof bonus?.name === "string" && bonus.name.startsWith(LEGACY_ARMOR_CLASS_BONUS_NAME))
            const parts = exists ? [] : legacyParts(value)
            if (parts.length > 1) logger.warn({ sheetId: String(row._id), armorClassBonus: value, parts }, "[migration] bônus de CA antigo acima do teto por bônus: dividido em mais de um \"Bônus manual\"")
            const next = [...current, ...parts.map((part, index) => ({ id: randomUUID(), name: index === 0 ? LEGACY_ARMOR_CLASS_BONUS_NAME : `${LEGACY_ARMOR_CLASS_BONUS_NAME} (${index + 1})`, value: part, origin: "other", duration: { kind: "permanent" }, addedBy: "player", createdAt: now }) satisfies ArmorClassBonus)]
            return { updateOne: { filter: { _id: row._id, armorClassBonus: { $exists: true } }, update: { $set: { armorClassBonuses: next }, $unset: { armorClassBonus: "" } } } }
        }),
    )
    logger.info({ count: rows.length }, "[migration] bônus de CA das fichas convertido para a lista nomeada")
}
