"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { UseFormWatch } from "react-hook-form"
import { PatchSheetBody } from "../types/character-sheet.types"
import { usePatchSheet, useAttacks, useAddAttack, usePatchAttack, useRemoveAttack } from "../api/character-sheets-queries"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { CharacterSheet } from "../types/character-sheet.types"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import { GlassCheckbox } from "./glass-checkbox"
import { GlassProficiencyCheckbox } from "@/components/ui/glass-proficiency-checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/core/ui/tooltip"
import { useAttackNameSync } from "./hooks/use-attack-name-sync"
import { ResourceChargeList } from "./resource-charge-list"
import { extractMentionsFromHtml } from "../utils/mention-sync"
import { buildSpellAttackAutofill } from "../utils/attack-autofill"
import { fetchSpell } from "@/features/spells/api/spells-api"

interface SheetAttacksAndTraitsProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
    forceDesktopLayout?: boolean
}

const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

type UseSheetAttacksAndTraitsSectionsProps = SheetAttacksAndTraitsProps

export function useSheetAttacksAndTraitsSections({ sheet, form, isReadOnly = false }: UseSheetAttacksAndTraitsSectionsProps) {
    const { watch, setFieldLocally, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const { data: attacks = [] } = useAttacks(sheet._id)
    const [focusAttackId, setFocusAttackId] = useState<string | null>(null)
    const addAttack = useAddAttack(sheet._id, {
        onOptimisticCreate: setFocusAttackId,
    })
    const patchAttack = usePatchAttack(sheet._id)
    const removeAttack = useRemoveAttack(sheet._id)
    const clearFocusAttackId = useCallback(() => {
        setFocusAttackId(null)
    }, [])

    const { handleAttackNameChange } = useAttackNameSync({
        calc,
        level: currentSheet.level,
        isReadOnly,
        onPatch: (attackId, data) => patchAttack.mutate({ attackId, data }),
    })

    useEffect(() => {
        if (isReadOnly || attacks.length === 0) return
        let cancelled = false

        void (async () => {
            await Promise.all(attacks.map(async (attack) => {
                const spellMention = extractMentionsFromHtml(attack.name).find((mention) => mention.entityType === "Magia")
                if (!spellMention) return

                try {
                    const catalogSpell = await fetchSpell(spellMention.id)
                    if (catalogSpell.circle !== 0 || !catalogSpell.baseDice) return

                    const nextAttack = buildSpellAttackAutofill(catalogSpell, calc, currentSheet.level)
                    if (cancelled) return
                    if (attack.damageType !== nextAttack.damageType || attack.attackBonus !== nextAttack.attackBonus) {
                        patchAttack.mutate({ attackId: attack._id, data: nextAttack })
                    }
                } catch {
                    // Ignore catalog fetch failures; manual attack rows should remain editable.
                }
            }))
        })()

        return () => {
            cancelled = true
        }
    }, [attacks, calc, currentSheet.level, isReadOnly, patchAttack])

    const combatStatsCard = (
        <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1 relative group/initiative">
                <div className="absolute top-2 right-2 z-10">
                    <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                            <GlassProficiencyCheckbox
                                checked={!!currentValues.initiativeProficiency}
                                onCheckedChange={(checked) => patchField("initiativeProficiency", checked)}
                                disabled={isReadOnly}
                            />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-widest px-2 py-1">
                            Somar proficiência na iniciativa
                        </TooltipContent>
                    </Tooltip>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Iniciativa</span>
                <CalcTooltip formula={calc.initiative.formula} parts={calc.initiative.parts} result={calc.initiative.result}>
                    <span className="text-xl font-black text-white">{formatMod(calc.initiative.value)}</span>
                </CalcTooltip>
            </div>

            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Deslocamento</span>
                <SheetInput
                    value={String(currentValues.movementSpeed ?? sheet.movementSpeed ?? "")}
                    onChangeValue={(val) => patchField("movementSpeed", val)}
                    placeholder="9m"
                    isLoading={isLoading}
                    inputClassName="text-xl font-black text-center"
                    className="items-center"
                    readOnlyMode={isReadOnly}
                />
            </div>

            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Tamanho</span>
                <SheetInput
                    value={String(currentValues.size ?? sheet.size ?? "")}
                    onChangeValue={(v) => patchField("size" as keyof PatchSheetBody, v)}
                    placeholder="Médio"
                    isLoading={isLoading}
                    inputClassName="text-xl font-black text-center"
                    className="items-center w-full"
                    readOnlyMode={isReadOnly}
                />
            </div>

            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center leading-tight">Percepção Passiva</span>
                <CalcTooltip formula={calc.passivePerception.formula} parts={calc.passivePerception.parts} result={calc.passivePerception.result}>
                    <span className="text-xl font-black text-white">{calc.passivePerception.value}</span>
                </CalcTooltip>
            </div>
        </div>
    )

    const attacksCard = (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Armas e Truques de Dano</span>
            </div>

            <div className="grid grid-cols-[minmax(0,2fr)_80px_minmax(0,2.5fr)_auto] gap-1 px-2 py-1 border-b border-white/5">
                {["Nome", "Bônus Atq", "Dano e Tipo", ""].map((h) => (
                    <span key={h} className="text-[8px] font-black uppercase tracking-widest text-white/30 text-center">
                        {h}
                    </span>
                ))}
            </div>

            <div className="divide-y divide-white/5">
                <AnimatePresence initial={false}>
                    {attacks.map((attack) => {
                        const rowKey = attack.clientKey ?? attack._id
                        return (
                        <motion.div
                            key={rowKey}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-[minmax(0,2fr)_80px_minmax(0,2.5fr)_auto] gap-1 px-2 py-1 items-center"
                        >
                            <CompactRichInput
                                value={attack.name}
                                onChange={() => {}}
                                onBlur={(v) => handleAttackNameChange(attack._id, v)}
                                placeholder="Nome"
                                disabled={isReadOnly}
                                specificEntityMentions={["Item", "Magia"]}
                                mentionItemTypes={["arma"]}
                                openMentionsOnFocus
                                focusToken={!isReadOnly && focusAttackId === rowKey ? rowKey : null}
                                onAutoFocusApplied={clearFocusAttackId}
                            />
                            <SheetInput
                                compact
                                value={String(attack.attackBonus ?? "")}
                                onChangeValue={(v) => patchAttack.mutate({ attackId: attack._id, data: { attackBonus: v } })}
                                placeholder="+7"
                                inputClassName="text-center text-xs"
                                className="w-[80px]"
                                readOnlyMode={isReadOnly}
                            />
                            <CompactRichInput
                                value={attack.damageType}
                                onChange={() => {}}
                                onBlur={(v) => patchAttack.mutate({ attackId: attack._id, data: { damageType: v } })}
                                placeholder="Dano e tipo"
                                editorClassName="text-xs"
                                disabled={isReadOnly}
                            />
                            <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => !isReadOnly && removeAttack.mutate(attack._id)}
                                className="text-red-400/30 hover:text-red-400 transition-colors flex-shrink-0 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    )})}
                </AnimatePresence>
            </div>

            {!isReadOnly && (
            <div className="px-2 pb-2 pt-1">
                <button
                    type="button"
                    onClick={() => addAttack.mutate({ name: "", attackBonus: "", damageType: "" })}
                    className="w-full flex items-center justify-center gap-2 py-1.5 border border-dashed border-white/10 rounded text-[9px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                >
                    <Plus className="w-3 h-3" /> Adicionar ataque
                </button>
            </div>
            )}
        </div>
    )

    const classFeaturesCard = (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <div className="p-2">
                <CompactRichInput
                    variant="full"
                    label="Características de Classe"
                    value={currentValues.classFeatures ?? sheet.classFeatures ?? ""}
                    onChange={(v) => setFieldLocally("classFeatures" as keyof PatchSheetBody, v)}
                    onBlur={(v) => patchField("classFeatures" as keyof PatchSheetBody, v)}
                    placeholder="Descreva as características de classe... use @para mencionar"
                    isLoading={isLoading}
                    minRows={5}
                    disabled={isReadOnly}
                />
            </div>
        </div>
    )

    const speciesTraitsCard = (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <div className="p-2">
                <CompactRichInput
                    variant="full"
                    label="Traços de Espécies"
                    value={currentValues.speciesTraits ?? sheet.speciesTraits ?? ""}
                    onChange={(v) => setFieldLocally("speciesTraits" as keyof PatchSheetBody, v)}
                    onBlur={(v) => patchField("speciesTraits" as keyof PatchSheetBody, v)}
                    placeholder="Traços raciais... use @ para mencionar"
                    isLoading={isLoading}
                    minRows={5}
                    disabled={isReadOnly}
                />
            </div>
        </div>
    )

    const featsCard = (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <div className="p-2">
                <CompactRichInput
                    variant="full"
                    label="Talentos"
                    value={currentValues.featuresNotes ?? sheet.featuresNotes ?? ""}
                    onChange={(v) => setFieldLocally("featuresNotes" as keyof PatchSheetBody, v)}
                    onBlur={(v) => patchField("featuresNotes" as keyof PatchSheetBody, v)}
                    placeholder="@alerta, @atirador, @sortudo..."
                    isLoading={isLoading}
                    minRows={5}
                    disabled={isReadOnly}
                />
            </div>
        </div>
    )

    return {
        combatStatsCard,
        attacksCard,
        resourceChargesCard: <ResourceChargeList sheet={sheet} form={form} isReadOnly={isReadOnly} />,
        classFeaturesCard,
        speciesTraitsCard,
        featsCard,
    }
}

export function SheetAttacksAndTraits({ sheet, form, isReadOnly = false, forceDesktopLayout = false }: SheetAttacksAndTraitsProps) {
    const sections = useSheetAttacksAndTraitsSections({ sheet, form, isReadOnly })

    return (
        <div className="space-y-4">
            {sections.combatStatsCard}
            {sections.attacksCard}
            {sections.resourceChargesCard}
            {sections.classFeaturesCard}
            <div className={forceDesktopLayout ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3 lg:grid-cols-2"}>
                {sections.speciesTraitsCard}
                {sections.featsCard}
            </div>
        </div>
    )
}
