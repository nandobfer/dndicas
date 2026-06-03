"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"

export interface GlassProficiencyCheckboxProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    checked: boolean
    onCheckedChange?: (checked: boolean) => void
}

/**
 * GlassProficiencyCheckbox
 *
 * A specialized checkbox for D&D proficiency bonus, featuring a glassmorphism style
 * and an embedded "PB" label. Larger and more visual than standard checkboxes.
 */
export const GlassProficiencyCheckbox = React.forwardRef<HTMLButtonElement, GlassProficiencyCheckboxProps>(
    ({ checked, onCheckedChange, className, disabled, onClick, ...props }, ref) => {
        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (!disabled) onCheckedChange?.(!checked)
            onClick?.(e)
        }

        return (
            <button
                ref={ref}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={disabled}
                className={cn(
                    "relative w-7 h-6 rounded-md border flex items-center justify-center transition-all duration-200",
                    "backdrop-blur-sm select-none",
                    checked
                        ? "bg-cyan-500/20 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                    disabled && "opacity-50 cursor-not-allowed grayscale",
                    className
                )}
                {...props}
                onClick={handleClick}
            >
                <span
                    className={cn(
                        "text-[9px] font-black tracking-tighter transition-colors duration-200",
                        checked ? "text-cyan-300 drop-shadow-[0_0_4px_rgba(6,182,212,0.8)]" : "text-white/20"
                    )}
                >
                    PB
                </span>

                <AnimatePresence>
                    {checked && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute inset-0 rounded-md border border-cyan-400/50 pointer-events-none"
                            aria-hidden="true"
                        />
                    )}
                </AnimatePresence>
            </button>
        )
    }
)

GlassProficiencyCheckbox.displayName = "GlassProficiencyCheckbox"
