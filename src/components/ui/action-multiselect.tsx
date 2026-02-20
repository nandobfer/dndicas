"use client";

/**
 * @fileoverview ActionMultiSelect component for filtering by multiple actions.
 * Uses chips with checkboxes for multi-selection.
 */

import * as React from 'react';
import { Check, Filter } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { glassConfig } from "@/lib/config/glass-config"
import type { AuditAction } from "@/features/users/types/audit.types"

export interface ActionMultiSelectProps {
    /** Currently selected actions */
    value: AuditAction[]
    /** Callback when selection changes */
    onChange: (actions: AuditAction[]) => void
    /** Additional class names */
    className?: string
}

/**
 * Action chip configuration with colors.
 */
const actionChips: Array<{
    value: AuditAction
    label: string
    color: string
    bgColor: string
    hoverBg: string
    checkActive: string
}> = [
    {
        value: "CREATE",
        label: "Criado",
        color: "text-emerald-400",
        bgColor: "bg-emerald-400/10 border-emerald-400/20",
        hoverBg: "hover:bg-emerald-400/20 hover:border-emerald-400/40",
        checkActive: "bg-emerald-500 border-emerald-500 shadow-emerald-500/40",
    },
    {
        value: "UPDATE",
        label: "Editado",
        color: "text-blue-400",
        bgColor: "bg-blue-400/10 border-blue-400/20",
        hoverBg: "hover:bg-blue-400/20 hover:border-blue-400/40",
        checkActive: "bg-blue-500 border-blue-500 shadow-blue-500/40",
    },
    {
        value: "DELETE",
        label: "Excluído",
        color: "text-rose-400",
        bgColor: "bg-rose-400/10 border-rose-400/20",
        hoverBg: "hover:bg-rose-400/20 hover:border-rose-400/40",
        checkActive: "bg-rose-500 border-rose-500 shadow-rose-500/40",
    },
]

/**
 * ActionMultiSelect component for filtering by multiple actions.
 *
 * @example
 * ```tsx
 * const [actions, setActions] = useState<AuditAction[]>([]);
 * <ActionMultiSelect value={actions} onChange={setActions} />
 * ```
 */
export function ActionMultiSelect({ value, onChange, className }: ActionMultiSelectProps) {
    const [isOpen, setIsOpen] = React.useState(false)

    const toggleAction = (action: AuditAction) => {
        if (value.includes(action)) {
            onChange(value.filter((a) => a !== action))
        } else {
            onChange([...value, action])
        }
    }

    const hasValue = value.length > 0

    const displayText = value.length === 0 ? "Todas as ações" : value.length === actionChips.length ? "Todas as ações" : value.map((v) => actionChips.find((c) => c.value === v)?.label).join(", ")

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
                    <p className="text-xs font-medium text-white/60 mb-3">Selecione as ações</p>
                    {actionChips.map((chip) => {
                        const isSelected = value.includes(chip.value)

                        return (
                            <button
                                key={chip.value}
                                type="button"
                                onClick={() => toggleAction(chip.value)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg",
                                    "border transition-all duration-200",
                                    isSelected ? `${chip.hoverBg} brightness-110` : "hover:bg-white/10 hover:border-white/20",
                                    "active:scale-[0.98]",
                                    isSelected ? chip.bgColor : "bg-white/5 border-white/10",
                                )}
                            >
                                <div
                                    className={cn(
                                        "flex items-center justify-center w-[18px] h-[18px] rounded-md border transition-all duration-300",
                                        isSelected ? `${chip.checkActive} shadow-[0_0_10px]` : "bg-white/5 border-white/20",
                                    )}
                                >
                                    {isSelected && (
                                        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                                            <Check className="h-3 w-3 text-white stroke-[3.5]" />
                                        </motion.div>
                                    )}
                                </div>
                                <span className={cn("text-sm font-semibold tracking-wide", isSelected ? "text-white" : chip.color)}>{chip.label}</span>
                            </button>
                        )
                    })}
                </div>
            </GlassPopoverContent>
        </GlassPopover>
    )
}
