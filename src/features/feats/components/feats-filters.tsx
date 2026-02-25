"use client";

import { SearchInput } from '@/components/ui/search-input';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { GlassInput } from '@/components/ui/glass-input';
import { GlassSelector } from "@/components/ui/glass-selector"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { attributeColors, AttributeType } from "@/lib/config/colors"
import type { FeatsFilters } from "../types/feats.types"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export interface FeatsFiltersProps {
    filters: FeatsFilters
    onSearchChange: (search: string) => void
    onStatusChange: (status: FeatsFilters["status"]) => void
    onLevelChange: (level: number | undefined, mode: "exact" | "upto") => void
    onAttributesChange: (attributes: string[]) => void
    isSearching?: boolean
    className?: string
}

export function FeatsFilters({ filters, onSearchChange, onStatusChange, onLevelChange, onAttributesChange, isSearching = false, className }: FeatsFiltersProps) {
    const { isAdmin } = useAuth()
    const [levelMode, setLevelMode] = useState<"exact" | "upto">("exact")
    const [selectedLevel, setSelectedLevel] = useState<number | undefined>(filters.level || filters.levelMax)

    const attributeOptions = Object.entries(attributeColors).map(([key, config]) => ({
        value: key as AttributeType,
        label: config.name.slice(0, 3) + ".",
        activeColor: config.badge.split(" ")[0],
        textColor: config.text,
    }))

    const handleLevelInput = (value: string) => {
        // Remove qualquer caractere que não seja número (máscara numérica)
        const cleanedValue = value.replace(/\D/g, "")

        if (cleanedValue === "") {
            setSelectedLevel(undefined)
            onLevelChange(undefined, levelMode)
        } else {
            let level = parseInt(cleanedValue, 10)

            // Garante o intervalo de 1 a 20
            if (level > 20) level = 20
            if (level < 1) level = 1

            setSelectedLevel(level)
            onLevelChange(level, levelMode)
        }
    }

    return (
        <div className={cn("flex flex-col lg:flex-row lg:items-center gap-4 justify-between", className)}>
            {/* Search */}
            <div className="flex-1 w-full lg:max-w-md">
                <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar talentos por nome ou fonte..." />
            </div>

            <div className="flex flex-wrap items-center gap-6">
                {/* Level Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Nível:</span>
                    <div className="flex items-center gap-2">
                        <GlassInput
                            type="text"
                            inputMode="numeric"
                            value={selectedLevel !== undefined ? String(selectedLevel) : ""}
                            onChange={(e) => handleLevelInput(e.target.value)}
                            placeholder="Todos"
                            className="w-16 px-2 h-10 text-center"
                            containerClassName="w-auto"
                        />

                        <AnimatePresence mode="popLayout">
                            {selectedLevel !== undefined && (
                                <motion.div
                                    key="level-mode-selector-wrapper"
                                    initial={{ opacity: 0, scale: 0.8, x: -10 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.8, x: -10 }}
                                    transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                                >
                                    <GlassSelector
                                        value={levelMode}
                                        onChange={(val) => {
                                            const newMode = val as "exact" | "upto"
                                            setLevelMode(newMode)
                                            if (selectedLevel !== undefined) {
                                                onLevelChange(selectedLevel, newMode)
                                            }
                                        }}
                                        options={[
                                            {
                                                value: "exact",
                                                label: (
                                                    <div className="flex items-center gap-1.5 leading-none">
                                                        <span className="text-base">=</span>
                                                        <span>Exato</span>
                                                    </div>
                                                ),
                                                activeColor: "bg-blue-500/20",
                                                textColor: "text-blue-400",
                                            },
                                            {
                                                value: "upto",
                                                label: (
                                                    <div className="flex items-center gap-1.5 leading-none">
                                                        <span className="text-base">≤</span>
                                                        <span>Até Nv.{selectedLevel}</span>
                                                    </div>
                                                ),
                                                activeColor: "bg-blue-500/20",
                                                textColor: "text-blue-400",
                                            },
                                        ]}
                                        size="sm"
                                        className="h-10"
                                        layoutId="level-mode-selector"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Attributes Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Atributos:</span>
                    <GlassSelector
                        value={filters.attributes || []}
                        onChange={(vals) => onAttributesChange(vals as string[])}
                        options={attributeOptions}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-attr-selector"
                        className="h-10"
                    />
                </div>

                {/* Status */}
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Status:</span>
                        <StatusChips value={filters.status || "all"} onChange={onStatusChange as (status: StatusFilter) => void} />
                    </div>
                )}
            </div>
        </div>
    )
}
