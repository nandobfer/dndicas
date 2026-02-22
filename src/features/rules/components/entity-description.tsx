"use client"

import * as React from "react"
import { cn } from "@/core/utils"
import { MentionBadge } from "./mention-badge"

interface RuleDescriptionProps {
    html: string
    className?: string
}

export function EntityDescription({ html, className }: RuleDescriptionProps) {
    // Basic regex-based parsing to replace mention spans with React components
    // Stored HTML: <span data-type="mention" data-id="..." data-label="..." data-entity-type="...">...</span>
    
    const parts = React.useMemo(() => {
        if (!html) return []
        
        // This regex matches the mention spans produced by the rich-text-editor
        const mentionRegex = /<span[^>]*data-type="mention"[^>]*>.*?<\/span>/g
        const tokens = html.split(mentionRegex)
        const matches = html.match(mentionRegex)
        
        const result: (string | React.ReactNode)[] = []
        
        tokens.forEach((token, i) => {
            // First add the text token (might contain other HTML like <strong>, etc)
            // For the table preview, we actually want to strip MOST tags but keep our mentions for tooltips
            // But the request says keep the content...
            if (token) {
                result.push(<span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: token }} />)
            }
            
            // Then add the mention if there is one
            if (matches && matches[i]) {
                const match = matches[i]
                
                // Extract attributes from string
                const idMatch = match.match(/data-id="([^"]*)"/)
                const labelMatch = match.match(/data-label="([^"]*)"/)
                const typeMatch = match.match(/data-entity-type="([^"]*)"/)
                
                // If labelMatch fails, use content between tags
                const labelContentMatch = match.match(/>([^<]*)<\/span>/)
                
                const id = idMatch ? idMatch[1] : ""
                const label = labelMatch ? labelMatch[1] : (labelContentMatch ? labelContentMatch[1] : "")
                const type = typeMatch ? typeMatch[1] : "Regra"
                
                result.push(
                    <MentionBadge 
                        key={`mention-${i}`} 
                        id={id} 
                        label={label} 
                        type={type} 
                        delayDuration={200}
                    />
                )
            }
        })
        
        return result
    }, [html])

    return (
        <div className={cn(
            "max-w-none py-1 truncate whitespace-nowrap leading-relaxed block overflow-hidden",
            className
        )}>
            <div className="prose prose-xs prose-invert [&_*]:inline [&_p]:m-0 inline align-baseline">
                {parts}
            </div>
        </div>
    )
}
