import type { CharacterResourceCharge } from "../types/character-sheet.types"
import { extractMentionsFromHtml, toMentionKey, type ParsedMention } from "./mention-sync"
import { buildBoundResourceCharge, clampResourceChargeRow, createResourceChargeId, resolveChargesTotal, type ChargeBoundEntity, type ResourceChargeCalcContext } from "./sheet-rules"

export { buildBoundResourceCharge, clampResourceChargeRow, createResourceChargeId, resolveChargesTotal }
export type { ChargeBoundEntity, ResourceChargeCalcContext }

export function extractResourceChargeMention(nameHtml: string): ParsedMention | null {
    const mentions = extractMentionsFromHtml(nameHtml)
    return mentions.find((mention) => mention.entityType === "Habilidade" || mention.entityType === "Talento" || mention.entityType === "Item") ?? null
}

export function syncResourceChargeRows(
    currentRows: CharacterResourceCharge[],
    desiredRows: CharacterResourceCharge[]
): CharacterResourceCharge[] {
    const desiredBySource = new Map(
        desiredRows
            .filter((row): row is CharacterResourceCharge & { source: NonNullable<CharacterResourceCharge["source"]> } => !!row.source)
            .map((row) => [toMentionKey({ id: row.source.entityId, entityType: row.source.entityType }), row])
    )

    const nextRows: CharacterResourceCharge[] = []

    for (const row of currentRows) {
        if (!row.source || row.source.kind === "manual-name-mention") {
            nextRows.push(clampResourceChargeRow(row))
            continue
        }

        const key = toMentionKey({ id: row.source.entityId, entityType: row.source.entityType })
        const desired = desiredBySource.get(key)
        if (!desired) {
            continue
        }

        nextRows.push(clampResourceChargeRow({ ...desired, id: row.id, used: row.used }))
        desiredBySource.delete(key)
    }

    for (const desired of desiredRows) {
        if (!desired.source) continue
        const key = toMentionKey({ id: desired.source.entityId, entityType: desired.source.entityType })
        if (!desiredBySource.has(key)) continue
        nextRows.push(clampResourceChargeRow(desired))
        desiredBySource.delete(key)
    }

    return nextRows
}
