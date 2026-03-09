/**
 * @fileoverview Tool specific preview components.
 * Shows attribute used and category.
 */

"use client";

import { Hammer } from "lucide-react"
import { cn } from "@/core/utils"
import type { Item } from "../types/items.types"
import { attributeColors, AttributeType } from "@/lib/config/colors"

interface ToolPreviewProps {
    item: Item
}

export function ToolPreview({ item }: ToolPreviewProps) {
    if (item.type !== "ferramenta") return null

    return (
        <div className="space-y-4 pt-2 border-t border-white/5">
            {/* Tool & Proficiency Section */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Hammer className="h-3 w-3" />
                    <span>Atributos de Ferramenta</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {/* Attribute Mapping */}
                    {item.attributeUsed && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">Atributo Associado</span>
                            {(() => {
                                const attrKey = item.attributeUsed as AttributeType;
                                const config = attributeColors[attrKey];
                                if (!config) return (
                                    <div className="px-2.5 py-0.5 rounded-md text-sm font-bold border border-white/10 bg-white/5 text-white/70">
                                        {item.attributeUsed}
                                    </div>
                                );

                                return (
                                    <div className={cn(
                                        "px-2.5 py-0.5 rounded-md text-sm font-bold border transition-colors",
                                        config.bgAlpha,
                                        config.text,
                                        config.border
                                    )}>
                                        {attrKey}
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
