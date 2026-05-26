"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { MoreHorizontal, Pencil, Shield, Skull, Trash2 } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { GlassDropdownMenu, GlassDropdownMenuContent, GlassDropdownMenuItem, GlassDropdownMenuTrigger } from "@/components/ui/glass-dropdown-menu"
import { cn } from "@/core/utils"
import type { Monster } from "../types/monsters.types"
import { MONSTER_SIZE_LABELS, MONSTER_TYPE_LABELS } from "./monster-options"
import { getMonsterXp } from "../utils/monster-calculations"

export function MonstersTable({ items, onEdit, onDelete, isAdmin }: { items: Monster[]; onEdit?: (monster: Monster) => void; onDelete?: (monster: Monster) => void; isAdmin?: boolean }) {
    if (items.length === 0) return null
    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                    <tr className="border-b border-white/5">
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Monstro</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Tipo</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">CR</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">CA/PV</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Velocidade</th>
                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {items.map((monster) => (
                        <tr key={monster._id || monster.id} className="group hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-1.5 rounded-md border bg-red-500/10", monster.status === "inactive" ? "border-white/5 opacity-50" : "border-red-500/20")}>
                                        <Skull className="h-3.5 w-3.5 text-red-300" />
                                    </div>
                                    <div>
                                        <span className={cn("text-sm font-medium block", monster.status === "inactive" ? "text-white/30" : "text-white/80")}>{monster.name}</span>
                                        <span className="text-[10px] text-white/20 font-mono tracking-tighter truncate max-w-[180px] block">{monster.source}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-white/45">{MONSTER_SIZE_LABELS[monster.size]} {MONSTER_TYPE_LABELS[monster.type]}</td>
                            <td className="px-4 py-3"><span className="text-xs font-bold text-red-300">CR {monster.challengeRating}</span><div className="text-[10px] text-white/25">{getMonsterXp(monster.challengeRating, monster.experienceOverride).toLocaleString("pt-BR")} XP</div></td>
                            <td className="px-4 py-3"><div className="flex items-center gap-2 text-xs text-white/50"><Shield className="h-3 w-3" />CA {monster.armorClass} / PV {monster.hitPointsFormula}</div></td>
                            <td className="px-4 py-3 text-xs text-white/40">{monster.speed || "—"}</td>
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isAdmin && (
                                        <GlassDropdownMenu>
                                            <GlassDropdownMenuTrigger asChild>
                                                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </motion.button>
                                            </GlassDropdownMenuTrigger>
                                            <GlassDropdownMenuContent align="end">
                                                <GlassDropdownMenuItem onClick={() => onEdit?.(monster)}><Pencil className="h-4 w-4 mr-2" />Editar</GlassDropdownMenuItem>
                                                <GlassDropdownMenuItem onClick={() => onDelete?.(monster)} className="text-red-400 focus:text-red-400"><Trash2 className="h-4 w-4 mr-2" />Excluir</GlassDropdownMenuItem>
                                            </GlassDropdownMenuContent>
                                        </GlassDropdownMenu>
                                    )}
                                    <Chip variant={monster.status === "active" ? "uncommon" : "common"} size="sm">{monster.status === "active" ? "Ativo" : "Inativo"}</Chip>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
