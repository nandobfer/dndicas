/**
 * @fileoverview Shared Source Display component for entities.
 * Displays the book icon and source text with consistent styling.
 */

import * as React from "react"
import { BookOpen } from "lucide-react"

interface EntitySourceProps {
    source?: string
    className?: string
}

export function EntitySource({ source, className }: EntitySourceProps) {
    if (!source) return null

    return (
        <div className={`pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-white/40 ${className || ""}`}>
            <BookOpen className="h-3.5 w-3.5" />
            <span>Fonte: {source}</span>
        </div>
    )
}
