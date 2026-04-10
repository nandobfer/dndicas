/**
 * @fileoverview Item preview component for tooltip/popover display.
 * Shows item details including rarity, type, weight, price and description.
 */

"use client";

import { Backpack, Info, ExternalLink, Shield, Sword, Hammer, Package, Coins, Anchor, Zap, Wand2, Sparkles, Scale, FlaskConical, Dices } from "lucide-react"
import { motion } from "framer-motion"
import { useWindows } from "@/core/context/window-context"
import { GlassLevelChip } from "@/components/ui/glass-level-chip"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { GlassImage } from "@/components/ui/glass-image"
import { Chip } from "@/components/ui/chip"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { entityColors, getItemRarityVariant, rarityToTailwind, rarityColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { Item, ItemType } from "../types/items.types"
import { EntitySource } from "@/features/rules/components/entity-source"
import { MentionRenderer } from "@/features/classes/components/mention-renderer"
import { WeaponPreview } from "./weapon-preview"
import { ArmorPreview } from "./armor-preview"
import { ToolPreview } from "./tool-preview"

const TYPE_ICONS: Record<ItemType, any> = {
    arma: Sword,
    armadura: Shield,
    escudo: Shield,
    ferramenta: Hammer,
    consumível: FlaskConical,
    munição: Anchor,
    qualquer: Backpack,
}

export interface ItemPreviewProps {
    /** Item data to display */
    item: Item
    /** Whether to show the status chip */
    showStatus?: boolean
    /** Whether to hide only the status chip while keeping action icons */
    hideStatusChip?: boolean
    /** Whether to hide action icons (like open in window) */
    hideActionIcons?: boolean
}

/**
 * Item Preview Component
 *
 * Displays item details in a preview card format.
 * Used in tooltips, popovers, and modals.
 */
export function ItemPreview({ item, showStatus = true, hideStatusChip = false, hideActionIcons = false }: ItemPreviewProps) {
    const { addWindow } = useWindows()
    const type = (item as any).itemType || item.type
    const TypeIcon = TYPE_ICONS[type as ItemType] || Backpack

    return (
        <div className="space-y-4 w-full text-left">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Item.badge, entityColors.Item.border)}>
                        <TypeIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={item.name} entityType="Item" className="text-base font-bold" style={{ color: rarityColors[getItemRarityVariant(item.rarity)] }} />
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">
                            {type} {item.rarity}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!hideActionIcons && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                                addWindow({
                                    title: item.name || "Item",
                                    content: null,
                                    item: item,
                                    entityType: "Item",
                                })
                            }
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Abrir em nova janela"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </motion.button>
                    )}
                    {showStatus && !hideStatusChip && item.status === "inactive" && (
                        <Chip variant="common" size="sm" className="opacity-50">
                            Inativo
                        </Chip>
                    )}
                </div>
            </div>

            {/* Quick Stats & Properties */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center py-2">
                {/* Price */}
                {item.price && (
                    <div className="flex items-center gap-2">
                        <Coins className="h-3 w-3 text-white/40" />
                        <span className="text-xs text-white/50">Preço:</span>
                        <span className="text-xs text-white/80 font-medium">{item.price}</span>
                    </div>
                )}

                {/* Magic Item */}
                <div className="flex items-center gap-2">
                    <Wand2 className="h-3 w-3 text-white/40" />
                    <span className="text-xs text-white/50">Mágico:</span>
                    <div
                        className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/5",
                            item.isMagic ? "bg-blue-400/20 text-blue-400 border-blue-400/20" : "bg-white/5 text-white/40",
                        )}
                    >
                        {item.isMagic ? "Sim" : "Não"}
                    </div>
                </div>
            </div>

            {/* Specialized Previews baseados no tipo */}
            <div>
                <WeaponPreview item={item} />
                <ArmorPreview item={item} />
                <ToolPreview item={item} />
            </div>

            {/* Visual Header com Descrição e Imagem */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Info className="h-3 w-3" />
                        <span>Descrição</span>
                    </div>
                    <div className="text-sm text-white/80 leading-relaxed break-words">
                        <MentionContent html={item.description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm [&_p]:leading-relaxed" />
                    </div>
                </div>
                {item.image && (
                    <div className="w-full md:w-[30%] shrink-0">
                        <GlassImage src={item.image} alt={item.name} />
                    </div>
                )}
            </div>

            {/* traits List (Parity with Class Preview) */}
            {item.traits && item.traits.length > 0 && (
                <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Zap className="h-3 w-3" />
                        <span>Habilidades & Traços</span>
                    </div>
                    <div className="grid gap-3">
                        {(item.traits as any[])
                            .filter((trait) => trait && (trait.name || trait.description))
                            .map((trait, idx) => (
                                <MentionRenderer key={trait._id || `item-trait-${idx}`} item={trait} />
                            ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="pt-2">
                <EntitySource source={item.source} originalName={item.originalName} />
            </div>
        </div>
    )
}
