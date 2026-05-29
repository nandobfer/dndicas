import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/core/utils'
import { glassConfig } from '@/lib/config/glass-config'
import { entityColors } from "@/lib/config/colors"
import { DebounceProgress } from "@/components/ui/debounce-progress"
import { GlassPopover, GlassPopoverAnchor, GlassPopoverContent } from "@/components/ui/glass-popover"
import { EntityPreviewPanel } from "./entity-preview-tooltip"
import { Scroll, Sparkles, Zap, Wand, Sword, ShieldCheck, Box, Fingerprint, GraduationCap, Skull, type LucideIcon } from "lucide-react"
import { MONSTER_TYPE_LABELS } from "@/features/monsters/components/monster-options"
import type { MonsterType } from "@/features/monsters/types/monsters.types"

const PREVIEW_OPEN_DELAY = 300
const PREVIEW_CLOSE_DELAY = 180

interface MentionListItem {
    id: string
    label: string
    entityType?: string
    circle?: number
    school?: string
    itemType?: string
    rarity?: string
    price?: string
    metadata?: {
        parentClassName?: string
        challengeRating?: string | number
        monsterType?: unknown
        [key: string]: unknown
    }
    [key: string]: unknown
}

const entityIcons: Record<string, LucideIcon> = {
    Regra: Scroll,
    Habilidade: Sparkles,
    Talento: Zap,
    Magia: Wand,
    Classe: Sword,
    Subclasse: GraduationCap,
    Origem: ShieldCheck,
    Item: Box,
    Raça: Fingerprint,
    Monstro: Skull,
}

const getMonsterTypeLabel = (value: unknown) => {
    return typeof value === "string" && value in MONSTER_TYPE_LABELS
        ? MONSTER_TYPE_LABELS[value as MonsterType]
        : typeof value === "string"
            ? value
            : null
}

export interface MentionListProps {
    items: MentionListItem[]
    command: (item: MentionListItem) => void
    query?: string
    loading?: boolean
}

export interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionList = forwardRef<MentionListRef, MentionListProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [previewItem, setPreviewItem] = useState<MentionListItem | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewAnchorTop, setPreviewAnchorTop] = useState(0)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const listRef = useRef<HTMLDivElement | null>(null)
    const itemRefs = useRef(new Map<string, HTMLButtonElement | null>())
    const openTimeoutRef = useRef<number | null>(null)
    const closeTimeoutRef = useRef<number | null>(null)

    const clearOpenTimeout = useCallback(() => {
        if (openTimeoutRef.current !== null) {
            window.clearTimeout(openTimeoutRef.current)
            openTimeoutRef.current = null
        }
    }, [])

    const clearCloseTimeout = useCallback(() => {
        if (closeTimeoutRef.current !== null) {
            window.clearTimeout(closeTimeoutRef.current)
            closeTimeoutRef.current = null
        }
    }, [])

    const clearPreviewTimers = useCallback(() => {
        clearOpenTimeout()
        clearCloseTimeout()
    }, [clearCloseTimeout, clearOpenTimeout])

    const updatePreviewAnchorTop = useCallback((itemId: string) => {
        const container = containerRef.current
        const itemElement = itemRefs.current.get(itemId)

        if (!container || !itemElement) {
            return
        }

        const containerRect = container.getBoundingClientRect()
        const itemRect = itemElement.getBoundingClientRect()
        const nextAnchorTop = itemRect.top - containerRect.top + itemRect.height / 2
        setPreviewAnchorTop(Math.max(0, nextAnchorTop))
    }, [])

    const selectItem = useCallback((index: number) => {
        const item = props.items[index]

        if (item) {
            props.command(item)
        }
    }, [props])

    const upHandler = useCallback(() => {
        setSelectedIndex((currentIndex) => (currentIndex + props.items.length - 1) % props.items.length)
    }, [props.items.length])

    const downHandler = useCallback(() => {
        setSelectedIndex((currentIndex) => (currentIndex + 1) % props.items.length)
    }, [props.items.length])

    const enterHandler = useCallback(() => {
        selectItem(selectedIndex)
    }, [selectItem, selectedIndex])

    const closePreview = useCallback(() => {
        clearPreviewTimers()
        setPreviewOpen(false)
        setPreviewItem(null)
    }, [clearPreviewTimers])

    const schedulePreviewClose = useCallback(() => {
        clearOpenTimeout()
        clearCloseTimeout()
        closeTimeoutRef.current = window.setTimeout(() => {
            setPreviewOpen(false)
            setPreviewItem(null)
            closeTimeoutRef.current = null
        }, PREVIEW_CLOSE_DELAY)
    }, [clearCloseTimeout, clearOpenTimeout])

    const openPreviewForItem = useCallback((item: MentionListItem, immediate = false) => {
        clearCloseTimeout()
        clearOpenTimeout()
        setPreviewItem(item)
        updatePreviewAnchorTop(item.id)

        if (immediate || previewOpen) {
            setPreviewOpen(true)
            return
        }

        openTimeoutRef.current = window.setTimeout(() => {
            setPreviewOpen(true)
            updatePreviewAnchorTop(item.id)
            openTimeoutRef.current = null
        }, PREVIEW_OPEN_DELAY)
    }, [clearCloseTimeout, clearOpenTimeout, previewOpen, updatePreviewAnchorTop])

    const handleItemMouseEnter = useCallback((item: MentionListItem, index: number) => {
        setSelectedIndex(index)
        openPreviewForItem(item, previewOpen)
    }, [openPreviewForItem, previewOpen])

    const setItemRef = useCallback((itemId: string, node: HTMLButtonElement | null) => {
        if (node) {
            itemRefs.current.set(itemId, node)
            return
        }

        itemRefs.current.delete(itemId)
    }, [])

    useEffect(() => {
        setSelectedIndex(0)
    }, [props.items])

    useEffect(() => {
        if (!previewItem) {
            return
        }

        const itemStillExists = props.items.some((item) => item.id === previewItem.id)
        if (!itemStillExists) {
            closePreview()
        }
    }, [closePreview, previewItem, props.items])

    useEffect(() => {
        if (!previewItem) {
            return
        }

        updatePreviewAnchorTop(previewItem.id)

        const handleViewportChange = () => {
            updatePreviewAnchorTop(previewItem.id)
        }

        const listElement = listRef.current
        listElement?.addEventListener("scroll", handleViewportChange, { passive: true })
        window.addEventListener("resize", handleViewportChange)

        return () => {
            listElement?.removeEventListener("scroll", handleViewportChange)
            window.removeEventListener("resize", handleViewportChange)
        }
    }, [previewItem, updatePreviewAnchorTop])

    useEffect(() => {
        const selectedItem = props.items[selectedIndex]
        if (!selectedItem) {
            return
        }

        const selectedElement = itemRefs.current.get(selectedItem.id)
        if (typeof selectedElement?.scrollIntoView === "function") {
            selectedElement.scrollIntoView({ block: "nearest" })
        }
    }, [props.items, selectedIndex])

    useEffect(() => {
        return () => {
            clearPreviewTimers()
        }
    }, [clearPreviewTimers])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === "ArrowUp") {
                upHandler()
                return true
            }

            if (event.key === "ArrowDown") {
                downHandler()
                return true
            }

            if (event.key === "Enter") {
                enterHandler()
                return true
            }

            return false
        },
    }))

    return (
        <GlassPopover open={previewOpen && !!previewItem} onOpenChange={setPreviewOpen}>
            <div ref={containerRef} className="relative overflow-visible">
                <div
                    ref={listRef}
                    data-mention-interaction-surface="suggestion-list"
                    className={cn(
                        "flex flex-col gap-1 p-1 rounded-lg overflow-auto max-h-[250px] min-w-[200px] shadow-2xl z-[9999] relative",
                        glassConfig.sidebar.background,
                        glassConfig.sidebar.blur,
                        "border border-white/10 pointer-events-auto",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onWheel={(event) => event.stopPropagation()}
                    style={{ isolation: "isolate", pointerEvents: "all" }}
                >
                    {props.items.length > 0 ? (
                        props.items.map((item, index) => (
                            <button
                                key={item.id}
                                ref={(node) => setItemRef(item.id, node)}
                                type="button"
                                onMouseEnter={() => handleItemMouseEnter(item, index)}
                                onMouseLeave={schedulePreviewClose}
                                onClick={() => selectItem(index)}
                                className={cn(
                                    "flex flex-col w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer relative z-10",
                                    selectedIndex === index ? "bg-white/20" : "hover:bg-white/10",
                                )}
                                style={{ pointerEvents: "auto" }}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                        {item.entityType &&
                                            (() => {
                                                const Icon = entityIcons[item.entityType] || Scroll
                                                return <Icon className="w-3.5 h-3.5 opacity-50 shrink-0" />
                                            })()}
                                        <span className="text-sm font-medium text-white truncate max-w-[150px]">{item.label}</span>
                                        {item.entityType === "Subclasse" && item.metadata?.parentClassName && (
                                            <span className="text-[10px] text-white/35 truncate max-w-[120px]">de {item.metadata.parentClassName}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {item.entityType === "Magia" && (
                                            <div className="flex items-center gap-1.5 mr-1">
                                                <span className="text-[9px] text-white/40 italic">{item.circle === 0 ? "Truque" : `${item.circle}º Círculo`}</span>
                                                <span className="text-[9px] text-white/40">•</span>
                                                <span className="text-[9px] text-white/40">{item.school}</span>
                                            </div>
                                        )}
                                        {item.entityType === "Item" && (
                                            <div className="flex items-center gap-1.5 mr-1">
                                                <span className="text-[9px] text-white/40 italic capitalize">{item.itemType}</span>
                                                <span className="text-[9px] text-white/40">•</span>
                                                <span className="text-[9px] text-white/40 capitalize">{item.rarity}</span>
                                                {item.price && (
                                                    <>
                                                        <span className="text-[9px] text-white/40">•</span>
                                                        <span className="text-[9px] text-white/40">{item.price}</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {item.entityType === "Monstro" && (
                                            <div className="flex items-center gap-1.5 mr-1">
                                                {item.metadata?.challengeRating && (
                                                    <span className="text-[9px] text-white/40 italic">CR {item.metadata.challengeRating}</span>
                                                )}
                                                {item.metadata?.challengeRating && getMonsterTypeLabel(item.metadata?.monsterType) && (
                                                    <span className="text-[9px] text-white/40">•</span>
                                                )}
                                                {getMonsterTypeLabel(item.metadata?.monsterType) && (
                                                    <span className="text-[9px] text-white/40">{getMonsterTypeLabel(item.metadata?.monsterType)}</span>
                                                )}
                                            </div>
                                        )}
                                        {item.entityType && (
                                            <span
                                                className={cn(
                                                    "text-[9px] uppercase font-bold tracking-tight px-1.5 py-0.5 rounded transition-all",
                                                    entityColors[item.entityType as keyof typeof entityColors]?.badge || "bg-gray-400/20 text-white/40 font-bold",
                                                )}
                                            >
                                                {item.entityType}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))
                    ) : props.loading ? (
                        <div className="px-3 py-4 text-sm text-white/40 text-center animate-pulse">Buscando...</div>
                    ) : (
                        <div className="px-3 py-3 text-sm text-white/40 text-center italic">Nenhum resultado encontrado</div>
                    )}

                    <DebounceProgress isAnimating={props.loading ?? false} duration={500} animationKey={props.query} />
                </div>

                {previewItem && (
                    <GlassPopoverAnchor asChild>
                        <div
                            aria-hidden
                            className="absolute left-full top-0 h-px w-px pointer-events-none"
                            style={{ top: previewAnchorTop }}
                        />
                    </GlassPopoverAnchor>
                )}

                {previewItem && (
                    <GlassPopoverContent
                        data-mention-interaction-surface="entity-preview"
                        side="right"
                        sideOffset={12}
                        align="center"
                        className="w-[min(24rem,calc(100vw-3rem))] max-h-[420px] overflow-auto"
                        onMouseEnter={clearCloseTimeout}
                        onMouseLeave={schedulePreviewClose}
                        onOpenAutoFocus={(event) => event.preventDefault()}
                        onWheel={(event) => event.stopPropagation()}
                        style={{ isolation: "isolate" }}
                    >
                        <EntityPreviewPanel
                            entityId={previewItem.id}
                            entityType={previewItem.entityType || "Regra"}
                            enabled={previewOpen}
                        />
                    </GlassPopoverContent>
                )}
            </div>
        </GlassPopover>
    )
})

MentionList.displayName = 'MentionList'

export default MentionList
