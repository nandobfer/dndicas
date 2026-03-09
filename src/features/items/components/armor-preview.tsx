/**
 * @fileoverview Armor specific preview components.
 * Shows AC, AC Bonus, Armor Type and Scale.
 */

"use client";

import { Shield } from "lucide-react"
import { cn } from "@/core/utils"
import type { Item } from "../types/items.types"
import { armorTypeConfig, rarityToTailwind } from "@/lib/config/colors"

interface ArmorPreviewProps {
    item: Item
}

export function ArmorPreview({ item }: ArmorPreviewProps) {
    const type = (item as any).itemType || item.type;
    if (type !== "armadura" && type !== "escudo") return null

    return (
        <div className="space-y-4 pt-2 border-t border-white/5">
            {/* Armor & Defense Section */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Shield className="h-3 w-3" />
                    <span>Atributos de Defesa</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {/* AC Value */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">
                            {item.type === "armadura" ? (item.acType === "bonus" ? "CA Bônus" : "CA Base") : "Bônus de CA"}
                        </span>
                        <div className="px-2.5 py-0.5 rounded-md text-sm font-bold border border-white/10 bg-white/5 text-white/70">
                            {item.type === "armadura" ? (item.ac ?? item.acBonus) : `+${item.acBonus ?? item.ac}`}
                        </div>
                    </div>

                    {/* Armor Type Tag */}
                    {item.armorType && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">Tipo de Armadura</span>
                            {(() => {
                                const config = armorTypeConfig[item.armorType as keyof typeof armorTypeConfig] || armorTypeConfig.nenhuma;
                                const colors = rarityToTailwind[config.color];
                                return (
                                    <div className={cn(
                                        "px-2.5 py-0.5 rounded-md text-xs font-bold border transition-colors",
                                        colors.bg,
                                        colors.text,
                                        colors.border
                                    )}>
                                        {config.label}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
