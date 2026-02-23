"use client"

import * as React from "react"
import { useMemo } from "react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { EntityPreviewTooltip } from "./entity-preview-tooltip"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"

interface MentionBadgeProps {
    id: string
    label: string
    type?: string
    className?: string
    delayDuration?: number
}

function decodeHTMLEntities(text: string) {
    if (typeof document === "undefined") return text.replace(/&amp;/g, "&")
    const textArea = document.createElement("textarea")
    textArea.innerHTML = text
    return textArea.value
}

export function MentionContent({ html, delayDuration = 200 }: { html: string; delayDuration?: number }) {
    const parts = useMemo(() => {
        if (!html) return []

        const combinedRegex = /(<span[^>]*data-type="mention"[^>]*>.*?<\/span>|<img[^>]*>)/g
        const tokens = html.split(combinedRegex)

        const result: (string | React.ReactNode)[] = []

        tokens.forEach((token, i) => {
            if (!token) return

            if (token.startsWith("<span") && token.includes('data-type="mention"')) {
                const idMatch = token.match(/data-id="([^"]*)"/)
                const labelMatch = token.match(/data-label="([^"]*)"/)
                const typeMatch = token.match(/data-entity-type="([^"]*)"/)
                const labelContentMatch = token.match(/>([^<]*)<\/span>/)

                const id = idMatch ? idMatch[1] : ""
                const labelRaw = labelMatch ? labelMatch[1] : labelContentMatch ? labelContentMatch[1] : ""
                const label = decodeHTMLEntities(labelRaw)
                const type = typeMatch ? typeMatch[1] : "Regra"

                result.push(<MentionBadge key={`mention-${i}`} id={id} label={label} type={type} delayDuration={delayDuration} />)
            } else if (token.startsWith("<img")) {
                const srcMatch = token.match(/src="([^"]*)"/)
                const srcRaw = srcMatch ? srcMatch[1] : ""
                const src = decodeHTMLEntities(srcRaw)

                if (src) {
                    result.push(
                        <SimpleGlassTooltip
                            key={`img-${i}`}
                            delayDuration={100}
                            content={
                                <div className="p-1">
                                    <img
                                        src={src}
                                        className="max-w-[500px] max-h-[500px] rounded-lg shadow-2xl border border-white/10"
                                        alt="Preview"
                                    />
                                </div>
                            }
                        >
                            <img
                                src={src}
                                className="h-4 w-auto inline-block align-middle rounded-[2px] border border-white/20 mx-0.5 hover:scale-110 transition-transform cursor-zoom-in"
                                alt="Thumb"
                            />
                        </SimpleGlassTooltip>
                    )
                }
            } else {
                result.push(<span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: token }} />)
            }
        })

        return result
    }, [html, delayDuration])

    return <span className="prose prose-xs prose-invert [&_*]:inline [&_p]:m-0 inline align-baseline">{parts}</span>
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
                        getStyles(type)
                    )}
                >
                    <span className="opacity-40 text-[9px] uppercase font-bold tracking-tight border-r border-current/20 pr-1 shrink-0">{type}</span>
                    <span className="whitespace-nowrap">
                        <MentionContent html={label} delayDuration={delayDuration} />
                    </span>
                </span>
            </EntityPreviewTooltip>
        </span>
    )
}
