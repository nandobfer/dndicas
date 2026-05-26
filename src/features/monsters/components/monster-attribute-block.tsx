"use client"

import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import { CalcTooltip } from "@/features/character-sheets/components/calc-tooltip"
import { GlassCheckbox, SkillGlassCheckbox, type SkillCheckboxState } from "@/features/character-sheets/components/glass-checkbox"
import { SheetInput } from "@/features/character-sheets/components/sheet-input"
import { attributeColors, rarityColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { MonsterAttributes, MonsterSavingThrowState, MonsterSkillState } from "../types/monsters.types"
import { formatSigned, getAttributeModifier, getMonsterSavingThrowBonus, getMonsterSkillBonus } from "../utils/monster-calculations"

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

type SkillEntry = {
    name: SkillName
    state?: MonsterSkillState
}

const toSkillState = (state?: MonsterSkillState): SkillCheckboxState => {
    if (state?.expertise) return 2
    if (state?.proficient) return 1
    return 0
}

export function MonsterAttributeBlock({
    attributeKey,
    attributes,
    value,
    savingThrow,
    skills,
    proficiencyBonus,
    onValueChange,
    onSavingThrowChange,
    onSkillChange,
    isReadOnly = false,
}: {
    attributeKey: AttributeType
    attributes: MonsterAttributes
    value: number
    savingThrow?: MonsterSavingThrowState
    skills: SkillEntry[]
    proficiencyBonus: number
    onValueChange: (value: number) => void
    onSavingThrowChange: (value: MonsterSavingThrowState) => void
    onSkillChange: (skill: SkillName, value: MonsterSkillState) => void
    isReadOnly?: boolean
}) {
    const label = ATTRIBUTE_LABEL[attributeKey]
    const colors = attributeColors[label as keyof typeof attributeColors]
    const modifier = getAttributeModifier(value)
    const savingValue = getMonsterSavingThrowBonus(attributeKey, attributes, savingThrow, proficiencyBonus)

    const handleSkillStateChange = (skill: SkillName, next: SkillCheckboxState) => {
        const current = skills.find((item) => item.name === skill)?.state ?? { proficient: false, expertise: false }
        onSkillChange(skill, {
            ...current,
            proficient: next > 0,
            expertise: next === 2,
        })
    }

    return (
        <div className={cn("rounded-lg border p-2 flex flex-col gap-1.5 transition-all", colors.border, colors.bgAlpha)}>
            <div className="flex items-center justify-between">
                <span className={cn("text-[9px] font-black uppercase tracking-widest", colors.text)}>{label}</span>
                <span className="text-[8px] font-bold uppercase text-white/30">{ATTRIBUTE_ABBR[attributeKey]}</span>
            </div>

            <div className="flex items-center gap-2">
                <CalcTooltip formula={`${value} → floor((${value}-10)/2)`} result={formatSigned(modifier)}>
                    <div className={cn("w-14 h-14 rounded-full border-2 flex items-center justify-center flex-shrink-0 cursor-help", colors.border, colors.bgAlpha)}>
                        <span className={cn("text-2xl font-black leading-none", colors.text)}>{formatSigned(modifier)}</span>
                    </div>
                </CalcTooltip>
                <SheetInput
                    type="number"
                    min={1}
                    max={30}
                    compact
                    showControls
                    value={String(value)}
                    onChangeValue={(next) => {
                        const parsed = Number.parseInt(next, 10)
                        if (Number.isFinite(parsed)) onValueChange(parsed)
                    }}
                    inputClassName="text-center text-sm font-bold"
                    className="flex-1"
                    readOnlyMode={isReadOnly}
                />
            </div>

            <div className="flex items-center gap-1.5 group/st">
                <GlassCheckbox checked={!!savingThrow?.proficient} onChange={(checked) => onSavingThrowChange({ ...(savingThrow ?? { proficient: false }), proficient: checked })} accentColor={colors.hex} disabled={isReadOnly} />
                <CalcTooltip formula={savingThrow?.override !== undefined ? "Valor manual" : `${formatSigned(modifier)} + proficiência`} result={formatSigned(savingValue)}>
                    <div className="flex items-center gap-1.5 cursor-help">
                        <span className={cn("text-[10px] w-6 text-center font-bold", colors.text)}>{formatSigned(savingValue)}</span>
                        <span className="text-[9px] text-white/50 group-hover/st:text-white/80 transition-colors">Salvaguarda</span>
                    </div>
                </CalcTooltip>
                <SheetInput
                    type="text"
                    inputMode="numeric"
                    compact
                    allowEmptyNumber
                    value={savingThrow?.override ?? ""}
                    onChangeValue={(next) => onSavingThrowChange({ ...(savingThrow ?? { proficient: false }), override: next === "" ? undefined : Number(next.replace(/[^\d+-]/g, "")) })}
                    className="ml-auto w-12"
                    inputClassName="text-[9px] text-center"
                    placeholder="ovr"
                    readOnlyMode={isReadOnly}
                />
            </div>

            {skills.length > 0 && (
                <div className="space-y-0.5 pt-1 border-t border-white/10">
                    {skills.map((skill) => {
                        const value = getMonsterSkillBonus(skill.name, attributes, skill.state, proficiencyBonus)
                        return (
                            <div key={skill.name} className="flex items-center gap-1.5 group/sk">
                                <SkillGlassCheckbox state={toSkillState(skill.state)} onChange={(next) => handleSkillStateChange(skill.name, next)} proficientColor={colors.hex} expertiseColor={rarityColors.divine} disabled={isReadOnly} />
                                <CalcTooltip formula={skill.state?.override !== undefined ? "Valor manual" : "Atributo + proficiência"} result={formatSigned(value)}>
                                    <div className="flex items-center gap-1 cursor-help min-w-0">
                                        <span className={cn("text-[9px] w-5 text-center font-bold", colors.text)}>{formatSigned(value)}</span>
                                        <span className="text-[9px] text-white/50 group-hover/sk:text-white/80 transition-colors leading-tight truncate">{skill.name}</span>
                                    </div>
                                </CalcTooltip>
                                <SheetInput
                                    type="text"
                                    inputMode="numeric"
                                    compact
                                    allowEmptyNumber
                                    value={skill.state?.override ?? ""}
                                    onChangeValue={(next) => onSkillChange(skill.name, { ...(skill.state ?? { proficient: false, expertise: false }), override: next === "" ? undefined : Number(next.replace(/[^\d+-]/g, "")) })}
                                    className="ml-auto w-12"
                                    inputClassName="text-[9px] text-center"
                                    placeholder="ovr"
                                    readOnlyMode={isReadOnly}
                                />
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
