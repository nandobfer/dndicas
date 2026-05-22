/**
 * @fileoverview Shared Source Display component for entities.
 * Displays the book icon and source text with consistent styling.
 */

import * as React from "react"
import { BookOpen } from "lucide-react"

interface EntitySourceProps {
    source?: string
    originalName?: string
    className?: string
}

export function EntitySource({ source, originalName, className }: EntitySourceProps) {
    if (!source && !originalName) return null

    return (
        <div className={`pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40 ${className || ""}`}>
            {source && (
                <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Fonte: {source}</span>
                </div>
            )}
            {originalName && <span>Nome original: {originalName}</span>}
        </div>
    )
}
