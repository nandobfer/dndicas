import { useMemo } from "react"
import {
    getProficiencyBonus,
    getAttributeModifier,
    getSavingThrowBonus,
    getSkillBonus,
    getArmorClass,
    getInitiative,
    getPassivePerception,
    getSpellSaveDC,
    getSpellAttackBonus,
    SKILL_ATTRIBUTE_MAP,
    type ArmorClassBonusSource,
    type EquippedArmorData,
} from "../utils/dnd-calculations"
import type { CharacterSheet, SkillName, AttributeType } from "../types/character-sheet.types"

interface UseCharacterCalculationsOptions {
    equippedArmor?: EquippedArmorData | null
    armorClassBonusSources?: ArmorClassBonusSource[]
}

export function useCharacterCalculations(sheet: CharacterSheet, opts?: UseCharacterCalculationsOptions) {
    return useMemo(() => {
        const profBonus = getProficiencyBonus(sheet.level, sheet.proficiencyBonusOverride)

        const attributes: Record<AttributeType, number> = {
            strength: sheet.strength,
            dexterity: sheet.dexterity,
            constitution: sheet.constitution,
            intelligence: sheet.intelligence,
            wisdom: sheet.wisdom,
            charisma: sheet.charisma,
        }

        const attrMods: Record<AttributeType, ReturnType<typeof getAttributeModifier>> = {
            strength: getAttributeModifier(sheet.strength),
            dexterity: getAttributeModifier(sheet.dexterity),
            constitution: getAttributeModifier(sheet.constitution),
            intelligence: getAttributeModifier(sheet.intelligence),
            wisdom: getAttributeModifier(sheet.wisdom),
            charisma: getAttributeModifier(sheet.charisma),
        }

        const savingThrows = (["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as AttributeType[]).reduce(
            (acc, attr) => {
                const proficient = (sheet.savingThrows as Record<string, boolean> | undefined)?.[attr] ?? false
                acc[attr] = getSavingThrowBonus(sheet[attr as keyof CharacterSheet] as number, proficient, profBonus.value, attr)
                return acc
            },
            {} as Record<AttributeType, ReturnType<typeof getSavingThrowBonus>>,
        )

        const skills = (Object.keys(SKILL_ATTRIBUTE_MAP) as SkillName[]).reduce(
            (acc, skill) => {
                const skillData = (sheet.skills as Record<string, { proficient: boolean; expertise: boolean; override?: number }> | undefined)?.[skill] ?? { proficient: false, expertise: false }
                acc[skill] = getSkillBonus(skill, attributes, skillData, profBonus.value)
                return acc
            },
            {} as Record<SkillName, ReturnType<typeof getSkillBonus>>,
        )

        const armorClass = getArmorClass(
            sheet.dexterity,
            sheet.armorClassOverride,
            opts?.equippedArmor,
            opts?.armorClassBonusSources,
            sheet.armorClassBonus,
        )
        const initiative = getInitiative(sheet.dexterity, sheet.initiativeOverride)
        const passivePerception = getPassivePerception(
            skills["Percepção"]?.value ?? 0,
            sheet.passivePerceptionOverride,
        )

        const spellAttrValue = sheet.spellcastingAttribute
            ? (attributes[sheet.spellcastingAttribute as AttributeType] ?? 10)
            : 10

        const spellAttrType = sheet.spellcastingAttribute as AttributeType | undefined
        const spellSaveDC = getSpellSaveDC(spellAttrValue, profBonus.value, sheet.spellSaveDCOverride, spellAttrType)
        const spellAttackBonus = getSpellAttackBonus(spellAttrValue, profBonus.value, sheet.spellAttackBonusOverride, spellAttrType)

        return {
            profBonus,
            attrMods,
            savingThrows,
            skills,
            armorClass,
            initiative,
            passivePerception,
            spellSaveDC,
            spellAttackBonus,
        }
    }, [sheet, opts?.equippedArmor, opts?.armorClassBonusSources])
}
