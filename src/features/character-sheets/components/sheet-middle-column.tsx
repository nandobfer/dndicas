"use client"

import { AttributeBlock, type SkillEntry } from "./attribute-block"
import type { PatchSheetBody, AttributeType, SkillName, CharacterSheet } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { SKILL_ATTRIBUTE_MAP } from "../utils/dnd-calculations"
import { usePatchSheet } from "../api/character-sheets-queries"

const MIDDLE_ATTRIBUTES: AttributeType[] = ["intelligence", "wisdom", "charisma"]

interface SheetMiddleColumnProps {
    sheet: CharacterSheet
    form: any
    isReadOnly?: boolean
}

export function SheetMiddleColumn({ sheet, form, isReadOnly = false }: SheetMiddleColumnProps) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const getSkillsForAttribute = (attrKey: AttributeType): SkillEntry[] =>
        (Object.keys(SKILL_ATTRIBUTE_MAP) as SkillName[])
            .filter((s) => SKILL_ATTRIBUTE_MAP[s] === attrKey)
            .sort()
            .map((skill) => {
                const skillData = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined)?.[skill] ?? {
                    proficient: false,
                    expertise: false,
                }
                return {
                    name: skill,
                    proficient: skillData.proficient,
                    expertise: skillData.expertise,
                    value: calc.skills[skill]?.value ?? 0,
                    formula: calc.skills[skill]?.formula ?? "",
                }
            })

    const handleSkillChange = (skill: SkillName, proficient: boolean, expertise: boolean) => {
        if (isReadOnly) return
        const curr = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
        patchField("skills", {
            ...curr,
            [skill]: { proficient, expertise },
        })
    }

    const handleSavingThrowToggle = (attr: AttributeType) => {
        if (isReadOnly) return
        const curr = (currentSheet.savingThrows as Record<string, boolean> | undefined) ?? {}
        patchField("savingThrows", { ...curr, [attr]: !curr[attr] })
    }

    return (
        <div className="space-y-3">
            {MIDDLE_ATTRIBUTES.map((attrKey) => (
                <AttributeBlock
                    key={attrKey}
                    attributeKey={attrKey}
                    value={currentValues[attrKey] ?? 10}
                    onValueChange={(v) => patchField(attrKey as keyof PatchSheetBody, v)}
                    modifier={calc.attrMods[attrKey].value}
                    modifierFormula={calc.attrMods[attrKey].formula}
                    savingThrow={{
                        proficient: !!(currentSheet.savingThrows as Record<string, boolean> | undefined)?.[attrKey],
                        value: calc.savingThrows[attrKey].value,
                        formula: calc.savingThrows[attrKey].formula,
                    }}
                    onSavingThrowToggle={() => handleSavingThrowToggle(attrKey)}
                    skills={getSkillsForAttribute(attrKey)}
                    onSkillChange={handleSkillChange}
                    isLoading={isLoading}
                    isReadOnly={isReadOnly}
                />
            ))}
        </div>
    )
}
