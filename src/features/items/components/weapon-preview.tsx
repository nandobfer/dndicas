/**
 * @fileoverview Weapon specific preview components.
 * Shows damage, type, mastery and properties using MentionRenderer.
 */

"use client";

import { Dices, Zap, Sword } from "lucide-react"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { cn } from "@/core/utils"
import type { Item } from "../types/items.types"
import { getDamageColorByKey } from "@/lib/config/colors"

interface WeaponPreviewProps {
    item: Item
}

/**
 * Weapon Preview Component
 * 
 * Specifically renders weapon-related data:
 * - Damage Dice (GlassDiceValue)
 * - Damage Type (Colored Chip)
 * - Weapon Properties (MentionContent)
 * - Mastery (MentionContent)
 */
export function WeaponPreview({ item }: WeaponPreviewProps) {
    if (item.type !== "arma") return null

    // Helper to get damage color config
    const getDamageStyle = (type?: string) => {
        if (!type) return null;
        const color = getDamageColorByKey(type);
        
        // Custom physical subtype colors
        const lower = type.toLowerCase();
        let hex = color?.hex as string | undefined;
        if (lower === "cortante") hex = "#94A3B8";
        if (lower === "perfurante") hex = "#64748B";
        if (lower === "concussão") hex = "#475569";
        
        return { hex, color };
    };

    const baseStyle = getDamageStyle(item.damageType);

    return (
        <div className="space-y-4 pt-2 border-t border-white/5">
            {/* Damage & Attack Section (Inspired by SpellPreview) */}
            {(item.damageDice || (item.additionalDamage && item.additionalDamage.length > 0)) && (
                <div className="space-y-2 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Dices className="h-3 w-3" />
                        <span>Dano & Ataque</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* Base Damage */}
                        {item.damageDice && (
                            <div className="flex items-center gap-1.5">
                                <GlassDiceValue 
                                    value={item.damageDice as any} 
                                    colorOverride={baseStyle?.hex ? { text: baseStyle.hex } : undefined}
                                />
                                <span 
                                    className={cn("text-xs font-medium lowercase", baseStyle?.color?.text || "text-white/60")}
                                    style={baseStyle?.hex ? { color: baseStyle.hex } : undefined}
                                >
                                    {item.damageType}
                                </span>
                            </div>
                        )}

                        {/* Additional Damages */}
                        {item.additionalDamage?.map((extra, idx) => {
                            const extraStyle = getDamageStyle(extra.damageType);
                            return (
                                <div key={idx} className="flex items-center gap-1.5">
                                    <span className="text-xs text-white/20 font-bold">+</span>
                                    <GlassDiceValue 
                                        value={extra.damageDice as any} 
                                        colorOverride={extraStyle?.hex ? { text: extraStyle.hex } : undefined}
                                    />
                                    <span 
                                        className={cn("text-xs font-medium lowercase", extraStyle?.color?.text || "text-white/60")}
                                        style={extraStyle?.hex ? { color: extraStyle.hex } : undefined}
                                    >
                                        {extra.damageType}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Weapon Properties Section */}
            {item.properties && item.properties.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Zap className="h-3 w-3" />
                        <span>Propriedades da Arma</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-h-[1.5rem]">
                        {item.properties.map((prop, idx) => {
                            const html = typeof prop === "string" ? prop : prop.description;
                            if (!html) return null;
                            
                            return (
                                <MentionContent
                                    key={idx}
                                    html={html}
                                    mode="inline"
                                    className="leading-relaxed"
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Mastery Section (Specific layout) */}
            {item.mastery && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Sword className="h-3 w-3 text-emerald-400" />
                        <span>Maestria</span>
                    </div>
                    <div className="min-h-[1.5rem] flex items-center">
                        <MentionContent 
                            html={item.mastery} 
                            mode="inline"
                            className="leading-relaxed"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
