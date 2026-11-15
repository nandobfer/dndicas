import type { Types } from "mongoose"
import { MADDOX_PROGRESSION_DEFAULT, MADDOX_SHEET_RIGORS, type MaddoxProgressionMode, type MaddoxRigorLevel } from "../constants"
import type { MaddoxXpProgressDto } from "../campaign-types"
import { experienceProgress } from "../experience-progress"

/** Campanha com barra de XP (DND-63): grau com ficha e progressão "experiencia". */
export function xpProgressEnabled(campaign: { rigor: MaddoxRigorLevel; progression?: { mode?: MaddoxProgressionMode | null } | null }): boolean {
    return MADDOX_SHEET_RIGORS.includes(campaign.rigor) && (campaign.progression?.mode ?? MADDOX_PROGRESSION_DEFAULT) === "experiencia"
}

export interface XpCharacter {
    _id: Types.ObjectId
    sheetId?: Types.ObjectId | null
    /** Entrevista concluída (`isMemberReadyToPlay`). */
    ready: boolean
}

/**
 * Barra de XP por personagem (id do personagem → progresso). Mapa vazio fora do modo Experiência; personagem sem
 * ficha ou com entrevista em andamento fica fora. Da ficha saem só o nível e a XP.
 */
export async function loadXpProgress(campaign: Parameters<typeof xpProgressEnabled>[0], characters: readonly XpCharacter[]): Promise<Map<string, MaddoxXpProgressDto>> {
    const result = new Map<string, MaddoxXpProgressDto>()
    if (!xpProgressEnabled(campaign)) return result
    const eligible = characters.filter((character): character is XpCharacter & { sheetId: Types.ObjectId } => character.ready && Boolean(character.sheetId))
    if (!eligible.length) return result
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheets = await CharacterSheet.find({ _id: { $in: eligible.map((character) => character.sheetId) } })
        .select("level experience")
        .lean<{ _id: Types.ObjectId; level?: number; experience?: unknown }[]>()
    const bySheet = new Map(sheets.map((sheet) => [String(sheet._id), sheet]))
    for (const character of eligible) {
        const sheet = bySheet.get(String(character.sheetId))
        if (sheet) result.set(String(character._id), experienceProgress(sheet.experience, sheet.level))
    }
    return result
}
