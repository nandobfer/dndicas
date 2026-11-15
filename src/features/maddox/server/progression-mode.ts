import { MADDOX_PROGRESSION_DEFAULT, MADDOX_SHEET_RIGORS, type MaddoxProgressionMode, type MaddoxRigorLevel } from "../constants"
import type { IMaddoxCampaign } from "../models"

/** Graus com nível de personagem (ficha D&D). Módulo leve: usado pela progressão (DND-56) e pela barra de XP (DND-63). */
export const hasLevels = (rigor: MaddoxRigorLevel) => MADDOX_SHEET_RIGORS.includes(rigor)

/** Modo de progressão (`null` nos graus sem ficha). Campanhas sem o campo ficam em "marco". */
export function progressionModeOf(campaign: Pick<IMaddoxCampaign, "rigor" | "progression">): MaddoxProgressionMode | null {
    if (!hasLevels(campaign.rigor)) return null
    return campaign.progression?.mode ?? MADDOX_PROGRESSION_DEFAULT
}
