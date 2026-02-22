"use client"

import * as React from "react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { EntityPreviewTooltip } from "./entity-preview-tooltip"

interface MentionBadgeProps {
    id: string
    label: string
    type?: string
    className?: string
    delayDuration?: number
}

export function MentionBadge({ 
    id, 
    label, 
    type = "Regra", 
    className,
    delayDuration = 400 
}: MentionBadgeProps) {
    const getStyles = (t: string) => {
        const typeKey = (Object.keys(entityColors).find((k) => t.includes(k.substring(0, 5))) || "Regra") as keyof typeof entityColors
        return entityColors[typeKey]?.mention || entityColors.Regra.mention
    }

    return (
        <span className={cn("inline-block relative group/mention mx-0.5 align-baseline translate-y-[1px]", className)}>
            <EntityPreviewTooltip entityId={id} entityType={type} delayDuration={delayDuration}>
                <span
                    className={cn(
                        "mention inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold text-[13px] border transition-all cursor-help",
                        getStyles(type),
                    )}
                >
                    <span className="opacity-40 text-[9px] uppercase font-bold tracking-tight border-r border-current/20 pr-1 shrink-0">{type}</span>
                    <span className="whitespace-nowrap">{label}</span>
                </span>
            </EntityPreviewTooltip>
        </span>
    )
}
