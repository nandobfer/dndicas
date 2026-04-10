"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Wand2 } from "lucide-react"
import type { UseFormWatch } from "react-hook-form"
import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import { GlassCheckbox } from "./glass-checkbox"
import { CalcTooltip } from "./calc-tooltip"
import { useSpellList } from "./hooks/use-spell-list"
import { GlassSelector } from "@/components/ui/glass-selector"
import { PointerTooltip } from "./pointer-tooltip"
import { attributeColors } from "@/lib/config/colors"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"

interface SpellListProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

const SPELL_CASTING_OPTIONS = [
    { value: "intelligence", label: "Inteligência", activeColor: attributeColors["Inteligência"].hex, textColor: attributeColors["Inteligência"].hex },
    { value: "wisdom", label: "Sabedoria", activeColor: attributeColors["Sabedoria"].hex, textColor: attributeColors["Sabedoria"].hex },
    { value: "charisma", label: "Carisma", activeColor: attributeColors["Carisma"].hex, textColor: attributeColors["Carisma"].hex },
    { value: "strength", label: "Força", activeColor: attributeColors["Força"].hex, textColor: attributeColors["Força"].hex },
    { value: "dexterity", label: "Destreza", activeColor: attributeColors["Destreza"].hex, textColor: attributeColors["Destreza"].hex },
    { value: "constitution", label: "Constituição", activeColor: attributeColors["Constituição"].hex, textColor: attributeColors["Constituição"].hex },
]

const SLOT_LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

// ─── SpellSlotCard ────────────────────────────────────────────────────────────
interface SpellSlotCardProps {
    level: string
    total: number
    used: number
    onPatchTotal: (v: number) => void
    onPatchUsed: (v: number) => void
    isReadOnly?: boolean
}

function SpellSlotCard({ level, total, used, onPatchTotal, onPatchUsed, isReadOnly = false }: SpellSlotCardProps) {
    return (
        <div className="flex flex-col items-center gap-1.5 min-w-[56px] rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2 flex-shrink-0">
            <span className="text-[9px] font-black uppercase text-white/40">{level}º</span>

            {/* Total counter */}
            <SheetInput
                compact
                type="number"
                min={0}
                max={9}
                showControls
                value={String(total)}
                onChangeValue={(v) => onPatchTotal(parseInt(v) || 0)}
                inputClassName="text-center text-[10px] w-6"
                className="w-full"
                readOnlyMode={isReadOnly}
            />

            {/* Slot checkboxes: checked = used */}
            {total > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center">
                    {Array.from({ length: total }).map((_, i) => (
                        <GlassCheckbox
                            key={i}
                            size="sm"
                            checked={i < used}
                            onChange={() => onPatchUsed(i < used ? i : i + 1)}
                            accentColor="#7c3aed"
                            disabled={isReadOnly}
                        />
                    ))}
                </div>
            )}
            {total === 0 && (
                <span className="text-[8px] text-white/20">—</span>
            )}
        </div>
    )
}

export function SpellList({ sheet, form, isReadOnly = false }: SpellListProps) {
    const {
        spells,
        spellSlots,
        spellcastingAttribute,
        spellSaveDC,
        spellAttackBonus,
        handleAddSpell,
        handlePatchSpell,
        handleSpellNameChange,
        handleRemoveSpell,
        handlePatchSpellSlot,
        handlePatchSpellcasting,
        focusSpellId,
        clearFocusSpellId,
    } = useSpellList({ sheet, form, isReadOnly })

    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.03]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Magias</span>
                {!isReadOnly && (
                    <button
                        type="button"
                        onClick={handleAddSpell}
                        className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-white/30 hover:text-white/70 transition-colors"
                    >
                        <Plus className="w-3 h-3" /> Adicionar
                    </button>
                )}
            </div>

            {/* Spellcasting header */}
            <div className="px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-1 mb-2">
                    <Wand2 className="w-3 h-3 text-violet-400/60" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Conjuração</span>
                </div>

                {/* Attribute selector — full width */}
                <GlassSelector<string>
                    value={spellcastingAttribute ?? undefined}
                    onChange={(v) => {
                        const next = Array.isArray(v) ? v[0] : v
                        handlePatchSpellcasting(next === spellcastingAttribute ? null : next || null)
                    }}
                    options={SPELL_CASTING_OPTIONS}
                    mode="single"
                    layout="grid"
                    cols={3}
                    fullWidth
                    layoutId="spellcasting-attr"
                    className="mb-2"
                    disabled={isReadOnly}
                />

                {/* Save DC + Attack Bonus */}
                <div className="grid grid-cols-2 gap-3">
                    <CalcTooltip formula={spellSaveDC.formula} parts={spellSaveDC.parts} result={spellSaveDC.result}>
                        <div className="flex flex-col items-center gap-0.5 cursor-help">
                            <span className="text-xl font-black text-white">{spellSaveDC.value}</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">CD de Magia</span>
                        </div>
                    </CalcTooltip>

                    <CalcTooltip formula={spellAttackBonus.formula} parts={spellAttackBonus.parts} result={spellAttackBonus.result}>
                        <div className="flex flex-col items-center gap-0.5 cursor-help">
                            <span className="text-xl font-black text-white">{formatMod(spellAttackBonus.value)}</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Atq de Magia</span>
                        </div>
                    </CalcTooltip>
                </div>
            </div>

            {/* Spell Slots — horizontal row of 9 */}
            <div className="px-3 py-2 border-b border-white/10">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2 block">Espaços de Magia</span>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {SLOT_LEVELS.map((level) => {
                        const slot = spellSlots[level] ?? { total: 0, used: 0 }
                        return (
                            <SpellSlotCard
                                key={level}
                                level={level}
                                total={slot.total}
                                used={slot.used}
                                onPatchTotal={(v) => handlePatchSpellSlot(level, "total", v)}
                                onPatchUsed={(v) => handlePatchSpellSlot(level, "used", v)}
                                isReadOnly={isReadOnly}
                            />
                        )
                    })}
                </div>
            </div>

            {/* Table header */}
            {spells.length > 0 && (
                <div className="grid grid-cols-[auto_2fr_1fr_1fr_auto_auto_auto_auto] gap-1 px-3 py-1 border-b border-white/5">
                    {["Círc", "Nome", "Tempo", "Alcance", "C", "R", "M", ""].map((h) => (
                        <span key={h} className="text-[8px] font-black uppercase tracking-widest text-white/20 text-center">
                            {h}
                        </span>
                    ))}
                </div>
            )}

            {/* Spell rows */}
            <div className="divide-y divide-white/5 flex-1">
                <AnimatePresence initial={false}>
                    {spells.map((spell) => {
                        const rowKey = spell.clientKey ?? spell._id
                        return (
                        <motion.div
                            key={rowKey}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-[auto_2fr_1fr_1fr_auto_auto_auto_auto] gap-1 px-3 py-1 items-center"
                        >
                            {/* Circle */}
                            <SheetInput
                                compact
                                type="number"
                                min={0}
                                max={9}
                                value={spell.circle ?? ""}
                                onChangeValue={(v) => handlePatchSpell(spell._id, { circle: v === "" ? null : parseInt(v) || 0 })}
                                inputClassName="text-center text-xs w-7"
                                className="w-8"
                                readOnlyMode={isReadOnly}
                                allowEmptyNumber
                            />

                            {/* Name */}
                            <CompactRichInput
                                value={spell.name}
                                onChange={() => {}}
                                onBlur={(v) => handleSpellNameChange(spell._id, v)}
                                placeholder="Nome da magia"
                                excludeId={sheet._id}
                                disabled={isReadOnly}
                                focusToken={!isReadOnly && focusSpellId === rowKey ? rowKey : null}
                                onAutoFocusApplied={clearFocusSpellId}
                            />

                            {/* Casting time */}
                            <CompactRichInput
                                value={spell.castingTime ?? ""}
                                onChange={() => {}}
                                onBlur={(v) => handlePatchSpell(spell._id, { castingTime: v })}
                                placeholder="ação"
                                excludeId={sheet._id}
                                disabled={isReadOnly}
                            />

                            {/* Range */}
                            <CompactRichInput
                                value={spell.range ?? ""}
                                onChange={() => {}}
                                onBlur={(v) => handlePatchSpell(spell._id, { range: v })}
                                placeholder="18 m"
                                excludeId={sheet._id}
                                disabled={isReadOnly}
                            />

                            {/* Concentration */}
                            <PointerTooltip content="Concentração">
                                <GlassCheckbox
                                    checked={!!spell.concentration}
                                    onChange={(v) => handlePatchSpell(spell._id, { concentration: v })}
                                    accentColor="#7c3aed"
                                    disabled={isReadOnly}
                                />
                            </PointerTooltip>

                            {/* Ritual */}
                            <PointerTooltip content="Ritual">
                                <GlassCheckbox
                                    checked={!!spell.ritual}
                                    onChange={(v) => handlePatchSpell(spell._id, { ritual: v })}
                                    accentColor="#0369a1"
                                    disabled={isReadOnly}
                                />
                            </PointerTooltip>

                            {/* Material */}
                            <PointerTooltip content="Material">
                                <GlassCheckbox
                                    checked={!!spell.material}
                                    onChange={(v) => handlePatchSpell(spell._id, { material: v })}
                                    accentColor="#b45309"
                                    disabled={isReadOnly}
                                />
                            </PointerTooltip>

                            {/* Delete */}
                            {!isReadOnly && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveSpell(spell._id)}
                                    className="text-red-400/20 hover:text-red-400 transition-colors flex-shrink-0 flex items-center justify-center"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </motion.div>
                    )})}
                </AnimatePresence>
            </div>

            {/* Empty state */}
            {spells.length === 0 && (
                <div className="px-3 py-6 flex flex-col items-center gap-2 text-white/20">
                    <span className="text-[10px] font-semibold">Nenhuma magia ainda</span>
                    {!isReadOnly && (
                        <button
                            type="button"
                            onClick={handleAddSpell}
                            className="flex items-center gap-1.5 py-1.5 px-3 border border-dashed border-white/10 rounded text-[9px] font-bold uppercase tracking-wider hover:border-white/20 hover:text-white/40 transition-all"
                        >
                            <Plus className="w-3 h-3" /> Adicionar magia
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
