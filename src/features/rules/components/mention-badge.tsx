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

export function MentionContent({
    html,
    delayDuration = 200,
    mode = "inline",
    imageWidth = "300px",
    className,
}: {
    html: string
    delayDuration?: number
    mode?: "inline" | "block"
    imageWidth?: string | "small"
    className?: string
}) {
    const [isMounted, setIsMounted] = React.useState(false)

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    const contents = useMemo(() => {
        if (!html) return null

        // SSR Fallback or if document is not available
        if (!isMounted || typeof document === "undefined") {
            return <span dangerouslySetInnerHTML={{ __html: html }} />
        }

        const parser = new DOMParser()
        const doc = parser.parseFromString(html, "text/html")
        const body = doc.body

        const convertNode = (node: Node, index: number): React.ReactNode => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement
                const tagName = el.tagName.toLowerCase()

                // Special handling for Mentions
                if (tagName === "span" && el.getAttribute("data-type") === "mention") {
                    const id = el.getAttribute("data-id") || ""
                    const label = el.getAttribute("data-label") || el.textContent || ""
                    const type = el.getAttribute("data-entity-type") || "Regra"
                    return <MentionBadge key={`mention-${index}`} id={id} label={label} type={type} delayDuration={delayDuration} />
                }

                // Special handling for Images
                if (tagName === "img") {
                    const src = el.getAttribute("src") || ""
                    if (src) {
                        const isSmall = imageWidth === "small"

                        if (isSmall) {
                            return (
                                <SimpleGlassTooltip
                                    key={`img-${index}`}
                                    delayDuration={100}
                                    className="!p-1"
                                    content={<img src={src} className="max-w-[500px] max-h-[500px] rounded-lg shadow-2xl border border-white/10 block" alt="Preview" />}
                                >
                                    <img
                                        src={src}
                                        className="h-8 w-auto inline-block align-middle rounded-[2px] border border-white/20 mx-0.5 hover:scale-110 transition-transform cursor-zoom-in"
                                        alt="Thumb"
                                    />
                                </SimpleGlassTooltip>
                            )
                        }

                        return (
                            <img key={`img-${index}`} src={src} style={{ width: imageWidth, height: "auto" }} className="rounded-lg border border-white/20 max-w-full block my-2" alt="Content Image" />
                        )
                    }
                }

                // If inline mode, flatten structural blocks to avoid breaks
                const blockTags = ["p", "div", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]
                if (mode === "inline" && blockTags.includes(tagName)) {
                    return <React.Fragment key={`flat-${index}`}>{Array.from(node.childNodes).map((child, i) => convertNode(child, i))} </React.Fragment>
                }

                // Default: Recreate the element while recursing for special nodes
                const children = Array.from(node.childNodes).map((child, i) => convertNode(child, i))
                const props: any = { key: `${tagName}-${index}` }

                Array.from(el.attributes).forEach((attr) => {
                    const name = attr.name === "class" ? "className" : attr.name
                    props[name] = attr.value
                })

                return React.createElement(tagName, props, children.length > 0 ? children : undefined)
            }
            return null
        }

        return Array.from(body.childNodes).map((node, i) => convertNode(node, i))
    }, [html, delayDuration, mode, isMounted])

    if (mode === "block") {
        return (
            <div
                className={cn(
                    "prose prose-invert prose-xs max-w-none",
                    "prose-p:my-2 prose-headings:mb-4 prose-headings:mt-6",
                    "prose-ul:list-disc prose-ol:list-decimal prose-li:my-1",
                    "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
                    "[&_li]:marker:text-white/30",
                    "[&_p]:min-h-[1em]",
                    className,
                )}
            >
                {contents}
            </div>
        )
    }

    return <span className={cn("inline align-middle", className)}>{contents}</span>
}

export function MentionBadge({ id, label, type = "Regra", className, delayDuration = 400 }: MentionBadgeProps) {
    const getStyles = (t: string) => {
        const typeKey = (Object.keys(entityColors).find((k) => t.includes(k.substring(0, 5))) || "Regra") as keyof typeof entityColors
        return entityColors[typeKey]?.mention || entityColors.Regra.mention
    }

    return (
        <span className={cn("inline-flex relative group/mention mx-0.5 align-middle", className)}>
            <EntityPreviewTooltip entityId={id} entityType={type} delayDuration={delayDuration}>
                <span className={cn("mention inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md font-bold text-[12px] border transition-all cursor-help", getStyles(type))}>
                    <span className="opacity-40 text-[9px] uppercase font-bold tracking-tight border-r border-current/20 pr-1 shrink-0">{type}</span>
                    <span className="whitespace-nowrap">
                        <MentionContent html={label} delayDuration={delayDuration} />
                    </span>
                </span>
            </EntityPreviewTooltip>
        </span>
    )
}
