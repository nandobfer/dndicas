import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceModifierPart } from "@/features/dice-roller/types"
import { MADDOX_ABILITY_LABELS } from "./check-modifier"

/**
 * Parcelas nomeadas do modificador das rolagens do combate (DND-47), para o tooltip do resultado. O motor alinha a soma
 * ao modificador da expressão rolada; aqui só se dá nome a cada parte que o servidor conhece.
 */

/** "Exaustão −2" (só com exaustão). */
export const exhaustionParts = (penalty: number): DiceModifierPart[] => (penalty ? [{ label: "Exaustão", value: penalty, color: "manual" }] : [])

/** Uma parcela única com nome (bônus que o bloco do monstro só dá como número). */
export const namedPart = (label: string, value: number, color: DiceModifierPart["color"] = "base"): DiceModifierPart[] => (value ? [{ label, value, color }] : [])

export const monsterSaveParts = (ability: AttributeType, value: number) => namedPart(`Salvaguarda de ${MADDOX_ABILITY_LABELS[ability]}`, value, ability)
export const monsterAttackParts = (value: number) => namedPart("Bônus de ataque", value)
export const monsterDamageParts = (value: number) => namedPart("Modificador de dano", value)
export const initiativeParts = (value: number) => namedPart("Iniciativa", value, "dexterity")
