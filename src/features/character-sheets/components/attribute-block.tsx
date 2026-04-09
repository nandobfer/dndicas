"use client"

import { cn } from "@/core/utils"
import { attributeColors, rarityColors } from "@/lib/config/colors"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import { GlassCheckbox, SkillGlassCheckbox, type SkillCheckboxState } from "./glass-checkbox"
import type { AttributeType, SkillName } from "../types/character-sheet.types"
import type { CalcPart } from "../utils/dnd-calculations"

export interface SkillEntry {
    name: SkillName
    proficient: boolean
    expertise: boolean
    value: number
    formula: string
    parts?: CalcPart[]
    result?: string
}

interface AttributeBlockProps {
    attributeKey: AttributeType
    value: number
    onValueChange: (v: number) => void
    modifier: number
    modifierFormula: string
    modifierParts?: CalcPart[]
    modifierResult?: string
    savingThrow: { proficient: boolean; value: number; formula: string; parts?: CalcPart[]; result?: string }
    onSavingThrowToggle: () => void
    skills?: SkillEntry[]
    onSkillChange: (skill: SkillName, proficient: boolean, expertise: boolean) => void
    isLoading?: boolean
    isReadOnly?: boolean
}

const ATTRIBUTE_LABEL: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

const ATTRIBUTE_ABBR: Record<AttributeType, string> = {
    strength: "FOR",
    dexterity: "DES",
    constitution: "CON",
    intelligence: "INT",
    wisdom: "SAB",
    charisma: "CAR",
}

const COLOR_MAP: Record<AttributeType, keyof typeof attributeColors> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

const formatMod = (v: number) => (v > 0 ? `+${v}` : `${v}`)

const toSkillState = (proficient: boolean, expertise: boolean): SkillCheckboxState => {
    if (expertise) return 2
    if (proficient) return 1
    return 0
}

export function AttributeBlock({
    attributeKey,
    value,
    onValueChange,
    modifier,
    modifierFormula,
    modifierParts,
    modifierResult,
    savingThrow,
    onSavingThrowToggle,
    skills = [],
    onSkillChange,
    isLoading = false,
    isReadOnly = false,
}: AttributeBlockProps) {
    const colorKey = COLOR_MAP[attributeKey]
    const colors = attributeColors[colorKey]
    const label = ATTRIBUTE_LABEL[attributeKey]
    const abbr = ATTRIBUTE_ABBR[attributeKey]

    const handleSkillStateChange = (skillName: SkillName, next: SkillCheckboxState) => {
        if (isReadOnly) return
        if (next === 0) onSkillChange(skillName, false, false)
        else if (next === 1) onSkillChange(skillName, true, false)
        else onSkillChange(skillName, true, true)
    }

    return (
        <div className={cn("rounded-lg border p-2 flex flex-col gap-1.5 transition-all", colors.border, colors.bgAlpha)}>
            {/* Header: abbreviation + title */}
            <div className="flex items-center justify-between">
                <span className={cn("text-[9px] font-black uppercase tracking-widest", colors.text)}>{label}</span>
                <span className="text-[8px] font-bold uppercase text-white/30">{abbr}</span>
            </div>

            {/* Modifier circle + value input row */}
            <div className="flex items-center gap-2">
                {/* Modifier circle */}
                <CalcTooltip formula={modifierFormula} parts={modifierParts} result={modifierResult}>
                    <div
                        className={cn(
                            "w-14 h-14 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-help",
                            colors.border,
                            colors.bgAlpha
                        )}
                    >
                        <span className={cn("text-2xl font-black leading-none", colors.text)}>{formatMod(modifier)}</span>
                    </div>
                </CalcTooltip>

                {/* Raw attribute value with +/- controls */}
                <SheetInput
                    type="number"
                    min={1}
                    max={30}
                    compact
                    showControls
                    value={String(value)}
                    onChangeValue={(v) => {
                        const num = parseInt(v)
                        if (!isNaN(num) && num >= 1) onValueChange(num)
                    }}
                    isLoading={isLoading}
                    inputClassName="text-center text-sm font-bold"
                    className="flex-1"
                    readOnlyMode={isReadOnly}
                />
            </div>

            {/* Saving throw */}
            <div className="flex items-center gap-1.5 group/st">
                <GlassCheckbox
                    checked={savingThrow.proficient}
                    onChange={onSavingThrowToggle}
                    accentColor={colors.hex}
                    disabled={isReadOnly}
                />
                <CalcTooltip formula={savingThrow.formula} parts={savingThrow.parts} result={savingThrow.result}>
                    <div className="flex items-center gap-1.5 cursor-help">
                        <span className={cn("text-[10px] w-6 text-center font-bold", colors.text)}>
                            {formatMod(savingThrow.value)}
                        </span>
                        <span className="text-[9px] text-white/50 group-hover/st:text-white/80 transition-colors">Salvaguarda</span>
                    </div>
                </CalcTooltip>
            </div>

            {/* Skills */}
            {skills.length > 0 && (
                <div className="space-y-0.5 pt-1 border-t border-white/10">
                    {skills.map((skill) => (
                        <div key={skill.name} className="flex items-center gap-1.5 group/sk">
                            <SkillGlassCheckbox
                                state={toSkillState(skill.proficient, skill.expertise)}
                                onChange={(next) => handleSkillStateChange(skill.name, next)}
                                proficientColor={colors.hex}
                                expertiseColor={rarityColors.divine}
                                disabled={isReadOnly}
                            />
                            <CalcTooltip formula={skill.formula} parts={skill.parts} result={skill.result}>
                                <div className="flex items-center gap-1 cursor-help">
                                    <span className={cn("text-[9px] w-5 text-center font-bold", colors.text)}>
                                        {formatMod(skill.value)}
                                    </span>
                                    <span className="text-[9px] text-white/50 group-hover/sk:text-white/80 transition-colors leading-tight">
                                        {skill.name}
                                    </span>
                                </div>
                            </CalcTooltip>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
