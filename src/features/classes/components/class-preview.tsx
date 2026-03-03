/**
 * @fileoverview Class preview component for tooltip/popover display.
 * Shows class details including hit dice, proficiencies, and description.
 */

"use client";

import { Sword, BookOpen, Info, Shield, Zap, Star, Users, GraduationCap, Filter, ChevronRight, GraduationCap as ClassIcon } from "lucide-react"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { Chip } from "@/components/ui/chip"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { entityColors, diceColors, attributeColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { CharacterClass, SkillType, AttributeType } from "../types/classes.types"
import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ENTITY_RENDERERS } from "@/features/rules/components/entity-renderers"

const SKILL_TO_ATTR: Record<string, string> = {
    "Atletismo": "Força",
    "Acrobacia": "Destreza", "Furtividade": "Destreza", "Prestidigitação": "Destreza",
    "Arcanismo": "Inteligência", "História": "Inteligência", "Investigação": "Inteligência", "Natureza": "Inteligência", "Religião": "Inteligência",
    "Lidar com Animais": "Sabedoria", "Intuição": "Sabedoria", "Medicina": "Sabedoria", "Percepção": "Sabedoria", "Sobrevivência": "Sabedoria",
    "Enganação": "Carisma", "Intimidação": "Carisma", "Atuação": "Carisma", "Persuasão": "Carisma"
}

function TraitMentionRenderer({ trait, color }: { trait: any; color?: string }) {
    const mention = useMemo(() => {
        if (!trait.description) return null

        const parser = new DOMParser()
        const doc = parser.parseFromString(trait.description, "text/html")
        const link = doc.querySelector('span[data-type="mention"]')

        if (link) {
            return {
                id: link.getAttribute("data-id") || "",
                type: link.getAttribute("data-entity-type") || "Regra",
            }
        }

        const match = trait.description.match(/@\[([^\]]+)\]\(([^)]+)\)/)
        if (match) {
            const parts = match[2].split(":")
            const typeMap: Record<string, string> = {
                traits: "Habilidade",
                rules: "Regra",
                feats: "Talento",
                spells: "Magia",
                classes: "Classe",
            }
            return {
                id: parts[1] || parts[0],
                type: typeMap[parts[0]] || parts[0],
            }
        }

        return null
    }, [trait.description])

    if (mention) {
        const Renderer = ENTITY_RENDERERS[mention.type]
        if (Renderer) {
            return (
                <div
                    className="rounded-xl border border-white/10 overflow-hidden group/trait transition-all"
                    style={{
                        borderColor: color ? `${color}40` : undefined,
                        backgroundColor: color ? `${color}05` : undefined
                    }}
                >
                    {mention.type === "Habilidade" ? (Renderer as any)(mention.id) : (Renderer as any)({ _id: mention.id })}
                </div>
            )
        }
    }

    return (
        <div
            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 group/trait hover:bg-white/[0.06] transition-all"
            style={{
                borderColor: color ? `${color}40` : undefined,
                backgroundColor: color ? `${color}05` : undefined
            }}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-3 w-3" style={{ color: color || "#f59e0b" }} />
                </div>
                <MentionContent html={trait.description} mode="block" className="[&_p]:text-[13px] [&_p]:text-white/80 [&_p]:leading-relaxed [&_ul]:my-1 [&_li]:text-[13px]" />
            </div>
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
            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Info className="h-3 w-3" />
                    <span>Descrição</span>
                </div>
                <div className="text-sm text-white/80 leading-relaxed max-h-[200px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    <MentionContent html={description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm [&_p]:leading-relaxed" />
                </div>
            </div>
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

    const selectedSubclasses = useMemo(() => {
        return characterClass.subclasses.filter((s) => selectedSubclassIds.includes(s._id || s.name))
    }, [characterClass.subclasses, selectedSubclassIds])

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
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase", diceColor?.bg, diceColor?.text)}>{characterClass.hitDice}</span>
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

            <div className="grid grid-cols-2 gap-4 pb-2 border-b border-white/5">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Shield className="h-3 w-3" />
                        <span>Resistências</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {characterClass.savingThrows.map((attr) => (
                            <GlassAttributeChip key={attr} attribute={attr} size="sm" />
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Star className="h-3 w-3" />
                        <span>Primários</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {characterClass.primaryAttributes.map((attr) => (
                            <GlassAttributeChip key={attr} attribute={attr} size="sm" />
                        ))}
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
                            {characterClass.armorProficiencies.length > 0 ? (
                                characterClass.armorProficiencies.map((p) => (
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
                            {characterClass.weaponProficiencies.length > 0 ? <MentionContent html={characterClass.weaponProficiencies.join(", ")} mode="inline" /> : "Nenhuma"}
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                        <span className="text-white/40 w-16 shrink-0 mt-1">Perícias:</span>
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 p-1 bg-black/20 rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-tighter ml-1 mr-1">Escolha {characterClass.skillCount}:</span>
                            {characterClass.availableSkills.map((skill) => {
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

            {characterClass.spellcasting !== "Nenhum" && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1 px-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Zap className="h-3 w-3 text-blue-400" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Atributo de Conjuração</span>
                            <span className="text-xs font-semibold text-white/90">{characterClass.spellcasting}</span>
                        </div>
                    </div>
                </div>
            )}

            {characterClass.subclasses.length > 0 && (
                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            <Users className="h-3 w-3" />
                            <span>Subclasses</span>
                        </div>
                        <GlassSelector
                            value={selectedSubclassIds}
                            onChange={(val) => setSelectedSubclassIds(val as string[])}
                            options={characterClass.subclasses.map((s) => ({
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

                                {subclass.spellcasting !== "Nenhum" && (
                                    <div
                                        className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between"
                                        style={{ borderColor: subclass.color ? `${subclass.color}20` : undefined }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Zap className="h-3 w-3" style={{ color: subclass.color }} />
                                            <div>
                                                <span className="text-[9px] font-bold text-white/40 uppercase block">Magias da Subclasse</span>
                                                <span className="text-[11px] font-medium text-white/80">{subclass.spellcasting}</span>
                                            </div>
                                        </div>
                                        {subclass.spellcastingAttribute && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-white/40 uppercase font-medium">Atributo:</span>
                                                <GlassAttributeChip attribute={subclass.spellcastingAttribute as AttributeType} size="sm" />
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                            <TraitMentionRenderer key={trait._id || `trait-${group.level}-${idx}`} trait={trait} color={trait.subclassColor} />
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

            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-white/40">
                    <Users className="h-3 w-3" />
                    <span>{characterClass.subclasses.length} Subclasses</span>
                </div>
                {characterClass.source && (
                    <div className="flex items-center gap-1.5 text-[10px] text-white/20">
                        <BookOpen className="h-3 w-3" />
                        <span>{characterClass.source}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
