/**
 * @fileoverview Items table component for data-heavy view mode.
 */

"use client";

import * as React from "react"
import { motion } from "framer-motion"
import { Backpack, MoreHorizontal, Pencil, Trash2, Shield, Sword, Hammer, Package, Coins, Anchor } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { GlassLevelChip } from "@/components/ui/glass-level-chip"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { GlassDropdownMenu, GlassDropdownMenuTrigger, GlassDropdownMenuContent, GlassDropdownMenuItem } from "@/components/ui/glass-dropdown-menu"
import { cn } from "@/core/utils"
import type { Item, ItemType } from "../types/items.types"

const TYPE_ICONS: Record<ItemType, any> = {
    arma: Sword,
    armadura: Shield,
    escudo: Shield,
    ferramenta: Hammer,
    consumível: Package,
    munição: Anchor,
    qualquer: Backpack,
}

interface ItemsTableProps {
    items: Item[]
    onEdit?: (item: Item) => void
    onDelete?: (item: Item) => void
    isAdmin?: boolean
}

export function ItemsTable({ items, onEdit, onDelete, isAdmin }: ItemsTableProps) {
    if (items.length === 0) return null

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                    <tr className="border-b border-white/5">
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Item</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Tipo</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Raridade</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Custo</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Dano/CA</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {items.map((item) => (
                        <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-1.5 rounded-md border bg-white/[0.03]",
                                        item.status === 'inactive' ? "border-white/5 opacity-50" : "border-white/10"
                                    )}>
                                        {React.createElement(TYPE_ICONS[item.type] || Backpack, {
                                            className: "h-3.5 w-3.5 text-slate-400"
                                        })}
                                    </div>
                                    <div>
                                        <span className={cn(
                                            "text-sm font-medium block",
                                            item.status === 'inactive' ? "text-white/30" : "text-white/80"
                                        )}>
                                            {item.name}
                                        </span>
                                        <span className="text-[10px] text-white/20 font-mono tracking-tighter truncate max-w-[150px] block">
                                            {item.source}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <span className="text-xs text-white/40 capitalize">{item.type}</span>
                            </td>
                            <td className="px-4 py-3">
                                <GlassLevelChip level={item.rarity} type="rarity" size="sm" />
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                    <Coins className="h-3 w-3 text-amber-400/40" />
                                    <span className="text-xs text-white/40">{item.price || "—"}</span>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                    {item.type === "arma" && item.damageDice && (
                                        <div className="flex items-center gap-1.5">
                                            <GlassDiceValue value={item.damageDice as any} />
                                            <span className="text-[10px] text-white/20">{item.damageType}</span>
                                        </div>
                                    )}
                                    {item.type === "armadura" && item.ac && (
                                        <span className="text-xs text-white/40">CA {item.ac} ({item.armorType})</span>
                                    )}
                                    {item.type === "escudo" && item.acBonus && (
                                        <span className="text-xs text-white/40">CA +{item.acBonus}</span>
                                    )}
                                    {(!item.damageDice && !item.ac && !item.acBonus) && (
                                        <span className="text-xs text-white/20 italic">—</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isAdmin && (
                                        <GlassDropdownMenu>
                                            <GlassDropdownMenuTrigger asChild>
                                                <motion.button
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </motion.button>
                                            </GlassDropdownMenuTrigger>
                                            <GlassDropdownMenuContent align="end">
                                                <GlassDropdownMenuItem onClick={() => onEdit?.(item)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </GlassDropdownMenuItem>
                                                <GlassDropdownMenuItem
                                                    onClick={() => onDelete?.(item)}
                                                    className="text-red-400 focus:text-red-400"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Excluir
                                                </GlassDropdownMenuItem>
                                            </GlassDropdownMenuContent>
                                        </GlassDropdownMenu>
                                    )}
                                    <Chip variant={item.status === "active" ? "uncommon" : "common"} size="sm">
                                        {item.status === "active" ? "Ativo" : "Inativo"}
                                    </Chip>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
