/**
 * @fileoverview Item preview component for tooltip/popover display.
 * Shows item details including rarity, type, weight, price and description.
 */

"use client";

import { Backpack, Info, ExternalLink, Shield, Sword, Hammer, Package, Coins, Anchor } from "lucide-react"
import { motion } from "framer-motion"
import { useWindows } from "@/core/context/window-context"
import { GlassLevelChip } from "@/components/ui/glass-level-chip"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { Chip } from "@/components/ui/chip"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { entityColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { Item, ItemType } from "../types/items.types"
import { EntitySource } from "@/features/rules/components/entity-source"

const TYPE_ICONS: Record<ItemType, any> = {
    arma: Sword,
    armadura: Shield,
    escudo: Shield,
    ferramenta: Hammer,
    consumível: Package,
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
    const TypeIcon = TYPE_ICONS[item.type] || Backpack

    return (
        <div className="space-y-4 w-full">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Item.badge, entityColors.Item.border)}>
                        <TypeIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={item.name} entityType="Item" />
                            <GlassLevelChip level={item.rarity} type="rarity" size="sm" />
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Item D&D 5e • {item.type}</p>
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
                    {showStatus && !hideStatusChip && (
                        <Chip variant={item.status === "active" ? "uncommon" : "common"} size="sm">
                            {item.status === "active" ? "Ativo" : "Inativo"}
                        </Chip>
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Price */}
                <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Coins className="h-3 w-3 text-amber-400/60" />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 text-center w-full">Preço</span>
                    </div>
                    <div className="text-center">
                        {item.price ? (
                            <span className="text-xs font-medium text-white/80">{item.price}</span>
                        ) : (
                            <GlassEmptyValue />
                        )}
                    </div>
                </div>

                {/* Specific Stats based on type */}
                {item.type === "arma" && (
                    <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Sword className="h-3 w-3 text-red-400/60" />
                            <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 text-center w-full">Dano</span>
                        </div>
                        <div className="text-center">
                            {item.damageDice ? (
                                <div className="flex items-center justify-center gap-1">
                                    <GlassDiceValue value={item.damageDice as any} />
                                    <span className="text-[10px] text-white/40">{item.damageType}</span>
                                </div>
                            ) : (
                                <GlassEmptyValue />
                            )}
                        </div>
                    </div>
                )}

                {(item.type === "armadura" || item.type === "escudo") && (
                    <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Shield className="h-3 w-3 text-blue-400/60" />
                            <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 text-center w-full">CA</span>
                        </div>
                        <div className="text-center">
                            {item.ac || item.acBonus ? (
                                <span className="text-xs font-medium text-white/80">
                                    {item.type === "armadura" ? `${item.ac} (${item.armorType})` : `+${item.acBonus}`}
                                </span>
                            ) : (
                                <GlassEmptyValue />
                            )}
                        </div>
                    </div>
                )}

                {/* Mastery or Tool Attribute */}
                <div className="bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Info className="h-3 w-3 text-emerald-400/60" />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/30 text-center w-full">
                            {item.type === "arma" ? "Maestria" : item.type === "ferramenta" ? "Atributo" : "Propriedade"}
                        </span>
                    </div>
                    <div className="text-center">
                        {item.mastery || item.attributeUsed ? (
                            <span className="text-xs font-medium text-white/80">{item.mastery || item.attributeUsed}</span>
                        ) : (
                            <GlassEmptyValue />
                        )}
                    </div>
                </div>
            </div>

            {/* Description */}
            <div className="relative group/desc">
                <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-white/5 group-hover/desc:bg-white/10 transition-colors" />
                <div className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap italic">
                    <MentionContent html={item.description} />
                </div>
            </div>

            {/* traits & Properties List */}
            {((item.traits && item.traits.length > 0) || (item.properties && item.properties.length > 0)) && (
                <div className="space-y-2">
                    <h4 className="text-[10px] uppercase font-bold tracking-widest text-white/20">Propriedades & Traços</h4>
                    <div className="grid grid-cols-1 gap-2">
                        {[...(item.properties || []), ...(item.traits || [])].map((trait, idx) => (
                            <div key={idx} className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                <span className="text-xs font-bold text-white/60 block mb-0.5">{trait.name}</span>
                                <div className="text-[11px] text-white/40 leading-snug">
                                    <MentionContent html={trait.description} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <EntitySource source={item.source} />
                <SimpleGlassTooltip content="Clique no ícone de link para abrir em tela cheia">
                    <Info className="h-3.5 w-3.5 text-white/10 cursor-help hover:text-white/20 transition-colors" />
                </SimpleGlassTooltip>
            </div>
        </div>
    )
}
