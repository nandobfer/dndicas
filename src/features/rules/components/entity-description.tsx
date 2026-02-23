"use client"

import * as React from "react"
import { cn } from "@/core/utils"
import { MentionContent } from "./mention-badge"

interface EntityDescriptionProps {
    html: string
    className?: string
}

export function EntityDescription({ html, className }: EntityDescriptionProps) {
    return (
        <div className={cn("max-w-none flex items-center h-8 overflow-hidden", className)}>
            <div className="truncate whitespace-nowrap w-full py-2 leading-none">
                <MentionContent html={html} mode="inline" className="!inline-flex items-center align-middle" />
            </div>
        </div>
    )
}
