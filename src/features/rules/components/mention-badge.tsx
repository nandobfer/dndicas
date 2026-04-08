"use client"

import * as React from "react"
import { useMemo } from "react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { EntityPreviewTooltip } from "./entity-preview-tooltip"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import type { DiceType } from "@/features/spells/types/spells.types"
import {
    diceFuse,
    DICE_UNIFIED_REGEX,
    DICE_LOOKAHEAD_REGEX,
    decodeHTMLEntities,
} from "../utils/dice-render-utils"
export { EntityTitleLink } from "./entity-title-link"

interface MentionBadgeProps {
    id: string
    label: string
    type?: string
    className?: string
    delayDuration?: number
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
    const isMobile = useIsMobile()
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
                const text = node.textContent || ""

                const elements: React.ReactNode[] = []
                let lastIndex = 0

                // Unified regex (reused from dice-render-utils; must reset lastIndex each call)
                const unifiedRegex = new RegExp(DICE_UNIFIED_REGEX.source, DICE_UNIFIED_REGEX.flags)

                let match
                while ((match = unifiedRegex.exec(text)) !== null) {
                    const matchIndex = match.index

                    if (matchIndex > lastIndex) {
                        elements.push(text.substring(lastIndex, matchIndex))
                    }

                    const [fullMatch, qty, faces, bracketType, naturalType] = match

                    // Se for um dado (match no grupo 1/2)
                    if (qty && faces) {
                        const quantidade = parseInt(qty, 10)
                        const tipo = `d${faces}` as DiceType

                        // Se houver tipo em colchetes, usamos Fuse para encontrar a cor e ESCONDEMOS o colchete
                        if (bracketType) {
                            const fuseResult = diceFuse.search(bracketType)
                            const item = fuseResult.length > 0 ? fuseResult[0].item : null

                            elements.push(
                                <GlassDiceValue
                                    key={`dice-bracket-${index}-${matchIndex}`}
                                    value={{ quantidade, tipo }}
                                    colorOverride={item ? { text: `text-[${item.hex}]`, bgAlpha: item.color.bgAlpha } : undefined}
                                    className="mx-0.5"
                                />,
                            )
                        } else {
                            // Espiar o texto seguinte por contexto de dano natural
                            const remainingText = text.substring(unifiedRegex.lastIndex)
                            const nextNaturalMatch = DICE_LOOKAHEAD_REGEX.exec(remainingText)

                            let colorOverride = undefined
                            if (nextNaturalMatch) {
                                const nextType = nextNaturalMatch[1]
                                const fuseResult = diceFuse.search(nextType)
                                if (fuseResult.length > 0) {
                                    const item = fuseResult[0].item
                                    colorOverride = { text: `text-[${item.hex}]`, bgAlpha: item.color.bgAlpha }
                                }
                            }

                            elements.push(<GlassDiceValue key={`dice-simple-${index}-${matchIndex}`} value={{ quantidade, tipo }} colorOverride={colorOverride} className="mx-0.5" />)
                        }
                    }
                    // Se for um texto de dano natural (match no grupo 4)
                    else if (naturalType) {
                        const fuseResult = diceFuse.search(naturalType)
                        const item = fuseResult.length > 0 ? fuseResult[0].item : null

                        if (item) {
                            elements.push(
                                <span key={`natural-dmg-${index}-${matchIndex}`} className="font-medium transition-colors" style={{ color: item.hex }}>
                                    {fullMatch}
                                </span>,
                            )
                        } else {
                            elements.push(fullMatch)
                        }
                    }

                    lastIndex = unifiedRegex.lastIndex
                }

                if (lastIndex < text.length) {
                    elements.push(text.substring(lastIndex))
                }

                if (elements.length === 0) return text
                return <React.Fragment key={`text-parts-${index}`}>{elements}</React.Fragment>
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement
                const tagName = el.tagName.toLowerCase()

                // Special handling for DiceValue nodes (saved by RichTextEditor)
                if (tagName === "span" && el.getAttribute("data-type") === "dice-value") {
                    const qty = parseInt(el.getAttribute("data-qty") || "1", 10)
                    const faces = parseInt(el.getAttribute("data-faces") || "6", 10)
                    const colorHex = el.getAttribute("data-color-hex") || undefined
                    const tipo = `d${faces}` as DiceType
                    return (
                        <GlassDiceValue
                            key={`dice-node-${index}`}
                            value={{ quantidade: qty, tipo }}
                            colorOverride={colorHex ? { text: colorHex } : undefined}
                            className="mx-0.5"
                        />
                    )
                }

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
                            <img
                                key={`img-${index}`}
                                src={src}
                                style={{ width: isMobile ? "100%" : imageWidth, height: "auto" }}
                                className="rounded-lg border border-white/20 max-w-full block my-2"
                                alt="Content Image"
                            />
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
    }, [html, delayDuration, mode, isMounted, isMobile, imageWidth])

    if (mode === "block") {
        return (
            <div
                className={cn(
                    "prose prose-invert prose-xs max-w-none",
                    "prose-p:my-0 [&_p+p]:mt-2 prose-headings:mb-4 prose-headings:mt-6",
                    "prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5",
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
        const typeKey = (t in entityColors ? t : "Regra") as keyof typeof entityColors
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
