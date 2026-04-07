/**
 * @fileoverview Background calculation and lookup filters.
 */

"use client";

import * as React from "react"
import { ChevronDown, Check, Sparkles } from "lucide-react"
import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { useAuth } from "@/core/hooks/useAuth"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { cn } from "@/core/utils"
import { attributeColors, type AttributeType } from "@/lib/config/colors"
import { useFeats } from "@/features/feats/hooks/useFeats"

// ── Constants ────────────────────────────────────────────────────────────────

type SkillType = string

const SKILL_MAP: Record<AttributeType, SkillType[]> = {
    Força: ["Atletismo"],
    Destreza: ["Acrobacia", "Furtividade", "Prestidigitação"],
    Constituição: [],
    Inteligência: ["Arcanismo", "História", "Investigação", "Natureza", "Religião"],
    Sabedoria: ["Lidar com Animais", "Intuição", "Medicina", "Percepção", "Sobrevivência"],
    Carisma: ["Atuação", "Enganação", "Intimidação", "Persuasão"],
}

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key,
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

// ── Props ────────────────────────────────────────────────────────────────────

export interface BackgroundFiltersProps {
    filters: {
        search: string
        status?: string
        suggestedAttributes?: string[]
        skillProficiencies?: string[]
        featIds?: string[]
    }
    onSearchChange: (search: string) => void
    onStatusChange?: (status: any) => void
    onAttributesChange?: (attrs: string[]) => void
    onSkillsChange?: (skills: string[]) => void
    onFeatsChange?: (ids: string[]) => void
    isSearching?: boolean
    className?: string
}

// ── Origin Feats Popover ──────────────────────────────────────────────────────

function OriginFeatFilterPopover({
    value,
    onChange,
}: {
    value: string[]
    onChange: (ids: string[]) => void
}) {
    const [search, setSearch] = React.useState("")
    const { data } = useFeats({ categories: ["Origem"], status: "active", limit: 100 })
    const feats = data?.items ?? []

    const filtered = search.trim()
        ? feats.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
        : feats

    const toggle = (id: string) => {
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
    }

    const count = value.length

    return (
        <GlassPopover>
            <GlassPopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        "bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80",
                        count > 0 && "border-white/20 text-white/80",
                    )}
                >
                    <Sparkles className="h-3 w-3" />
                    Talentos de Origem
                    {count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/15 text-white/90 text-[10px] font-bold">
                            {count}
                        </span>
                    )}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
            </GlassPopoverTrigger>
            <GlassPopoverContent className="w-72 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Talentos de Origem</p>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar talento..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-colors"
                />
                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                    {filtered.length === 0 ? (
                        <p className="text-[11px] text-white/30 text-center py-3">
                            {feats.length === 0 ? "Carregando..." : "Nenhum talento encontrado"}
                        </p>
                    ) : (
                        filtered.map((feat) => {
                            const selected = value.includes(feat._id)
                            return (
                                <button
                                    key={feat._id}
                                    type="button"
                                    onClick={() => toggle(feat._id)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left",
                                        selected
                                            ? "bg-amber-500/15 text-amber-300/90"
                                            : "text-white/60 hover:bg-white/5 hover:text-white/80",
                                    )}
                                >
                                    <div className={cn(
                                        "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                        selected ? "bg-amber-500/30 border-amber-500/50" : "border-white/15",
                                    )}>
                                        {selected && <Check className="h-2.5 w-2.5 text-amber-400" />}
                                    </div>
                                    <span className="truncate">{feat.name}</span>
                                </button>
                            )
                        })
                    )}
                </div>
                {count > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="w-full text-center text-[10px] text-white/30 hover:text-white/60 transition-colors pt-1"
                    >
                        Limpar seleção
                    </button>
                )}
            </GlassPopoverContent>
        </GlassPopover>
    )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BackgroundFilters({
    filters,
    onSearchChange,
    onStatusChange,
    onAttributesChange,
    onSkillsChange,
    onFeatsChange,
    isSearching = false,
    className,
}: BackgroundFiltersProps) {
    const { isAdmin } = useAuth()
    const isMobile = useIsMobile()

    const selectedSkills = filters.skillProficiencies || []

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Row 1: Search + Status + Origin Feats */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex-1 w-full lg:max-w-sm">
                    <SearchInput
                        value={filters.search || ""}
                        onChange={onSearchChange}
                        isLoading={isSearching}
                        placeholder="Buscar origens por nome, descrição ou fonte..."
                    />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 shrink-0">
                        <span className={cn("text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap", isMobile && "hidden")}>
                            Talento de Origem:
                        </span>
                        <OriginFeatFilterPopover
                            value={filters.featIds || []}
                            onChange={(ids) => onFeatsChange?.(ids)}
                        />
                    </div>

                    {isAdmin && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Status:</span>
                            <StatusChips
                                value={(filters.status as StatusFilter) || "all"}
                                onChange={(v) => onStatusChange?.(v)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: Attributes + Skills inline columns */}
            <div className="flex flex-wrap items-start gap-6">
                <div className="flex items-center gap-3 shrink-0">
                    <span className={cn("text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap", isMobile && "hidden")}>
                        Atributos:
                    </span>
                    <GlassSelector
                        value={filters.suggestedAttributes || []}
                        onChange={(vals) => onAttributesChange?.(vals as string[])}
                        options={ATTRIBUTE_OPTIONS}
                        mode="multi"
                        layout={isMobile ? "grid" : "horizontal"}
                        cols={isMobile ? 3 : undefined}
                        fullWidth={isMobile}
                        layoutId="bg-filter-attr-selector"
                        className={isMobile ? "w-full" : ""}
			size="sm"
                    />
                </div>

                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className={cn("text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap pt-1", isMobile && "hidden")}>
                        Perícias:
                    </span>
                    <div className="space-y-1.5 flex-1 min-w-0">
                        {selectedSkills.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onSkillsChange?.([])}
                                className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                            >
                                Limpar ({selectedSkills.length})
                            </button>
                        )}
                        <div className="flex flex-wrap gap-4">
                            {(Object.keys(SKILL_MAP) as AttributeType[]).map((attr) => {
                                const skills = SKILL_MAP[attr]
                                if (skills.length === 0) return null
                                const config = attributeColors[attr]
                                return (
                                    <div key={attr} className="space-y-1.5 min-w-[120px]">
                                        <h4 className={cn("text-[10px] font-bold uppercase tracking-widest pb-1 border-b border-white/10 text-center", config.text)}>
                                            {attr}
                                        </h4>
                                        <GlassSelector
                                            options={skills.map((skill) => ({
                                                value: skill,
                                                label: skill,
                                                activeColor: config.bgAlpha,
                                                textColor: config.text,
                                            }))}
                                            value={selectedSkills}
                                            onChange={(v) => onSkillsChange?.(v as string[])}
                                            mode="multi"
                                            layout="grid"
                                            cols={1}
                                            size="sm"
                                            layoutId={`bg-filter-skills-${attr}`}
                                            className="bg-transparent border-none p-0 gap-1"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
