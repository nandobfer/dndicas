import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import { experienceValue } from "@/features/character-sheets/utils/sheet-rules"
import { logger } from "@/lib/logger"

/**
 * DND-56: o campo "XP" da ficha passou de texto livre para número. Converte as fichas que ainda guardam texto
 * ("" → 0, "300" → 300). Idempotente: só toca documentos cujo `experience` ainda é string, então não precisa de marca.
 */
export async function sheetExperienceNumber(): Promise<void> {
    const rows = await CharacterSheet.collection.find({ experience: { $type: "string" } }, { projection: { experience: 1 } }).toArray()
    if (!rows.length) return
    await CharacterSheet.collection.bulkWrite(rows.map((row) => ({ updateOne: { filter: { _id: row._id, experience: { $type: "string" } }, update: { $set: { experience: experienceValue(row.experience) } } } })))
    logger.info({ count: rows.length }, "[migration] XP das fichas convertida para número")
}
