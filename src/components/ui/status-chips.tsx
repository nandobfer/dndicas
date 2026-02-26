"use client";

/**
 * @fileoverview StatusChips component for filtering by active/inactive status.
 * Uses chip-style buttons with color indicators.
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { GlassSelector } from "./glass-selector"

export type StatusFilter = "all" | "active" | "inactive"

export interface StatusChipsProps {
    /** Current selected status */
    value: StatusFilter
    /** Callback when status changes */
    onChange: (status: StatusFilter) => void
    /** Whether the chips should take full width */
    fullWidth?: boolean
    /** Additional class names */
    className?: string
}

/**
 * StatusChips component for filtering by status.
 */
export function StatusChips({ value, onChange, fullWidth = false, className }: StatusChipsProps) {
    const options = [
        {
            value: "all" as StatusFilter,
            label: (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>Todos</span>
                </div>
            ),
            activeColor: "bg-purple-500/20",
            textColor: "text-white",
        },
        {
            value: "active" as StatusFilter,
            label: (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Ativos</span>
                </div>
            ),
            activeColor: "bg-emerald-500/20",
            textColor: "text-white",
        },
        {
            value: "inactive" as StatusFilter,
            label: (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span>Inativos</span>
                </div>
            ),
            activeColor: "bg-gray-500/20",
            textColor: "text-white",
        },
    ]

    return <GlassSelector value={value} onChange={(val) => onChange(val as StatusFilter)} options={options} className={className} fullWidth={fullWidth} layoutId="status-chips-indicator" />
}
