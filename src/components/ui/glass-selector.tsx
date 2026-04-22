"use client";

import * as React from 'react';
import { cn } from '@/core/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface GlassSelectorOption<T extends string | number> {
    value: T;
    label: React.ReactNode;
    activeColor?: string;
    textColor?: string;
    disabled?: boolean;
}

export interface GlassSelectorProps<T extends string | number> {
    /** Current selected value or array of values for multi-select */
    value: T | T[] | undefined
    /** Callback when value changes */
    onChange: (value: T | T[]) => void
    /** Options to display */
    options: GlassSelectorOption<T>[]
    /** Selection mode */
    mode?: "single" | "multi"
    /** Layout orientation/type */
    layout?: "horizontal" | "grid"
    /** Grid columns (only for layout='grid') */
    cols?: number
    /** Small screen grid columns */
    smCols?: number
    /** Whether the tabs should take full width */
    fullWidth?: boolean
    /** Size variant */
    size?: "sm" | "md" | "lg" | "normal"
    /** Whether the component is disabled */
    disabled?: boolean
    /** Additional class names */
    className?: string
    /** Unique ID for Framer Motion layout animations */
    layoutId?: string
}

/**
 * Generic selector with glassmorphism style and fluid animations.
 */
export function GlassSelector<T extends string | number>({
    value,
    onChange,
    options,
    mode = "single",
    layout = "horizontal",
    cols = 3,
    smCols,
    fullWidth = false,
    size = "md",
    disabled = false,
    className,
    layoutId = "glass-selector-indicator"
}: GlassSelectorProps<T>) {
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const isSelected = (optionValue: T) => {
        if (Array.isArray(value)) {
            return value.includes(optionValue)
        }
        return value === optionValue
    }

    const handleSelect = (optionValue: T) => {
        if (disabled) return

        if (mode === "multi") {
            const currentValues = Array.isArray(value) ? [...value] : value !== undefined ? [value] : []
            const index = currentValues.indexOf(optionValue)

            if (index > -1) {
                currentValues.splice(index, 1)
            } else {
                currentValues.push(optionValue)
            }
            onChange(currentValues)
        } else {
            onChange(optionValue)
        }
    }

    const containerClasses = cn(
        "p-1 rounded-lg bg-white/5 border border-white/10 overflow-hidden",
        layout === "horizontal" ? (fullWidth ? "flex" : "inline-flex") : "grid",
        layout === "grid" && {
            "grid-cols-1": cols === 1,
            "grid-cols-2": cols === 2,
            "grid-cols-3": cols === 3,
            "grid-cols-4": cols === 4,
            "grid-cols-6": cols === 6,
            "sm:grid-cols-1": smCols === 1,
            "sm:grid-cols-2": smCols === 2,
            "sm:grid-cols-3": smCols === 3,
            "sm:grid-cols-4": smCols === 4,
            "sm:grid-cols-6": smCols === 6
        },
        disabled && "opacity-50 pointer-events-none cursor-not-allowed grayscale-[0.5]",
        className
    )

    if (!mounted) {
        return (
            <div className={containerClasses}>
                {options.map((option) => (
                    <button
                        key={String(option.value)}
                        type="button"
                        className={cn(
                            "relative font-medium rounded-md transition-colors inline-block text-center",
                            size === "sm" && "px-3 py-1 text-xs",
                            (size === "md" || size === "normal") && "px-4 py-2 text-sm",
                            size === "lg" && "px-6 py-3 text-base",
                            fullWidth && "flex-1",
                            "text-white/50"
                        )}
                    >
                        <span className="relative z-10">{option.label}</span>
                    </button>
                ))}
            </div>
        )
    }

    return (
        <div className={containerClasses}>
            {options.map((option) => {
                const selected = isSelected(option.value)
                const itemDisabled = disabled || option.disabled

                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        disabled={itemDisabled}
                        onClick={() => handleSelect(option.value)}
                        className={cn(
                            "relative font-medium rounded-md transition-colors",
                            layout === "horizontal" && (fullWidth ? "flex-1 flex items-center justify-center" : "inline-block text-center"),
                            layout === "grid" && "h-full flex items-center justify-center",
                            (size === "md" || size === "normal") && "px-4 py-1.5 text-sm",
                            size === "sm" && "px-2 py-0.5 text-[8px]",
                            size === "lg" && "px-6 py-2.5 text-base",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                            itemDisabled && !selected && "opacity-30 cursor-not-allowed",
                            itemDisabled && selected && "cursor-not-allowed"
                        )}
                        style={
                            selected
                                ? {
                                      backgroundColor: option.activeColor?.startsWith("#") ? `${option.activeColor}20` : undefined,
                                      color: option.textColor?.startsWith("#") ? option.textColor : "white"
                                  }
                                : {
                                      color: "rgba(255, 255, 255, 0.5)"
                                  }
                        }
                    >
                        {selected && mode === "single" && !option.activeColor?.startsWith("#") && (
                            <motion.div
                                layoutId={layoutId}
                                className={cn("absolute inset-0 rounded-md z-0", option.activeColor || "bg-white/15")}
                                transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                            />
                        )}

                        <AnimatePresence>
                            {selected && mode === "multi" && !option.activeColor?.startsWith("#") && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className={cn("absolute inset-0 rounded-md z-0", option.activeColor || "bg-white/15")}
                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                />
                            )}
                        </AnimatePresence>
                        <span className="relative z-10">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
