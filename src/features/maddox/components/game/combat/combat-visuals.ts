import { rarityColors } from "@/lib/config/colors"
import type { HpBand } from "../../../combat-rules"

/** Cores do combate tático (Maddox 7): mesmas cores de raridade da DND-18. */
export const HP_BAND_COLORS: Record<HpBand, string> = {
    ileso: rarityColors.uncommon,
    ferido: rarityColors.legendary,
    "muito-ferido": rarityColors.artifact,
    caido: rarityColors.common,
}

export const ECONOMY_LABELS = { action: "Ação", bonus: "Ação bônus", reaction: "Reação" } as const
export const ECONOMY_COLORS = { action: rarityColors.rare, bonus: rarityColors.veryRare, reaction: rarityColors.legendary } as const

/** Cor da barra de PV dos personagens pela fração restante. */
export function hpColor(current: number, max: number): string {
    if (current <= 0) return rarityColors.common
    const ratio = max > 0 ? current / max : 0
    return ratio > 0.5 ? rarityColors.uncommon : ratio > 0.25 ? rarityColors.legendary : rarityColors.artifact
}
