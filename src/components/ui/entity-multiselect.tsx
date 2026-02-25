"use client";

/**
 * @fileoverview EntityMultiSelect component for filtering by multiple entities.
 * Uses chips with checkboxes for multi-selection.
 */

import * as React from 'react';
import { Check, Filter, Users, Scroll, Sparkles, Zap, Wand } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { glassConfig } from "@/lib/config/glass-config"
import { entityConfig } from "@/lib/config/colors"

export interface EntityMultiSelectProps {
    /** Currently selected entity types */
    value: string[]
    /** Callback when selection changes */
    onChange: (entities: string[]) => void
    /** Additional class names */
    className?: string
}

// Icons for each entity type based on their display name
const entityIcons: Record<string, any> = {
    Usuário: Users,
    Regra: Scroll,
    Habilidade: Sparkles,
    Talento: Zap,
    Magia: Wand,
}

// Preparation for the component using entityConfig from colors.ts
const entities = Object.entries(entityConfig)
    .filter(([label]) => label !== "Segurança")
    .map(([label, config]) => {
        // Dynamic map for shadow colors based on the semantic color name
        const colorShadowMap: Record<string, string> = {
            emerald: "bg-emerald-500 border-emerald-500 shadow-emerald-500/40",
            blue: "bg-blue-500 border-blue-500 shadow-blue-500/40",
            slate: "bg-slate-500 border-slate-500 shadow-slate-500/40",
            amber: "bg-amber-500 border-amber-500 shadow-amber-500/40",
            purple: "bg-purple-500 border-purple-500 shadow-purple-500/40",
            red: "bg-red-500 border-red-500 shadow-red-500/40",
        }

        return {
            value: label, // We use the display label as the filter value
            label: label,
            icon: entityIcons[label] || Scroll,
            color: config.text,
            bgColor: config.bgAlpha,
            border: config.border,
            checkActive: colorShadowMap[config.color] || colorShadowMap.purple,
            styles: config,
        }
    })

export function EntityMultiSelect({ value, onChange, className }: EntityMultiSelectProps) {
    const [isOpen, setIsOpen] = React.useState(false)

    const toggleEntity = (entityValue: string) => {
        // Ensure we are working with clean values and avoid duplicates
        const currentValues = Array.isArray(value) ? value : []
        if (currentValues.includes(entityValue)) {
            onChange(currentValues.filter((v) => v !== entityValue))
        } else {
            onChange([...currentValues, entityValue])
        }
    }

    const hasValue = value && value.length > 0
    const displayText = !hasValue 
        ? "Todas as entidades" 
        : value.length === entities.length 
            ? "Todas as entidades" 
            : value.join(", ")

    return (
        <GlassPopover open={isOpen} onOpenChange={setIsOpen}>
            <GlassPopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                        "flex items-center gap-2",
                        glassConfig.input.blur,
                        glassConfig.input.background,
                        glassConfig.input.border,
                        "hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 active:scale-[0.98]",
                        hasValue ? "text-white" : "text-white/60",
                        "max-w-[200px]",
                        className,
                    )}
                >
                    <Filter className="h-4 w-4" />
                    <span className="truncate">{displayText}</span>
                </button>
            </GlassPopoverTrigger>
            <GlassPopoverContent className="w-64 p-3" align="start">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-white/60 mb-3">Selecione as entidades</p>
                    {entities.map((entity) => {
                        const isSelected = value?.includes(entity.value)
                        const Icon = entity.icon

                        return (
                            <button
                                key={entity.value}
                                type="button"
                                onClick={() => toggleEntity(entity.value)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg",
                                    "border transition-all duration-200",
                                    isSelected ? "brightness-110" : "hover:bg-white/10 hover:border-white/20",
                                    "active:scale-[0.98]",
                                    isSelected ? `${entity.bgColor} ${entity.border}` : "bg-white/5 border-white/10",
                                )}
                            >
                                <div
                                    className={cn(
                                        "flex items-center justify-center w-[18px] h-[18px] rounded-md border transition-all duration-300",
                                        isSelected 
                                            ? `${entity.checkActive} shadow-[0_0_10px]` 
                                            : "bg-white/5 border-white/20",
                                    )}
                                >
                                    {isSelected && (
                                        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                                            <Check className="h-3 w-3 text-white stroke-[3.5]" />
                                        </motion.div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-1">
                                    <Icon className={cn("h-4 w-4", isSelected ? "text-white" : entity.color)} />
                                    <span className={cn("text-sm font-semibold tracking-wide", isSelected ? "text-white" : entity.color)}>{entity.label}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </GlassPopoverContent>
        </GlassPopover>
    )
}

EntityMultiSelect.displayName = 'EntityMultiSelect';
