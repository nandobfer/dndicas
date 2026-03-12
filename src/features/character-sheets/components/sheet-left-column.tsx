"use client"

import { UseFormReturn } from "react-hook-form"
import { cn } from "@/core/utils"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import type { PatchSheetBody, AttributeType, SkillName } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import type { CharacterSheet } from "../types/character-sheet.types"
import { SKILL_ATTRIBUTE_MAP } from "../utils/dnd-calculations"

const ATTRIBUTES: { key: AttributeType; label: string; abbr: string; color: string }[] = [
    { key: "strength", label: "Força", abbr: "FOR", color: "text-amber-400 border-amber-500/30 bg-amber-500/5" },
    { key: "dexterity", label: "Destreza", abbr: "DES", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
    { key: "constitution", label: "Constituição", abbr: "CON", color: "text-red-400 border-red-500/30 bg-red-500/5" },
    { key: "intelligence", label: "Inteligência", abbr: "INT", color: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
    { key: "wisdom", label: "Sabedoria", abbr: "SAB", color: "text-slate-300 border-slate-500/30 bg-slate-500/5" },
    { key: "charisma", label: "Carisma", abbr: "CAR", color: "text-purple-400 border-purple-500/30 bg-purple-500/5" },
]

const SAVING_THROW_LABELS: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

interface SheetLeftColumnProps {
    sheet: CharacterSheet
    form: UseFormReturn<PatchSheetBody>
}

export function SheetLeftColumn({ sheet, form }: SheetLeftColumnProps) {
    const { register, watch, setValue } = form
    const currentSheet = { ...sheet, ...watch() } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)

    const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

    return (
        <div className="space-y-4">
            {/* Inspiration + Proficiency Bonus */}
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="w-4 h-4 accent-amber-400 rounded"
                        {...register("inspiration")}
                    />
                    <span className="text-xs font-semibold text-white/70">Inspiração</span>
                </label>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Prof.</span>
                    <CalcTooltip formula={calc.profBonus.formula}>
                        <span className="text-sm font-bold text-white/80">
                            {formatMod(calc.profBonus.value)}
                        </span>
                    </CalcTooltip>
                </div>
            </div>

            {/* Attributes */}
            <div className="grid grid-cols-3 gap-2">
                {ATTRIBUTES.map(({ key, abbr, color }) => (
                    <div
                        key={key}
                        className={cn(
                            "rounded-lg border p-2 flex flex-col items-center gap-1",
                            color,
                        )}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">{abbr}</span>
                        <CalcTooltip formula={calc.attrMods[key].formula}>
                            <span className="text-lg font-black">
                                {formatMod(calc.attrMods[key].value)}
                            </span>
                        </CalcTooltip>
                        <input
                            type="number"
                            min={1}
                            max={30}
                            className="text-center text-xs font-bold w-full bg-transparent border-0 border-t border-white/10 pt-1 text-white/70 focus:outline-none"
                            {...register(key as keyof PatchSheetBody, { valueAsNumber: true })}
                        />
                    </div>
                ))}
            </div>

            {/* Saving Throws */}
            <div className="space-y-1">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    Testes de Resistência
                </h3>
                {(Object.keys(SAVING_THROW_LABELS) as AttributeType[]).map((attr) => {
                    return (
                        <div key={attr} className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="w-3.5 h-3.5 accent-violet-400 flex-shrink-0"
                                checked={!!(currentSheet.savingThrows as Record<string, boolean> | undefined)?.[attr]}
                                onChange={(e) => {
                                    const curr = (currentSheet.savingThrows as Record<string, boolean> | undefined) ?? {}
                                    setValue("savingThrows", {
                                        ...curr,
                                        [attr]: e.target.checked,
                                    } as PatchSheetBody["savingThrows"])
                                }}
                            />
                            <CalcTooltip formula={calc.savingThrows[attr].formula}>
                                <span className="text-[10px] font-semibold text-white/60">
                                    <span className="font-bold text-white/80">{formatMod(calc.savingThrows[attr].value)}</span>
                                    {" "}{SAVING_THROW_LABELS[attr]}
                                </span>
                            </CalcTooltip>
                        </div>
                    )
                })}
            </div>

            {/* Skills */}
            <div className="space-y-1">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    Perícias
                </h3>
                {(Object.keys(SKILL_ATTRIBUTE_MAP) as SkillName[]).map((skill) => {
                    const skillData = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined)?.[skill] ?? { proficient: false, expertise: false }
                    const attrAbbr = (() => {
                        const a = SKILL_ATTRIBUTE_MAP[skill]
                        return ATTRIBUTES.find((x) => x.key === a)?.abbr ?? ""
                    })()
                    return (
                        <div key={skill} className="flex items-center gap-1.5">
                            {/* Proficiency */}
                            <input
                                type="checkbox"
                                className="w-3 h-3 accent-violet-400 flex-shrink-0"
                                checked={skillData.proficient}
                                onChange={(e) => {
                                    const curr = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
                                    setValue("skills", {
                                        ...curr,
                                        [skill]: { ...curr[skill], proficient: e.target.checked },
                                    } as PatchSheetBody["skills"])
                                }}
                            />
                            {/* Expertise */}
                            <input
                                type="checkbox"
                                className="w-3 h-3 accent-amber-400 flex-shrink-0"
                                checked={skillData.expertise}
                                title="Especialização"
                                onChange={(e) => {
                                    const curr = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
                                    setValue("skills", {
                                        ...curr,
                                        [skill]: { ...curr[skill], expertise: e.target.checked },
                                    } as PatchSheetBody["skills"])
                                }}
                            />
                            <CalcTooltip formula={calc.skills[skill]?.formula ?? ""}>
                                <span className="text-[10px] text-white/60">
                                    <span className="font-bold text-white/80 mr-1">
                                        {formatMod(calc.skills[skill]?.value ?? 0)}
                                    </span>
                                    {skill}
                                    <span className="text-white/30 ml-1 text-[8px]">({attrAbbr})</span>
                                </span>
                            </CalcTooltip>
                        </div>
                    )
                })}
            </div>

            {/* Passive Perception */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[10px] font-semibold text-white/50">Percepção Passiva</span>
                <CalcTooltip formula={calc.passivePerception.formula}>
                    <span className="text-sm font-bold text-white/80">{calc.passivePerception.value}</span>
                </CalcTooltip>
            </div>
        </div>
    )
}
