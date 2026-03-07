/**
 * @fileoverview Race preview component for tooltip/popover display.
 * Shows race details including traits, spells, and variations.
 */

"use client";

import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Fingerprint, Move, Zap, Wand, Info, ChevronRight, Users, Sparkles, Link } from "lucide-react"
import { cn } from "@/core/utils"
import { EntityTitleLink, MentionContent } from "@/features/rules/components/mention-badge"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { EntitySource } from "@/features/rules/components/entity-source"
import { Chip } from "@/components/ui/chip"
import { MentionRenderer } from "@/features/classes/components/mention-renderer"

import { Race, RaceVariation, RaceTrait, SizeCategory } from "../types/races.types"
import { sizeColors, entityColors, rarityColors } from "@/lib/config/colors"

// --- Sub-components (Mirrored from ClassPreview) ---

function RaceVisualHeader({ image, name, description, color }: { image?: string; name: string; description: string; color?: string }) {
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

export interface RacePreviewProps {
    race: Race
    showStatus?: boolean
}

export function RacePreview({ race, showStatus = true }: RacePreviewProps) {
    const [levelFilter, setLevelFilter] = useState<number | undefined>(undefined)
    const [filterMode, setFilterMode] = useState<"upTo" | "exact">("upTo")
    const [selectedVariationIds, setSelectedVariationIds] = useState<string[]>([])
    const [isFeaturesOpen, setIsFeaturesOpen] = useState(false)

    const variations = race.variations || []

    const selectedVariations = useMemo(() => {
        return variations.filter((v) => selectedVariationIds.includes(v._id || v.name))
    }, [variations, selectedVariationIds])

    // Combines traits AND spells into a chronological list (by level)
    const filteredFeaturesByLevel = useMemo(() => {
        let features: any[] = []

        // 1. Base Traits
        if (race.traits) {
            features = [...features, ...race.traits.map(t => ({ ...t, featureType: "trait" }))]
        }

        // 2. Base Spells
        if (race.spells) {
            features = [...features, ...race.spells.map(s => ({ ...s, level: s.level || 1, featureType: "spell" }))]
        }

        // 3. Variation Features
        selectedVariations.forEach((variation) => {
            if (variation.traits) {
                features = [
                    ...features,
                    ...variation.traits.map((t) => ({
                        ...t,
                        variationColor: variation.color,
                        variationName: variation.name,
                        featureType: "trait"
                    })),
                ]
            }
            if (variation.spells) {
                features = [
                    ...features,
                    ...variation.spells.map((s) => ({
                        ...s,
                        level: s.level || 1,
                        variationColor: variation.color,
                        variationName: variation.name,
                        featureType: "spell"
                    })),
                ]
            }
        })

        // Sort by level
        features.sort((a, b) => a.level - b.level)

        // Filter
        let filtered = features
        if (levelFilter !== undefined) {
            filtered = filterMode === "exact" 
                ? features.filter((f) => f.level === levelFilter) 
                : features.filter((f) => f.level <= levelFilter)
        }

        // Group by level
        const groups: Record<number, any[]> = {}
        filtered.forEach((f) => {
            if (!groups[f.level]) groups[f.level] = []
            groups[f.level].push(f)
        })

        return Object.entries(groups)
            .map(([level, items]) => ({ level: parseInt(level), items }))
            .sort((a, b) => a.level - b.level)
    }, [race.traits, race.spells, selectedVariations, levelFilter, filterMode])

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

    const currentSize = race.size;
    const currentSpeed = race.speed;

    return (
        <div className="space-y-4 w-full text-left">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Raça.badge, entityColors.Raça.border)}>
                        <Fingerprint className={cn("h-4 w-4", entityColors.Raça.text)} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={race.name} entityType="Raça" />
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Raça D&D 5e</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {showStatus && race.status === "inactive" && (
                        <Chip variant="common" size="sm" className="opacity-50">
                            Inativa
                        </Chip>
                    )}
                </div>
            </div>

            {/* Base Physical Attributes Bar */}
            <div className="grid grid-cols-2 gap-4 pb-2 border-b border-white/5">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Move className="h-3 w-3" />
                        <span>Tamanho</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            sizeColors[currentSize as SizeCategory]?.bgAlpha || "bg-white/5 border-white/10 text-white/60",
                            sizeColors[currentSize as SizeCategory]?.text || "text-white/60"
                        )}>
                            {currentSize}
                        </span>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Zap className="h-3 w-3" />
                        <span>Deslocamento</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/90">
                            {currentSpeed}
                        </span>
                    </div>
                </div>
            </div>

            <RaceVisualHeader name={race.name} description={race.description} image={race.image} />

            {/* Variations Selection */}
            {variations.length > 0 && (
                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            <Users className="h-3 w-3" />
                            <span>Variações (Sub-raças)</span>
                        </div>
                        <GlassSelector
                            value={selectedVariationIds}
                            onChange={(val) => setSelectedVariationIds(val as string[])}
                            options={variations.map((v) => ({
                                value: v._id || v.name,
                                label: v.name,
                                activeColor: v.color, 
                                textColor: v.color,
                            }))}
                            fullWidth
                            mode="multi"
                            layout="grid"
                            cols={1}
                            smCols={3}
                            layoutId={`race-variation-selector-${race._id}`}
                        />
                    </div>

                    <AnimatePresence>
                        {selectedVariations.map((variation) => (
                            <motion.div
                                key={variation._id || variation.name}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-3 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                                style={{ borderColor: variation.color ? `${variation.color}20` : undefined }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: variation.color }} />
                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: variation.color }}>
                                            {variation.name}
                                        </span>
                                    </div>
                                    {variation.source && (
                                        <div className="flex items-center gap-1 text-[9px] text-white/20">
                                            <Link className="h-2.5 w-2.5" />
                                            {variation.source}
                                        </div>
                                    )}
                                </div>

                                {(variation.size || variation.speed) && (
                                    <div 
                                        className="grid grid-cols-2 gap-4 p-2.5 rounded-xl border transition-all duration-300"
                                        style={{ 
                                            borderColor: variation.color ? `${variation.color}40` : "rgba(255,255,255,0.1)",
                                            backgroundColor: variation.color ? `${variation.color}05` : "rgba(255,255,255,0.02)"
                                        }}
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: variation.color || "rgba(255,255,255,0.4)" }}>
                                                <Move className="h-3 w-3" />
                                                <span>Tamanho</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                                    sizeColors[(variation.size || race.size) as SizeCategory]?.bgAlpha || "bg-white/5 border-white/10 text-white/60",
                                                    sizeColors[(variation.size || race.size) as SizeCategory]?.text || "text-white/60"
                                                )}>
                                                    {variation.size || race.size}
                                                </span>
                                                {variation.size && (
                                                    <span className="text-[9px] text-white/20 italic">(específico)</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: variation.color || "rgba(255,255,255,0.4)" }}>
                                                <Zap className="h-3 w-3" />
                                                <span>Deslocamento</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-white/90">
                                                    {variation.speed || race.speed}
                                                </span>
                                                {variation.speed && (
                                                    <span className="text-[9px] text-white/20 italic">(específico)</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <RaceVisualHeader 
                                    name={variation.name} 
                                    description={variation.description || ""} 
                                    image={variation.image} 
                                    color={variation.color} 
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Unified Chronological Features List */}
            <div
                className="rounded-xl overflow-hidden border transition-all"
                style={{
                    borderColor: "rgba(100, 116, 139, 0.2)",
                    backgroundColor: "rgba(100, 116, 139, 0.05)",
                }}
            >
                <button
                    onClick={() => setIsFeaturesOpen(!isFeaturesOpen)}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-white/[0.02] transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="p-1 px-1.5 rounded-lg border"
                            style={{
                                backgroundColor: "rgba(251, 191, 36, 0.15)",
                                borderColor: "rgba(251, 191, 36, 0.3)",
                            }}
                        >
                            <Zap className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                        <div className="text-left">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Habilidades & Magias</span>
                            <span className="text-xs font-semibold text-white/90">Por Nível</span>
                        </div>
                    </div>
                    <motion.div animate={{ rotate: isFeaturesOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronRight className="h-4 w-4 text-white/20" />
                    </motion.div>
                </button>

                <AnimatePresence>
                    {isFeaturesOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/5"
                        >
                            <div className="p-3 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
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
                                            layoutId="race-level-mode"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        {filteredFeaturesByLevel.length > 0 ? (
                                            filteredFeaturesByLevel.map((group) => (
                                                <motion.div 
                                                    key={`group-${group.level}`} 
                                                    initial={{ opacity: 0, y: 10 }} 
                                                    animate={{ opacity: 1, y: 0 }} 
                                                    exit={{ opacity: 0, scale: 0.95 }} 
                                                    className="space-y-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-px flex-1 bg-white/5" />
                                                        <span className="text-[10px] font-black text-amber-500/50 uppercase tracking-[0.2em] px-2 bg-black/20 rounded-full border border-amber-500/10">
                                                            Nível {group.level}º
                                                        </span>
                                                        <div className="h-px flex-1 bg-white/5" />
                                                    </div>

                                                    <div className="grid gap-3">
                                                        {group.items.map((item: any, idx) => (
                                                            <MentionRenderer 
                                                                key={item._id || `trait-${group.level}-${idx}`} 
                                                                item={item} 
                                                                color={item.variationColor} 
                                                            />
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
                                                Nenhuma habilidade ou magia para os filtros.
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="pt-2">
                <EntitySource source={race.source} className="pt-0 border-t-0" />
            </div>
        </div>
    )
}
