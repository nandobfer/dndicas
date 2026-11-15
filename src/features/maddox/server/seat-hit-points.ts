import { Types } from "mongoose"

/** PV de um personagem no card "Na mesa" (DND-63): o mesmo formato do PV do rastreador de iniciativa. */
export interface SeatHitPoints {
    current: number
    max: number
    temp: number
}

export type HitPointsSheet = { hpCurrent?: number | null; hpMax?: number | null; hpTemp?: number | null }

/** Normalização igual à da mesa de combate (`combat-sheet.ts`): sem PV máximo, `null` (sem barra). */
export function sheetHitPointsOf(sheet: HitPointsSheet | null | undefined): SeatHitPoints | null {
    const max = sheet?.hpMax ?? 0
    if (!sheet || !(max > 0)) return null
    return { current: Math.max(0, sheet.hpCurrent ?? max), max, temp: Math.max(0, sheet.hpTemp ?? 0) }
}

/** PV de várias fichas (id da ficha → PV), numa leitura em lote que só traz os três campos de PV. */
export async function loadHitPointsSummaries(sheetIds: readonly string[]): Promise<Map<string, SeatHitPoints>> {
    const ids = [...new Set(sheetIds.filter((id) => Types.ObjectId.isValid(id)))].map((id) => new Types.ObjectId(id))
    const out = new Map<string, SeatHitPoints>()
    if (!ids.length) return out
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheets = await CharacterSheet.collection.find({ _id: { $in: ids } }, { projection: { hpCurrent: 1, hpMax: 1, hpTemp: 1 } }).toArray()
    for (const sheet of sheets) {
        const hp = sheetHitPointsOf(sheet as HitPointsSheet)
        if (hp) out.set(String(sheet._id), hp)
    }
    return out
}
