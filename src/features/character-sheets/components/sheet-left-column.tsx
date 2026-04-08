"use client"

import { cn } from "@/core/utils"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import { AttributeBlock, type SkillEntry } from "./attribute-block"
import { CompactRichInput } from "./compact-rich-input"
import { GlassCheckbox } from "./glass-checkbox"
import type { PatchSheetBody, AttributeType, SkillName, CharacterSheet } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { SKILL_ATTRIBUTE_MAP } from "../utils/dnd-calculations"
import { usePatchSheet } from "../api/character-sheets-queries"
import { Zap } from "lucide-react"

const LEFT_ATTRIBUTES: AttributeType[] = ["strength", "dexterity", "constitution"]

interface SheetLeftColumnProps {
    sheet: CharacterSheet
    form: any
}

export function SheetLeftColumn({ sheet, form }: SheetLeftColumnProps) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

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
        const curr = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
        patchField("skills", {
            ...curr,
            [skill]: { proficient, expertise },
        })
    }

    const handleSavingThrowToggle = (attr: AttributeType) => {
        const curr = (currentSheet.savingThrows as Record<string, boolean> | undefined) ?? {}
        patchField("savingThrows", { ...curr, [attr]: !curr[attr] })
    }

    const armorTraining = currentValues.armorTraining ?? sheet.armorTraining ?? { light: false, medium: false, heavy: false, shields: false }

    const toggleArmor = (key: "light" | "medium" | "heavy" | "shields") => {
        patchField("armorTraining", { ...armorTraining, [key]: !armorTraining[key] })
    }

    return (
        <div className="space-y-3">
            {/* Proficiency Bonus */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Bônus de Proficiência</span>
                <CalcTooltip formula={calc.profBonus.formula}>
                    <span className="text-lg font-black text-white/90">{formatMod(calc.profBonus.value)}</span>
                </CalcTooltip>
            </div>

            {/* FOR, DES, CON with their skills */}
            {LEFT_ATTRIBUTES.map((attrKey) => (
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
                />
            ))}

            {/* Inspiração Heroica */}
            <div
                className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all select-none",
                    currentValues.inspiration
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                )}
                onClick={() => patchField("inspiration", !currentValues.inspiration)}
            >
                <Zap className={cn("w-4 h-4 flex-shrink-0", currentValues.inspiration ? "text-amber-400" : "text-white/30")} />
                <span className={cn("text-[9px] font-black uppercase tracking-widest", currentValues.inspiration ? "text-amber-400" : "text-white/40")}>
                    Inspiração Heroica
                </span>
                <div className={cn("ml-auto w-3 h-3 rotate-45 border transition-all", currentValues.inspiration ? "bg-amber-400 border-amber-400" : "bg-transparent border-white/30")} />
            </div>

            {/* Treinamento em Equipamentos e Proficiências */}
            <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
                    <label className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">
                        Treinamento em Equipamentos e Proficiências
                    </label>
                </div>
                <div className="p-2 space-y-2">
                    {/* Armor training */}
                    <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-1">Armaduras</label>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            {(["light", "medium", "heavy", "shields"] as const).map((key) => (
                                <label key={key} className="flex items-center gap-1.5 cursor-pointer group" onClick={() => toggleArmor(key)}>
                                    <GlassCheckbox
                                        checked={!!armorTraining[key]}
                                        onChange={() => toggleArmor(key)}
                                    />
                                    <span className="text-[8px] font-semibold text-white/40 group-hover:text-white/70 transition-colors capitalize">
                                        {key === "light" ? "Leve" : key === "medium" ? "Média" : key === "heavy" ? "Pesada" : "Escudos"}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Weapon proficiencies */}
                    <CompactRichInput
                        label="Armas"
                        value={currentValues.weaponProficiencies ?? sheet.weaponProficiencies ?? ""}
                        onChange={(v) => patchField("weaponProficiencies" as keyof PatchSheetBody, v)}
                        placeholder="Proficiências com armas..."
                        isLoading={isLoading}
                    />

                    {/* Tool proficiencies */}
                    <CompactRichInput
                        label="Ferramentas"
                        value={currentValues.toolProficiencies ?? sheet.toolProficiencies ?? ""}
                        onChange={(v) => patchField("toolProficiencies" as keyof PatchSheetBody, v)}
                        placeholder="Proficiências com ferramentas..."
                        isLoading={isLoading}
                    />
                </div>
            </div>
        </div>
    )
}

