/**
 * @fileoverview Class preview component for tooltip/popover display.
 * Shows class details including hit dice, proficiencies, and description.
 */

"use client";

import { Sword, BookOpen, Info, Shield, Zap, Star, Users, GraduationCap, Filter, ChevronRight, GraduationCap as ClassIcon, Dices } from "lucide-react"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { Chip } from "@/components/ui/chip"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { entityColors, diceColors, attributeColors, DiceType } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { CharacterClass, SkillType, AttributeType } from "../types/classes.types"
import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ENTITY_RENDERERS } from "@/features/rules/components/entity-renderers"
import { MentionRenderer } from "./mention-renderer"
import { Wand } from "lucide-react"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { EntitySource } from "@/features/rules/components/entity-source"

const SKILL_TO_ATTR: Record<string, string> = {
    Atletismo: "Força",
    Acrobacia: "Destreza",
    Furtividade: "Destreza",
    Prestidigitação: "Destreza",
    Arcanismo: "Inteligência",
    História: "Inteligência",
    Investigação: "Inteligência",
    Natureza: "Inteligência",
    Religião: "Inteligência",
    "Lidar com Animais": "Sabedoria",
    Intuição: "Sabedoria",
    Medicina: "Sabedoria",
    Percepção: "Sabedoria",
    Sobrevivência: "Sabedoria",
    Enganação: "Carisma",
    Intimidação: "Carisma",
    Atuação: "Carisma",
    Persuasão: "Carisma",
}

function SpellcastingSection({ spellcasting, spellcastingAttribute, spells = [], color }: { spellcasting: boolean; spellcastingAttribute?: string; spells?: any[]; color?: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [spellSearch, setSpellSearch] = useState("")
    const [spellLevel, setSpellLevel] = useState<number | undefined>(undefined)
    const [filterMode, setFilterMode] = useState<"upTo" | "exact">("exact")

    const filteredSpells = useMemo(() => {
        return spells
            .filter((spell) => {
                const matchesSearch = !spellSearch || spell.name?.toLowerCase().includes(spellSearch.toLowerCase()) || spell.description?.toLowerCase().includes(spellSearch.toLowerCase())

                const matchesLevel = spellLevel === undefined || (filterMode === "exact" ? spell.circle === spellLevel : spell.circle <= spellLevel)

                return matchesSearch && matchesLevel
            })
            .sort((a, b) => (a.circle ?? 0) - (b.circle ?? 0) || (a.name || "").localeCompare(b.name || ""))
    }, [spells, spellSearch, spellLevel, filterMode])

    if (!spellcasting) return null

    return (
        <div
            className="rounded-xl overflow-hidden border transition-all"
            style={{
                borderColor: color ? `${color}20` : "rgba(255,255,255,0.1)",
                backgroundColor: color ? `${color}05` : "rgba(255,255,255,0.02)",
            }}
        >
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-2.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                    <div
                        className="p-1 px-1.5 rounded-lg border"
                        style={{
                            backgroundColor: color ? `${color}15` : "rgba(59,130,246,0.1)",
                            borderColor: color ? `${color}30` : "rgba(59,130,246,0.2)",
                        }}
                    >
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
                                <div className="flex items-center gap-1.5">
                                    <GlassInput
                                        type="text"
                                        inputMode="numeric"
                                        value={spellLevel !== undefined ? String(spellLevel) : ""}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "")
                                            setSpellLevel(val === "" ? undefined : Math.min(9, parseInt(val)))
                                        }}
                                        placeholder="Círculo"
                                        className="w-auto px-2 h-8 text-center text-xs"
                                        containerClassName="w-auto"
                                    />
                                    <GlassSelector
                                        value={filterMode}
                                        onChange={(val) => setFilterMode(val as "exact" | "upTo")}
                                        options={[
                                            { value: "exact", label: "=", activeColor: color || "bg-blue-500/20", textColor: color ? "white" : "text-blue-400" },
                                            { value: "upTo", label: "≤", activeColor: color || "bg-blue-500/20", textColor: color ? "white" : "text-blue-400" },
                                        ]}
                                        className="h-8"
                                        layoutId={color ? `spell-level-mode-${color}` : "spell-level-mode-main"}
                                    />
                                </div>
                            </div>

                            <AnimatePresence mode="popLayout" initial={false}>
                                {filteredSpells.length > 0 ? (
                                    <motion.div key="spell-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                                        {filteredSpells.map((spell, idx) => (
                                            <motion.div
                                                key={spell._id || spell.id || `spell-${idx}`}
                                                layout
                                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.98, y: -10 }}
                                                transition={{
                                                    duration: 0.2,
                                                    delay: Math.min(idx * 0.03, 0.3), // Staggered entry
                                                }}
                                            >
                                                <MentionRenderer item={spell} color={color} hideStatusChip icon={<Wand className="h-3 w-3" style={{ color: color || "#60a5fa" }} />} />
                                            </motion.div>
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
                                        <Wand className="h-5 w-5 text-white/10" />
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

function ClassVisualHeader({ image, name, description, color }: { image?: string; name: string; description: string; color?: string }) {
    return (
        <div
            className="flex flex-col md:flex-row gap-4 py-3 border-y border-white/5"
            style={{
                borderColor: color ? `${color}20` : undefined,
                backgroundColor: color ? `${color}05` : undefined,
            }}
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
                    <div
                        className="aspect-square rounded-xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl group/image relative"
                        style={{ borderColor: color ? `${color}40` : undefined }}
                    >
                        <img src={image} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
                    </div>
                </div>
            )}
        </div>
    )
}

export interface ClassPreviewProps {
    characterClass: CharacterClass
    showStatus?: boolean
}

export function ClassPreview({ characterClass, showStatus = true }: ClassPreviewProps) {
    const [levelFilter, setLevelFilter] = useState<number | undefined>(undefined)
    const [filterMode, setFilterMode] = useState<"upTo" | "exact">("upTo")
    const [selectedSubclassIds, setSelectedSubclassIds] = useState<string[]>([])

    const subclasses = characterClass.subclasses || []

    const selectedSubclasses = useMemo(() => {
        return subclasses.filter((s) => selectedSubclassIds.includes(s._id || s.name))
    }, [subclasses, selectedSubclassIds])

    const diceColor = diceColors[characterClass.hitDice as keyof typeof diceColors]

    const filteredTraitsByLevel = useMemo(() => {
        let traits = [...(characterClass.traits || [])]

        // Adiciona traits de todas as subclasses selecionadas
        selectedSubclasses.forEach((subclass) => {
            if (subclass.traits) {
                traits = [
                    ...traits,
                    ...subclass.traits.map((t) => ({
                        ...t,
                        subclassColor: subclass.color,
                        subclassName: subclass.name,
                    })),
                ]
            }
        })

        traits.sort((a, b) => a.level - b.level)
        let filtered = traits
        if (levelFilter !== undefined) {
            filtered = filterMode === "exact" ? traits.filter((t) => t.level === levelFilter) : traits.filter((t) => t.level <= levelFilter)
        }
        const groups: Record<number, typeof traits> = {}
        filtered.forEach((t) => {
            if (!groups[t.level]) groups[t.level] = []
            groups[t.level].push(t)
        })
        return Object.entries(groups)
            .map(([level, items]) => ({ level: parseInt(level), items }))
            .sort((a, b) => a.level - b.level)
    }, [characterClass.traits, selectedSubclasses, levelFilter, filterMode])

    const handleLevelInput = (value: string) => {
        const cleanedValue = value.replace(/\D/g, "")
        if (cleanedValue === "") setLevelFilter(undefined)
        else {
            let val = parseInt(cleanedValue, 10)
            if (val > 20) val = 20
            if (val < 1) val = 1
            setLevelFilter(val)
        }
    }

    return (
        <div className="space-y-4 w-full text-left">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Classe.badge, entityColors.Classe.border)}>
                        <Sword className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={characterClass.name} entityType="Classe" />
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Classe D&D 5e</p>
                    </div>
                </div>
                {showStatus && characterClass.status === "inactive" && (
                    <Chip variant="common" size="sm" className="opacity-50">
                        Inativa
                    </Chip>
                )}
            </div>

            <ClassVisualHeader name={characterClass.name} description={characterClass.description} image={characterClass.image} />

            <div className="grid grid-cols-3 gap-4 pb-2 border-b border-white/5">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Shield className="h-3 w-3" />
                        <span>Resistências</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(characterClass.savingThrows || []).map((attr) => (
                            <GlassAttributeChip key={attr} attribute={attr} size="sm" showFull />
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Star className="h-3 w-3" />
                        <span>Atributos Primários</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(characterClass.primaryAttributes || []).map((attr) => (
                            <GlassAttributeChip key={attr} attribute={attr} size="sm" showFull />
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Dices className="h-3 w-3" />
                        <span>Dado de Vida</span>
                    </div>
                    <div className="flex items-center mt-1">
                        <GlassDiceValue value={{ quantidade: 1, tipo: characterClass.hitDice as DiceType }} />
                    </div>
                </div>
            </div>

            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Sword className="h-3 w-3" />
                    <span>Proficiências & Perícias</span>
                </div>
                <div className="grid gap-1.5">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/40 w-16">Armaduras:</span>
                        <div className="flex-1 flex flex-wrap gap-1">
                            {(characterClass.armorProficiencies || []).length > 0 ? (
                                (characterClass.armorProficiencies || []).map((p) => (
                                    <span key={p} className="text-white/70 italic">
                                        {p}
                                    </span>
                                ))
                            ) : (
                                <span className="text-white/20">Nenhuma</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/40 w-16">Armas:</span>
                        <div className="flex-1 text-white/70 italic truncate">
                            {(characterClass.weaponProficiencies || []).length > 0 ? <MentionContent html={(characterClass.weaponProficiencies || []).join(", ")} mode="inline" /> : "Nenhuma"}
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                        <span className="text-white/40 w-16 shrink-0 mt-1">Perícias:</span>
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 p-1 bg-black/20 rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-tighter ml-1 mr-1">Escolha {characterClass.skillCount || 0}:</span>
                            {(characterClass.availableSkills || []).map((skill) => {
                                const attr = SKILL_TO_ATTR[skill] || "Sabedoria"
                                const config = attributeColors[attr as keyof typeof attributeColors]
                                return (
                                    <span key={skill} className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border", config?.badge, config?.border)}>
                                        {skill}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {characterClass.spellcasting && (
                <SpellcastingSection spellcasting={characterClass.spellcasting} spellcastingAttribute={characterClass.spellcastingAttribute} spells={characterClass.spells} />
            )}

            {subclasses.length > 0 && (
                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            <Users className="h-3 w-3" />
                            <span>Subclasses</span>
                        </div>
                        <GlassSelector
                            value={selectedSubclassIds}
                            onChange={(val) => setSelectedSubclassIds(val as string[])}
                            options={subclasses.map((s) => ({
                                value: s._id || s.name,
                                label: s.name,
                                activeColor: s.color, // Cor Hex (ex: #facc15)
                                textColor: s.color, // Cor Hex
                            }))}
                            fullWidth
                            mode="multi"
                            layout="grid"
                            cols={3}
                            layoutId={`class-subclass-selector-${characterClass._id}`}
                        />
                    </div>

                    <AnimatePresence>
                        {selectedSubclasses.map((subclass) => (
                            <motion.div
                                key={subclass._id || subclass.name}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-3 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                                style={{ borderColor: subclass.color ? `${subclass.color}20` : undefined }}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: subclass.color }} />
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: subclass.color }}>
                                        {subclass.name}
                                    </span>
                                </div>

                                <ClassVisualHeader name={subclass.name} description={subclass.description || ""} image={subclass.image} color={subclass.color} />

                                <SpellcastingSection spellcasting={subclass.spellcasting} spellcastingAttribute={subclass.spellcastingAttribute} spells={subclass.spells} color={subclass.color} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            <div className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Zap className="h-3 w-3 text-amber-400" />
                        <span>Habilidades por Nível</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <GlassInput
                            type="text"
                            inputMode="numeric"
                            value={levelFilter !== undefined ? String(levelFilter) : ""}
                            onChange={(e) => handleLevelInput(e.target.value)}
                            placeholder="Nível"
                            className="w-14 px-2 h-8 text-center text-xs"
                            containerClassName="w-auto"
                        />
                        <GlassSelector
                            value={filterMode}
                            onChange={(val) => setFilterMode(val as "exact" | "upTo")}
                            options={[
                                { value: "exact", label: "=", activeColor: "bg-amber-500/20", textColor: "text-amber-400" },
                                { value: "upTo", label: "≤", activeColor: "bg-amber-500/20", textColor: "text-amber-400" },
                            ]}
                            size="sm"
                            className="h-8"
                            layoutId="class-level-mode"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {filteredTraitsByLevel.length > 0 ? (
                            filteredTraitsByLevel.map((group) => (
                                <motion.div key={`group-${group.level}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="h-px flex-1 bg-white/5" />
                                        <span className="text-[10px] font-black text-amber-500/50 uppercase tracking-[0.2em] px-2 bg-black/20 rounded-full border border-amber-500/10">
                                            Nível {group.level}º
                                        </span>
                                        <div className="h-px flex-1 bg-white/5" />
                                    </div>
                                    <div className="grid gap-3">
                                        {group.items.map((trait: any, idx) => (
                                            <MentionRenderer key={trait._id || `trait-${group.level}-${idx}`} item={trait} color={trait.subclassColor} />
                                        ))}
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-4 text-xs text-white/20 italic bg-white/5 rounded-lg border border-dashed border-white/10"
                            >
                                Nenhuma habilidade encontrada para os filtros.
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="pt-2">
                <EntitySource source={characterClass.source} className="pt-0 border-t-0" />
            </div>
        </div>
    )
}
