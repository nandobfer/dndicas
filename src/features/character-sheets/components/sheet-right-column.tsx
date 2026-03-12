"use client"

import { useState } from "react"
import { UseFormReturn } from "react-hook-form"
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
} from "../api/character-sheets-queries"

interface SheetRightColumnProps {
    sheet: CharacterSheet
    form: UseFormReturn<PatchSheetBody>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true)
    return (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
            >
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">{title}</span>
                {open ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
            </button>
            {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
        </div>
    )
}

const textAreaClass =
    "w-full bg-white/5 border border-white/10 rounded-md text-xs text-white placeholder:text-white/20 px-3 py-2 resize-none focus:outline-none focus:border-white/30 transition-colors"

export function SheetRightColumn({ sheet, form }: SheetRightColumnProps) {
    const { register } = form

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

    return (
        <div className="space-y-4">
            {/* Personality */}
            <Section title="Personalidade">
                <div className="space-y-2">
                    <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40">Traços</label>
                        <textarea rows={2} placeholder="Traços de personalidade..." className={textAreaClass} {...register("personalityTraits")} />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40">Ideais</label>
                        <textarea rows={2} placeholder="Ideais..." className={textAreaClass} {...register("ideals")} />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40">Vínculos</label>
                        <textarea rows={2} placeholder="Vínculos..." className={textAreaClass} {...register("bonds")} />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40">Defeitos</label>
                        <textarea rows={2} placeholder="Defeitos..." className={textAreaClass} {...register("flaws")} />
                    </div>
                </div>
            </Section>

            {/* Notes */}
            <Section title="Notas">
                <textarea rows={4} placeholder="Anotações livres..." className={textAreaClass} {...register("notes")} />
            </Section>

            {/* Traits */}
            <Section title={`Traços (${traits.length})`}>
                {traits.map((trait) => (
                    <div key={trait._id} className="flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                            <p className="font-semibold text-white/80 truncate">{trait.name}</p>
                            {trait.description && (
                                <p className="text-white/40 text-[10px] line-clamp-2">{trait.description}</p>
                            )}
                        </div>
                        <button type="button" onClick={() => removeTrait.mutate(trait._id)} className="text-red-400/50 hover:text-red-400 flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => addTrait.mutate({ name: "Novo Traço", description: "", origin: "manual" })}
                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Adicionar traço
                </button>
            </Section>

            {/* Feats */}
            <Section title={`Talentos (${feats.length})`}>
                {feats.map((feat) => (
                    <div key={feat._id} className="flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                            <p className="font-semibold text-white/80 truncate">{feat.name}</p>
                            {feat.description && (
                                <p className="text-white/40 text-[10px] line-clamp-2">{feat.description}</p>
                            )}
                        </div>
                        <button type="button" onClick={() => removeFeat.mutate(feat._id)} className="text-red-400/50 hover:text-red-400 flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => addFeat.mutate({ name: "Novo Talento", description: "" })}
                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Adicionar talento
                </button>
            </Section>

            {/* Items */}
            <Section title={`Itens (${items.length})`}>
                <div className="space-y-1">
                    {items.map((item) => (
                        <div key={item._id} className="flex items-center gap-1.5 text-xs">
                            <span className="flex-1 text-white/70 truncate">{item.name}</span>
                            <span className="text-white/30 text-[10px]">×{item.quantity}</span>
                            <button type="button" onClick={() => removeItem.mutate(item._id)} className="text-red-400/50 hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => addItem.mutate({ name: "Novo Item", quantity: 1, notes: "" })}
                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Adicionar item
                </button>
            </Section>

            {/* Spells */}
            <Section title={`Magias (${spells.length})`}>
                <div className="space-y-1">
                    {spells.map((spell) => (
                        <div key={spell._id} className="flex items-center gap-1.5 text-xs">
                            <span className="text-[9px] bg-white/10 rounded px-1 text-white/50 flex-shrink-0">C{spell.circle}</span>
                            <span className="flex-1 text-white/70 truncate">{spell.name}</span>
                            <button type="button" onClick={() => removeSpell.mutate(spell._id)} className="text-red-400/50 hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => addSpell.mutate({ name: "Nova Magia", circle: 1, school: "", components: [] })}
                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Adicionar magia
                </button>
            </Section>
        </div>
    )
}
