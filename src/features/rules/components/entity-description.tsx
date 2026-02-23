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
        <div className={cn("max-w-none py-1 truncate whitespace-nowrap leading-relaxed block overflow-hidden", className)}>
            <MentionContent html={html} />
        </div>
    )
}
