"use client"

import type { UseFormWatch } from "react-hook-form"
import { AttributeBlock, type SkillEntry } from "./attribute-block"
import type { PatchSheetBody, AttributeType, SkillName, CharacterSheet } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { SKILL_ATTRIBUTE_MAP } from "../utils/dnd-calculations"
import { usePatchSheet } from "../api/character-sheets-queries"

const MIDDLE_ATTRIBUTES: AttributeType[] = ["intelligence", "wisdom", "charisma"]

interface SheetAttributesRightProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

type UseSheetAttributesRightSectionsProps = SheetAttributesRightProps

export function useSheetAttributesRightSections({ sheet, form, isReadOnly = false }: UseSheetAttributesRightSectionsProps) {
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
                    parts: calc.skills[skill]?.parts,
                    result: calc.skills[skill]?.result,
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

    return MIDDLE_ATTRIBUTES.map((attrKey) => (
        <AttributeBlock
            key={attrKey}
            attributeKey={attrKey}
            value={currentValues[attrKey] ?? 10}
            onValueChange={(v) => patchField(attrKey as keyof PatchSheetBody, v)}
            modifier={calc.attrMods[attrKey].value}
            modifierFormula={calc.attrMods[attrKey].formula}
            modifierParts={calc.attrMods[attrKey].parts}
            modifierResult={calc.attrMods[attrKey].result}
            savingThrow={{
                proficient: !!(currentSheet.savingThrows as Record<string, boolean> | undefined)?.[attrKey],
                value: calc.savingThrows[attrKey].value,
                formula: calc.savingThrows[attrKey].formula,
                parts: calc.savingThrows[attrKey].parts,
                result: calc.savingThrows[attrKey].result,
            }}
            onSavingThrowToggle={() => handleSavingThrowToggle(attrKey)}
            skills={getSkillsForAttribute(attrKey)}
            onSkillChange={handleSkillChange}
            isLoading={isLoading}
            isReadOnly={isReadOnly}
        />
    ))
}

export function SheetAttributesRight({ sheet, form, isReadOnly = false }: SheetAttributesRightProps) {
    const attributeCards = useSheetAttributesRightSections({ sheet, form, isReadOnly })

    return <div className="space-y-3">{attributeCards}</div>
}
