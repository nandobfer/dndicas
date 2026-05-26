import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import { SKILL_ATTRIBUTE_MAP } from "@/features/character-sheets/utils/dnd-calculations"
import type { MonsterAttributes, MonsterChallengeRating, MonsterSkillState, MonsterSavingThrowState } from "../types/monsters.types"

export const CR_OPTIONS = [
    "0",
    "1/8",
    "1/4",
    "1/2",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
] as const

const XP_BY_CR: Record<string, number> = {
    "0": 10,
    "1/8": 25,
    "1/4": 50,
    "1/2": 100,
    "1": 200,
    "2": 450,
    "3": 700,
    "4": 1100,
    "5": 1800,
    "6": 2300,
    "7": 2900,
    "8": 3900,
    "9": 5000,
    "10": 5900,
    "11": 7200,
    "12": 8400,
    "13": 10000,
    "14": 11500,
    "15": 13000,
    "16": 15000,
    "17": 18000,
    "18": 20000,
    "19": 22000,
    "20": 25000,
    "21": 33000,
    "22": 41000,
    "23": 50000,
    "24": 62000,
    "25": 75000,
    "26": 90000,
    "27": 105000,
    "28": 120000,
    "29": 135000,
    "30": 155000,
}

export function getMonsterXp(challengeRating: MonsterChallengeRating, override?: number) {
    return override ?? XP_BY_CR[challengeRating] ?? 0
}

export function getMonsterProficiencyBonus(challengeRating: MonsterChallengeRating, override?: number) {
    if (override !== undefined) return override
    if (["0", "1/8", "1/4", "1/2"].includes(challengeRating)) return 2
    const cr = Number(challengeRating)
    if (!Number.isFinite(cr)) return 2
    if (cr <= 4) return 2
    if (cr <= 8) return 3
    if (cr <= 12) return 4
    if (cr <= 16) return 5
    if (cr <= 20) return 6
    if (cr <= 24) return 7
    if (cr <= 28) return 8
    return 9
}

export function formatSigned(value: number) {
    return value >= 0 ? `+${value}` : String(value)
}

export function getAttributeModifier(value: number) {
    return Math.floor((value - 10) / 2)
}

export function getMonsterSkillBonus(skill: SkillName, attributes: MonsterAttributes, state: MonsterSkillState | undefined, proficiencyBonus: number) {
    if (state?.override !== undefined) return state.override
    const attr = SKILL_ATTRIBUTE_MAP[skill]
    const mod = getAttributeModifier(attributes[attr])
    const prof = state?.expertise ? proficiencyBonus * 2 : state?.proficient ? proficiencyBonus : 0
    return mod + prof
}

export function getMonsterSavingThrowBonus(attribute: AttributeType, attributes: MonsterAttributes, state: MonsterSavingThrowState | undefined, proficiencyBonus: number) {
    if (state?.override !== undefined) return state.override
    const mod = getAttributeModifier(attributes[attribute])
    return mod + (state?.proficient ? proficiencyBonus : 0)
}

export function getMonsterPassivePerception(attributes: MonsterAttributes, perception: MonsterSkillState | undefined, proficiencyBonus: number, override?: number) {
    return override ?? 10 + getMonsterSkillBonus("Percepção", attributes, perception, proficiencyBonus)
}
