"use client"

import * as React from "react"
import { useMemo } from "react"
import { cn } from "@/core/utils"
import { MentionBadge } from "./mention-badge"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"

interface EntityDescriptionProps {
    html: string
    className?: string
}

function decodeHTMLEntities(text: string) {
    if (typeof document === "undefined") return text.replace(/&amp;/g, "&")
    const textArea = document.createElement("textarea")
    textArea.innerHTML = text
    return textArea.value
}

export function EntityDescription({ html, className }: EntityDescriptionProps) {
    // Basic regex-based parsing to replace mention spans and images with React components
    // Stored HTML: <span data-type="mention" ...>...</span> or <img src="..." ... />

    const parts = useMemo(() => {
        if (!html) return []

        // This regex matches either mention spans or img tags.
        // Using capturing group to identify tags during split
        const combinedRegex = /(<span[^>]*data-type="mention"[^>]*>.*?<\/span>|<img[^>]*>)/g
        const tokens = html.split(combinedRegex)

        const result: (string | React.ReactNode)[] = []

        tokens.forEach((token, i) => {
            if (!token) return

            if (token.startsWith("<span") && token.includes('data-type="mention"')) {
                // Extract attributes from string
                const idMatch = token.match(/data-id="([^"]*)"/)
                const labelMatch = token.match(/data-label="([^"]*)"/)
                const typeMatch = token.match(/data-entity-type="([^"]*)"/)

                // If labelMatch fails, use content between tags
                const labelContentMatch = token.match(/>([^<]*)<\/span>/)

                const id = idMatch ? idMatch[1] : ""
                const labelRaw = labelMatch ? labelMatch[1] : labelContentMatch ? labelContentMatch[1] : ""
                const label = decodeHTMLEntities(labelRaw)
                const type = typeMatch ? typeMatch[1] : "Regra"

                result.push(<MentionBadge key={`mention-${i}`} id={id} label={label} type={type} delayDuration={200} />)
            } else if (token.startsWith("<img")) {
                // Extract src
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
                                className="h-6 w-auto inline-block align-middle rounded-[2px] border border-white/20 mx-0.5 hover:scale-110 transition-transform cursor-zoom-in"
                                alt="Thumb"
                            />
                        </SimpleGlassTooltip>
                    )
                }
            } else {
                // Regular HTML or text
                result.push(<span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: token }} />)
            }
        })

        return result
    }, [html])

    return (
        <div className={cn("max-w-none py-1 truncate whitespace-nowrap leading-relaxed block overflow-hidden", className)}>
            <div className="prose prose-xs prose-invert [&_*]:inline [&_p]:m-0 inline align-baseline">{parts}</div>
        </div>
    )
}
