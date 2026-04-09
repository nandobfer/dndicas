"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, Info, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { GlassImage } from "@/components/ui/glass-image"
import { GlassInput } from "@/components/ui/glass-input"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { MentionRenderer } from "./mention-renderer"
import type { AttributeType, Subclass } from "../types/classes.types"

function toSlug(value: string) {
    return encodeURIComponent(value.toLowerCase().trim().replace(/\s+/g, "-"))
}

function SpellCircleAccordion({ circle, items, color }: { circle: number; items: any[]; color?: string }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="space-y-2">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center gap-2 group">
                <div className="h-px flex-1 bg-white/5 group-hover:bg-white/10 transition-colors" />
                <div
                    className="flex items-center gap-2 px-2 py-0.5 bg-black/20 rounded-full border transition-colors group-hover:bg-black/40"
                    style={{ borderColor: color ? `${color}30` : "rgba(96, 165, 250, 0.2)" }}
                >
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: color ? `${color}dd` : "rgba(96, 165, 250, 0.7)" }}>
                        {circle === 0 ? "Truques" : `${circle}º Círculo`}
                    </span>
                    <span className="text-[9px] font-bold opacity-40 px-1.5 py-0.5 bg-white/5 rounded-md border border-white/5">{items.length}</span>
                    <AnimatePresence>
                        {!isOpen && (
                            <motion.span initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }} className="text-[8px] font-bold uppercase tracking-tighter text-white/20 ml-1 italic">
                                expandir
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronRight className="h-3 w-3 text-white/20" />
                    </motion.div>
                </div>
                <div className="h-px flex-1 bg-white/5 group-hover:bg-white/10 transition-colors" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-2 py-1">
                            {items.map((spell, idx) => (
                                <motion.div
                                    key={spell._id || spell.id || `spell-${circle}-${idx}`}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98, y: -10 }}
                                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                                >
                                    <MentionRenderer
                                        item={spell}
                                        color={color}
                                        hideStatusChip
                                        icon={<Zap className="h-3 w-3" style={{ color: color || "#60a5fa" }} />}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function SpellcastingSection({ spellcasting, spellcastingAttribute, spells = [], color }: { spellcasting: boolean; spellcastingAttribute?: string; spells?: any[]; color?: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [spellSearch, setSpellSearch] = useState("")

    const filteredSpells = useMemo(() => {
        return spells
            .filter((spell) => !spellSearch || spell.name?.toLowerCase().includes(spellSearch.toLowerCase()) || spell.description?.toLowerCase().includes(spellSearch.toLowerCase()))
            .sort((a, b) => (a.circle ?? 0) - (b.circle ?? 0) || (a.name || "").localeCompare(b.name || ""))
    }, [spells, spellSearch])

    const groupedSpells = useMemo(() => {
        const groups: Record<number, any[]> = {}
        filteredSpells.forEach((spell) => {
            const circle = spell.circle ?? 0
            if (!groups[circle]) groups[circle] = []
            groups[circle].push(spell)
        })
        return Object.entries(groups).map(([circle, items]) => ({ circle: parseInt(circle, 10), items })).sort((a, b) => a.circle - b.circle)
    }, [filteredSpells])

    if (!spellcasting) return null

    return (
        <div
            className="rounded-xl overflow-hidden border transition-all"
            style={{
                borderColor: color ? `${color}20` : "rgba(100, 116, 139, 0.2)",
                backgroundColor: color ? `${color}05` : "rgba(100, 116, 139, 0.05)",
            }}
        >
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-2.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                    <div className="p-1 px-1.5 rounded-lg border" style={{ backgroundColor: color ? `${color}15` : "rgba(59,130,246,0.1)", borderColor: color ? `${color}30` : "rgba(59,130,246,0.2)" }}>
                        <Zap className="h-3.5 w-3.5" style={{ color: color || "#60a5fa" }} />
                    </div>
                    <div className="text-left">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Magias</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white/90">Habilitada</span>
                            {spellcastingAttribute && <GlassAttributeChip attribute={spellcastingAttribute as AttributeType} size="sm" />}
                        </div>
                    </div>
                </div>
                <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronRight className="h-4 w-4 text-white/20" />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5">
                        <div className="p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <GlassInput placeholder="Buscar magia..." value={spellSearch} onChange={(e) => setSpellSearch(e.target.value)} className="h-8 text-xs flex-1" />
                            </div>

                            <AnimatePresence mode="popLayout" initial={false}>
                                {groupedSpells.length > 0 ? (
                                    <motion.div key="spell-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                                        {groupedSpells.map((group) => (
                                            <SpellCircleAccordion key={group.circle} circle={group.circle} items={group.items} color={color} />
                                        ))}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="spell-empty"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="py-10 text-center bg-black/20 rounded-xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-2"
                                    >
                                        <Zap className="h-5 w-5 text-white/10" />
                                        <p className="text-xs text-white/30 italic">Nenhuma magia disponível ou encontrada.</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function SubclassVisualHeader({ image, name, description, color }: { image?: string; name: string; description: string; color?: string }) {
    return (
        <div
            className="flex flex-col md:flex-row gap-4 py-3 border-y border-white/5"
            style={{ borderColor: color ? `${color}20` : undefined, backgroundColor: color ? `${color}05` : undefined }}
        >
            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Info className="h-3 w-3" />
                    <span>Descrição</span>
                </div>
                <div className="text-sm text-white/80 leading-relaxed pr-2">
                    <MentionContent html={description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm [&_p]:leading-relaxed" />
                </div>
            </div>
            {image && (
                <div className="w-full md:w-2/5 shrink-0">
                    <GlassImage src={image} alt={name} />
                </div>
            )}
        </div>
    )
}

export interface SubclassPreviewProps {
    subclass: Subclass
    parentClassName?: string
    linkToParentClass?: boolean
}

export function SubclassPreview({ subclass, parentClassName, linkToParentClass = false }: SubclassPreviewProps) {
    const subclassKey = String(subclass._id || subclass.name)
    const href =
        linkToParentClass && parentClassName
            ? `/classes/${toSlug(parentClassName)}?subclass=${encodeURIComponent(subclassKey)}`
            : null

    return (
        <div className="space-y-3 p-3 rounded-xl bg-white/[0.02] border border-white/5" style={{ borderColor: subclass.color ? `${subclass.color}20` : undefined }}>
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: subclass.color }} />
                {href ? (
                    <Link href={href} className="text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity" style={{ color: subclass.color }}>
                        {subclass.name}
                    </Link>
                ) : (
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: subclass.color }}>
                        {subclass.name}
                    </span>
                )}
            </div>

            <SubclassVisualHeader name={subclass.name} description={subclass.description || ""} image={subclass.image} color={subclass.color} />

            <SpellcastingSection
                spellcasting={subclass.spellcasting}
                spellcastingAttribute={subclass.spellcastingAttribute}
                spells={subclass.spells}
                color={subclass.color}
            />
        </div>
    )
}
