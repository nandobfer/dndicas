import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"

const log = loggerFor({ module: "maddox", feature: "seat-hit-points" })

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

/** Campos da ficha que mudam a barra de PV do card "Na mesa". */
export const SEAT_HIT_POINTS_FIELDS = ["hpCurrent", "hpMax", "hpTemp"] as const

/**
 * DND-63: a ficha de um personagem de campanha Maddox (graus com ficha, campanha em andamento) teve o PV editado fora do
 * Maddox (PATCH da ficha): avisa a mesa para os outros jogadores verem a barra nova. Nunca lança.
 */
export async function notifySheetHitPointsChanged(sheetId: string, changed: Record<string, unknown>): Promise<void> {
    try {
        if (!Types.ObjectId.isValid(sheetId) || !SEAT_HIT_POINTS_FIELDS.some((field) => changed[field] !== undefined)) return
        const { MaddoxCampaignModel, MaddoxCharacterModel } = await import("../models")
        const characters = await MaddoxCharacterModel.find({ sheetId: new Types.ObjectId(sheetId) }).select("campaignId").lean<{ campaignId: Types.ObjectId }[]>()
        if (!characters.length) return
        const { hasLevels } = await import("./progression-mode")
        const campaigns = await MaddoxCampaignModel.find({ _id: { $in: characters.map((character) => character.campaignId) }, status: "active" }).select("rigor").lean<{ _id: Types.ObjectId; rigor: Parameters<typeof hasLevels>[0] }[]>()
        const { publishGameChanged } = await import("./game")
        for (const campaign of campaigns) if (hasLevels(campaign.rigor)) await publishGameChanged(campaign._id)
    } catch (error) {
        log.warn({ sheetId, err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao avisar a mesa do PV editado na ficha")
    }
}
