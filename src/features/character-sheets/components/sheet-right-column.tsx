"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import type { PatchSheetBody, CharacterSheet } from "../types/character-sheet.types"
import {
    useItems,
    useAddItem,
    useRemoveItem,
    useSheetSpells,
    useAddSpell,
    useRemoveSpell,
    useTraits,
    useAddTrait,
    useRemoveTrait,
    useSheetFeats,
    useAddFeat,
    useRemoveFeat,
    usePatchSheet
} from "../api/character-sheets-queries"

interface SheetRightColumnProps {
    sheet: CharacterSheet
    form: any
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true)
    return (
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
            >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">{title}</span>
                {open ? <ChevronUp className="w-3.5 h-3.5 text-white/20" /> : <ChevronDown className="w-3.5 h-3.5 text-white/20" />}
            </button>
            {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
        </div>
    )
}

const textAreaClass =
    "w-full bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-white/10 px-3 py-2 resize-none focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all duration-200"

export function SheetRightColumn({ sheet, form }: SheetRightColumnProps) {
    const { watch, patchField } = form
    const currentValues = watch()
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const { data: items = [] } = useItems(sheet._id)
    const addItem = useAddItem(sheet._id)
    const removeItem = useRemoveItem(sheet._id)

    const { data: spells = [] } = useSheetSpells(sheet._id)
    const addSpell = useAddSpell(sheet._id)
    const removeSpell = useRemoveSpell(sheet._id)

    const { data: traits = [] } = useTraits(sheet._id)
    const addTrait = useAddTrait(sheet._id)
    const removeTrait = useRemoveTrait(sheet._id)

    const { data: feats = [] } = useSheetFeats(sheet._id)
    const addFeat = useAddFeat(sheet._id)
    const removeFeat = useRemoveFeat(sheet._id)

    const DebouncedTextArea = ({
        label,
        field,
        placeholder,
        rows = 2
    }: {
        label: string
        field: keyof PatchSheetBody
        placeholder: string
        rows?: number
    }) => {
        const [localValue, setLocalValue] = useState(currentValues[field] || "")

        // Sync with form state
        useEffect(() => {
            setLocalValue(currentValues[field] || "")
        }, [currentValues[field]])

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setLocalValue(e.target.value)
        }

        const handleBlur = () => {
            if (localValue !== currentValues[field]) {
                patchField(field, localValue)
            }
        }

        return (
            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 ml-1">{label}</label>
                    {isLoading && <div className="h-1 w-1 rounded-full bg-white/20 animate-pulse" />}
                </div>
                <textarea
                    rows={rows}
                    placeholder={placeholder}
                    className={textAreaClass}
                    value={localValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Personality */}
            <Section title="Personalidade">
                <div className="space-y-3">
                    <DebouncedTextArea label="Traços" field="personalityTraits" placeholder="Traços de personalidade..." />
                    <DebouncedTextArea label="Ideais" field="ideals" placeholder="Ideais..." />
                    <DebouncedTextArea label="Vínculos" field="bonds" placeholder="Vínculos..." />
                    <DebouncedTextArea label="Defeitos" field="flaws" placeholder="Defeitos..." />
                </div>
            </Section>

            {/* Notes */}
            <Section title="Notas">
                <DebouncedTextArea label="Anotações" field="notes" placeholder="Anotações livres..." rows={6} />
            </Section>

            {/* Traits */}
            <Section title={`Traços (${traits.length})`}>
                <div className="space-y-2">
                    {traits.map((trait) => (
                        <div
                            key={trait._id}
                            className="flex items-start justify-between gap-3 p-2 bg-white/[0.02] border border-white/5 rounded-lg group"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold text-white/70 text-xs truncate group-hover:text-white transition-colors">{trait.name}</p>
                                {trait.description && <p className="text-white/30 text-[10px] line-clamp-2 mt-0.5">{trait.description}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => removeTrait.mutate(trait._id)}
                                className="text-red-400/20 hover:text-red-400 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addTrait.mutate({ name: "Novo Traço", description: "", origin: "manual" })}
                        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Adicionar traço
                    </button>
                </div>
            </Section>

            {/* Feats */}
            <Section title={`Talentos (${feats.length})`}>
                <div className="space-y-2">
                    {feats.map((feat) => (
                        <div
                            key={feat._id}
                            className="flex items-start justify-between gap-3 p-2 bg-white/[0.02] border border-white/5 rounded-lg group"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold text-white/70 text-xs truncate group-hover:text-white transition-colors">{feat.name}</p>
                                {feat.description && <p className="text-white/30 text-[10px] line-clamp-2 mt-0.5">{feat.description}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => removeFeat.mutate(feat._id)}
                                className="text-red-400/20 hover:text-red-400 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addFeat.mutate({ name: "Novo Talento", description: "" })}
                        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Adicionar talento
                    </button>
                </div>
            </Section>

            {/* Items */}
            <Section title={`Itens (${items.length})`}>
                <div className="space-y-1">
                    {items.map((item) => (
                        <div key={item._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.02] group">
                            <div className="h-6 w-6 rounded bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <span className="text-[10px] text-white/20">?</span>
                            </div>
                            <span className="flex-1 text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">{item.name}</span>
                            <span className="text-white/20 text-[10px] font-bold">×{item.quantity}</span>
                            <button
                                type="button"
                                onClick={() => removeItem.mutate(item._id)}
                                className="text-red-400/20 hover:text-red-400 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addItem.mutate({ name: "Novo Item", quantity: 1 })}
                        className="w-full mt-2 flex items-center justify-center gap-2 py-2 border border-dashed border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Adicionar item
                    </button>
                </div>
            </Section>

            {/* Spells */}
            <Section title={`Magias (${spells.length})`}>
                <div className="space-y-2">
                    {spells.map((spell) => (
                        <div key={spell._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02] group">
                            <div className="h-6 w-6 rounded bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <span className="text-[10px] font-bold text-white/30">{spell.circle}</span>
                            </div>
                            <span className="flex-1 text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">{spell.name}</span>
                            <button
                                type="button"
                                onClick={() => removeSpell.mutate(spell._id)}
                                className="text-red-400/20 hover:text-red-400 p-1 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => addSpell.mutate({ name: "Nova Magia", circle: 1, school: "", components: [] })}
                        className="w-full mt-2 flex items-center justify-center gap-2 py-2 border border-dashed border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Adicionar magia
                    </button>
                </div>
            </Section>
        </div>
    )
}
