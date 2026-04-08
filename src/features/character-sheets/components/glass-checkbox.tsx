"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { Star } from "lucide-react"

// ─── 2-state GlassCheckbox ──────────────────────────────────────────────────

interface GlassCheckboxProps {
    checked: boolean
    onChange: (checked: boolean) => void
    accentColor?: string // hex or tailwind-compatible color
    accentClass?: string // tailwind bg class for active state
    className?: string
    size?: "sm" | "md"
    disabled?: boolean
}

export const GlassCheckbox = ({ checked, onChange, accentColor, accentClass, className, size = "sm", disabled = false }: GlassCheckboxProps) => {
    const dim = size === "sm" ? "w-4 h-4" : "w-5 h-5"

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
                "relative rounded-full border border-white/20 bg-white/5 backdrop-blur-sm",
                "transition-all duration-200 flex items-center justify-center flex-shrink-0",
                "hover:border-white/40 hover:bg-white/10",
                disabled && "opacity-50 cursor-not-allowed",
                dim,
                className,
            )}
            style={checked && accentColor ? { backgroundColor: accentColor + "cc", borderColor: accentColor } : undefined}
        >
            <AnimatePresence>
                {checked && (
                    <motion.span
                        key="fill"
                        className={cn("absolute inset-0.5 rounded-full", accentClass ?? "bg-white/60")}
                        style={accentColor && !accentClass ? { backgroundColor: accentColor } : undefined}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    />
                )}
            </AnimatePresence>
        </button>
    )
}

// ─── 3-state skill GlassCheckbox ────────────────────────────────────────────
// States: 0 = off, 1 = proficient, 2 = expertise

export type SkillCheckboxState = 0 | 1 | 2

interface SkillGlassCheckboxProps {
    state: SkillCheckboxState
    onChange: (next: SkillCheckboxState) => void
    proficientColor?: string  // hex color for proficient state (attribute color)
    className?: string
    size?: "sm" | "md"
    disabled?: boolean
}

export const SkillGlassCheckbox = ({ state, onChange, proficientColor, className, size = "sm", disabled = false }: SkillGlassCheckboxProps) => {
    const dim = size === "sm" ? "w-4 h-4" : "w-5 h-5"

    const handleClick = () => {
        if (disabled) return
        onChange(((state + 1) % 3) as SkillCheckboxState)
    }

    const tooltipLabel = state === 0 ? "Sem proficiência" : state === 1 ? "Proficiência" : "Especialização"

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={state > 0}
            aria-label={tooltipLabel}
            title={tooltipLabel}
            disabled={disabled}
            onClick={handleClick}
            className={cn(
                "relative rounded-full border border-white/20 bg-white/5 backdrop-blur-sm",
                "transition-all duration-200 flex items-center justify-center flex-shrink-0",
                "hover:border-white/40",
                disabled && "opacity-50 cursor-not-allowed",
                dim,
                className,
            )}
            style={
                state === 1 && proficientColor
                    ? { backgroundColor: proficientColor + "cc", borderColor: proficientColor }
                    : state === 2
                    ? { backgroundColor: "#d97706cc", borderColor: "#d97706" }
                    : undefined
            }
        >
            <AnimatePresence mode="wait">
                {state === 1 && (
                    <motion.span
                        key="proficient"
                        className="absolute inset-0.5 rounded-full"
                        style={{ backgroundColor: proficientColor ?? "#ffffff" }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    />
                )}
                {state === 2 && (
                    <motion.span
                        key="expertise"
                        className="absolute inset-0 rounded-full flex items-center justify-center"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                        <Star size={8} className="text-amber-100 fill-amber-100" />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    )
}
