"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Coins } from "lucide-react"
import { cn } from "@/core/utils"
import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import { useItemList } from "./hooks/use-item-list"
import type { CharacterSheet } from "../types/character-sheet.types"

interface ItemListProps {
    sheet: CharacterSheet
    form: {
        watch: (field?: string) => any
        patchField: (field: string, value: unknown) => void
    }
}

const COIN_LABELS: Array<{ key: "cp" | "sp" | "ep" | "gp" | "pp"; label: string; color: string }> = [
    { key: "cp", label: "PC", color: "text-orange-300" },
    { key: "sp", label: "PP", color: "text-slate-300" },
    { key: "ep", label: "PE", color: "text-slate-200" },
    { key: "gp", label: "PO", color: "text-yellow-300" },
    { key: "pp", label: "PL", color: "text-violet-300" },
]

export function ItemList({ sheet, form }: ItemListProps) {
    const { watch } = form
    const currentValues = watch()
    const coins = currentValues.coins ?? sheet.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }

    const { items, handleAddItem, handlePatchItem, handleRemoveItem, handlePatchCoins } = useItemList({ sheet, form })

    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.03]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Itens e Equipamentos</span>
                <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-white/30 hover:text-white/70 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Adicionar
                </button>
            </div>

            {/* Moedas */}
            <div className="px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-1 mb-1.5">
                    <Coins className="w-3 h-3 text-yellow-400/60" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Moedas</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                    {COIN_LABELS.map(({ key, label, color }) => (
                        <div key={key} className="flex flex-col items-center">
                            <SheetInput
                                type="number"
                                min={0}
                                compact
                                showControls
                                value={String(coins[key] ?? 0)}
                                onChangeValue={(v) => handlePatchCoins(key, parseInt(v) || 0)}
                                inputClassName={cn("text-center text-xs font-bold", color)}
                                className="items-center"
                            />
                            <span className={cn("text-[8px] font-black uppercase tracking-widest mt-0.5", color)}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Table header */}
            {items.length > 0 && (
                <div className="grid grid-cols-[2fr_1fr_auto] gap-1 px-3 py-1 border-b border-white/5">
                    {["Nome", "Qtd", ""].map((h) => (
                        <span key={h} className="text-[8px] font-black uppercase tracking-widest text-white/20 text-center">
                            {h}
                        </span>
                    ))}
                </div>
            )}

            {/* Item rows */}
            <div className="divide-y divide-white/5 flex-1">
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <motion.div
                            key={item._id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-[2fr_1fr_auto] gap-1 px-3 py-1 items-center"
                        >
                            <CompactRichInput
                                value={item.name}
                                onChange={(v) => handlePatchItem(item._id, { name: v || "Item" })}
                                placeholder="Nome do item"
                                debounceMs={800}
                                excludeId={sheet._id}
                            />
                            <SheetInput
                                compact
                                type="number"
                                min={0}
                                showControls
                                value={String(item.quantity)}
                                onChangeValue={(v) => handlePatchItem(item._id, { quantity: parseInt(v) || 0 })}
                                inputClassName="text-center text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(item._id)}
                                className="text-red-400/20 hover:text-red-400 transition-colors mt-1 flex-shrink-0"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Empty state */}
            {items.length === 0 && (
                <div className="px-3 py-6 flex flex-col items-center gap-2 text-white/20">
                    <span className="text-[10px] font-semibold">Nenhum item ainda</span>
                    <button
                        type="button"
                        onClick={handleAddItem}
                        className="flex items-center gap-1.5 py-1.5 px-3 border border-dashed border-white/10 rounded text-[9px] font-bold uppercase tracking-wider hover:border-white/20 hover:text-white/40 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Adicionar item
                    </button>
                </div>
            )}
        </div>
    )
}
