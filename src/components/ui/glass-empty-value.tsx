"use client";

import * as React from "react";
import { cn } from "@/core/utils";

interface GlassEmptyValueProps {
    /** Custom class names */
    className?: string;
    /** Custom empty character (default: em dash "—") */
    char?: string;
}

/**
 * Compact inline empty state for displaying null/undefined values in table cells and forms.
 * Renders a subtle em dash ("—") with muted styling for visual consistency.
 * 
 * Inspired by `glass-inline-empty-state.tsx` but simplified for inline cell usage.
 * 
 * @example
 * // In table cell
 * {spell.saveAttribute ? <AttributeChip /> : <GlassEmptyValue />}
 * 
 * // With custom character
 * <GlassEmptyValue char="N/A" />
 */
export function GlassEmptyValue({ className, char = "—" }: GlassEmptyValueProps) {
    return (
        <span 
            className={cn(
                "text-white/30 text-sm select-none",
                className
            )}
            aria-label="Valor vazio"
        >
            {char}
        </span>
    );
}

GlassEmptyValue.displayName = "GlassEmptyValue";
