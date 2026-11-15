import type { Types } from "mongoose"
import type { MaddoxXpProgressDto } from "../campaign-types"
import { experienceProgress } from "../experience-progress"
import type { IMaddoxCampaign } from "../models"
import { progressionModeOf } from "./progression-mode"

/** Campanha com barra de XP (DND-63): a mesma regra da concessão de XP (`progressionModeOf` em "experiencia"). */
export function xpProgressEnabled(campaign: Pick<IMaddoxCampaign, "rigor" | "progression">): boolean {
    return progressionModeOf(campaign) === "experiencia"
}

export interface XpCharacter {
    _id: Types.ObjectId
    sheetId?: Types.ObjectId | null
    /** Entrevista concluída (`isMemberReadyToPlay`). */
    ready: boolean
}

export type XpSheet = { level?: number; experience?: unknown }

/**
 * Elegibilidade única da barra: campanha em modo Experiência, personagem pronto e com ficha carregada. Da ficha saem
 * só o nível e a XP.
 */
export function xpProgressOf(withXp: boolean, ready: boolean, sheet: XpSheet | null | undefined): MaddoxXpProgressDto | null {
    return withXp && ready && sheet ? experienceProgress(sheet.experience, sheet.level) : null
}

/**
 * Barra de XP por personagem (id do personagem → progresso). Mapa vazio fora do modo Experiência; personagem sem
 * ficha ou com entrevista em andamento fica fora.
 */
export async function loadXpProgress(campaign: Pick<IMaddoxCampaign, "rigor" | "progression">, characters: readonly XpCharacter[]): Promise<Map<string, MaddoxXpProgressDto>> {
    const result = new Map<string, MaddoxXpProgressDto>()
    const withXp = xpProgressEnabled(campaign)
    const eligible = withXp ? characters.filter((character): character is XpCharacter & { sheetId: Types.ObjectId } => character.ready && Boolean(character.sheetId)) : []
    if (!eligible.length) return result
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheets = await CharacterSheet.find({ _id: { $in: eligible.map((character) => character.sheetId) } })
        .select("level experience")
        .lean<({ _id: Types.ObjectId } & XpSheet)[]>()
    const bySheet = new Map(sheets.map((sheet) => [String(sheet._id), sheet]))
    for (const character of eligible) {
        const progress = xpProgressOf(withXp, character.ready, bySheet.get(String(character.sheetId)))
        if (progress) result.set(String(character._id), progress)
    }
    return result
}
