"use client";

import { SearchInput } from '@/components/ui/search-input';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { GlassInput } from '@/components/ui/glass-input';
import { GlassSelector } from "@/components/ui/glass-selector";
import { useAuth } from "@/core/hooks/useAuth";
import { cn } from "@/core/utils";
import { attributeColors, AttributeType, spellSchoolColors, SpellSchool, diceColors, DiceType, rarityColors } from "@/lib/config/colors";
import type { SpellsFilters } from "../types/spells.types";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SpellsFiltersProps {
    filters: SpellsFilters;
    onSearchChange: (search: string) => void;
    onStatusChange: (status: SpellsFilters["status"]) => void;
    onCircleChange: (circle: number | undefined, mode: "exact" | "upTo") => void;
    onSchoolsChange: (schools: SpellSchool[]) => void;
    onAttributesChange: (attributes: AttributeType[]) => void;
    onDiceTypesChange: (diceTypes: DiceType[]) => void;
    isSearching?: boolean;
    className?: string;
}

export function SpellsFilters({
    filters,
    onSearchChange,
    onStatusChange,
    onCircleChange,
    onSchoolsChange,
    onAttributesChange,
    onDiceTypesChange,
    isSearching = false,
    className
}: SpellsFiltersProps) {
    const { isAdmin } = useAuth();
    const [circleMode, setCircleMode] = useState<"exact" | "upTo">("exact");
    const [selectedCircle, setSelectedCircle] = useState<number | undefined>(
        filters.circles && filters.circles.length === 1 ? filters.circles[0] : undefined
    );

    // Build school options from spell school colors
    const schoolOptions = Object.entries(spellSchoolColors).map(([school, rarityColor]) => {
        // Map rarity to Tailwind color classes
        const colorMap: Record<string, { bg: string; text: string }> = {
            common: { bg: "bg-slate-400/20", text: "text-slate-400" },
            uncommon: { bg: "bg-emerald-400/20", text: "text-emerald-400" },
            rare: { bg: "bg-blue-400/20", text: "text-blue-400" },
            veryRare: { bg: "bg-purple-400/20", text: "text-purple-400" },
            legendary: { bg: "bg-amber-400/20", text: "text-amber-400" },
            artifact: { bg: "bg-red-400/20", text: "text-red-400" },
        };

        const colors = colorMap[rarityColor];
        return {
            value: school as SpellSchool,
            label: school.slice(0, 4) + ".", // "Abju.", "Adiv.", etc.
            activeColor: colors.bg.split(" ")[0],
            textColor: colors.text,
        };
    });

    // Build attribute options
    const attributeOptions = Object.entries(attributeColors).map(([key, config]) => ({
        value: key as AttributeType,
        label: config.name.slice(0, 3) + ".", // "For.", "Des.", etc.
        activeColor: config.badge.split(" ")[0],
        textColor: config.text,
    }));

    // Build dice type options
    const diceTypeOptions = Object.entries(diceColors).map(([key, config]) => ({
        value: key as DiceType,
        label: key, // "d4", "d6", etc.
        activeColor: config.bg.split(" ")[0],
        textColor: config.text,
    }));

    const handleCircleInput = (value: string) => {
        // Remove any non-numeric characters
        const cleanedValue = value.replace(/\D/g, "");

        if (cleanedValue === "") {
            setSelectedCircle(undefined);
            onCircleChange(undefined, circleMode);
        } else {
            let circle = parseInt(cleanedValue, 10);

            // Ensure range 0-9 (0 = Truque, 1-9 = Círculos)
            if (circle > 9) circle = 9;
            if (circle < 0) circle = 0;

            setSelectedCircle(circle);
            onCircleChange(circle, circleMode);
        }
    };

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Top Row: Search + Circle + Status */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
                    {/* Search */}
                    <div className="flex-1 w-full lg:max-w-md">
                        <SearchInput
                            value={filters.search || ""}
                            onChange={onSearchChange}
                            isLoading={isSearching}
                            placeholder="Buscar magias por nome ou descrição..."
                        />
                    </div>

                    {/* Circle Filter */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                            Círculo:
                        </span>
                        <div className="flex items-center gap-2">
                            <GlassInput
                                type="text"
                                inputMode="numeric"
                                value={selectedCircle !== undefined ? String(selectedCircle) : ""}
                                onChange={(e) => handleCircleInput(e.target.value)}
                                placeholder="Todos"
                                className="w-16 px-2 h-10 text-center"
                                containerClassName="w-auto"
                            />

                            <AnimatePresence mode="popLayout">
                                {selectedCircle !== undefined && (
                                    <motion.div
                                        key="circle-mode-selector-wrapper"
                                        initial={{ opacity: 0, scale: 0.8, x: -10 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.8, x: -10 }}
                                        transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                                    >
                                        <GlassSelector
                                            value={circleMode}
                                            onChange={(val) => {
                                                const newMode = val as "exact" | "upTo";
                                                setCircleMode(newMode);
                                                if (selectedCircle !== undefined) {
                                                    onCircleChange(selectedCircle, newMode);
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
                                                    activeColor: "bg-purple-500/20",
                                                    textColor: "text-purple-400",
                                                },
                                                {
                                                    value: "upTo",
                                                    label: (
                                                        <div className="flex items-center gap-1.5 leading-none">
                                                            <span className="text-base">≤</span>
                                                            <span>Até {selectedCircle}º</span>
                                                        </div>
                                                    ),
                                                    activeColor: "bg-purple-500/20",
                                                    textColor: "text-purple-400",
                                                },
                                            ]}
                                            size="sm"
                                            className="h-10"
                                            layoutId="circle-mode-selector"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Status */}
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap hidden sm:inline">
                            Status:
                        </span>
                        <StatusChips
                            value={filters.status || "all"}
                            onChange={onStatusChange as (status: StatusFilter) => void}
                        />
                    </div>
                )}
            </div>

            {/* Bottom Row: Advanced Filters */}
            <div className="flex flex-wrap items-center gap-6">
                {/* Schools Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Escola:
                    </span>
                    <GlassSelector
                        value={filters.schools || []}
                        onChange={(vals) => onSchoolsChange(vals as SpellSchool[])}
                        options={schoolOptions}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-school-selector"
                        className="h-10"
                    />
                </div>

                {/* Save Attributes Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Resistência:
                    </span>
                    <GlassSelector
                        value={filters.saveAttributes || []}
                        onChange={(vals) => onAttributesChange(vals as AttributeType[])}
                        options={attributeOptions}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-attr-selector"
                        className="h-10"
                    />
                </div>

                {/* Dice Types Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Dados:
                    </span>
                    <GlassSelector
                        value={filters.diceTypes || []}
                        onChange={(vals) => onDiceTypesChange(vals as DiceType[])}
                        options={diceTypeOptions}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-dice-selector"
                        className="h-10"
                    />
                </div>
            </div>
        </div>
    );
}
