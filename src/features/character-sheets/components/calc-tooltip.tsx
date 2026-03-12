"use client"

import { GlassTooltip, GlassTooltipTrigger, GlassTooltipContent } from "@/components/ui/glass-tooltip"
import { cn } from "@/core/utils"

interface CalcTooltipProps {
    formula: string
    children: React.ReactNode
    className?: string
}

export function CalcTooltip({ formula, children, className }: CalcTooltipProps) {
    return (
        <GlassTooltip>
            <GlassTooltipTrigger asChild>
                <span className={cn("cursor-help", className)}>{children}</span>
            </GlassTooltipTrigger>
            <GlassTooltipContent>
                <span className="font-mono text-[10px] text-white/70">{formula}</span>
            </GlassTooltipContent>
        </GlassTooltip>
    )
}
