"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/opex/popover"
import { COMMENT_HIGHLIGHT, FLASH_HIGHLIGHT, setHighlightRanges } from "@/lib/markdown/highlights"
import { quoteOf } from "@/lib/markdown/lines"
import { caretAt, lineElements, rangeEndRect, readSelection, selectionRange, type MarkdownSelection } from "@/lib/markdown/selection"
import type { MarkdownHighlight, MarkdownLineAction, MarkdownLineContext } from "./markdown-line-action"

/**
 * Ação sobre o texto selecionado de um `Markdown` com `lineAction`: ao selecionar, um botão flutuante
 * aparece no fim da seleção e abre a mesma ação da linha com o trecho (`context.selection`). Também
 * sublinha os trechos já comentados (`highlights`, Highlight API) — clicar num deles abre a ação com
 * o trecho — e dá o flash no trecho de `flash.selection`.
 */

interface Current {
    context: MarkdownLineContext
    range: Range
    rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }
}

const EMPTY_RECT = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }
const SETTLE_MS = 120
const FLASH_MS = 1600

const rectOf = (range: Range) => {
    const rect = rangeEndRect(range)
    return rect ? { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width, height: rect.height } : EMPTY_RECT
}

function contextOf(anchor: HTMLElement, source: string, selection: MarkdownSelection): MarkdownLineContext {
    const line = Number(anchor.dataset.mdLine)
    const endLine = Number(anchor.dataset.mdLineEnd) || line
    const code = anchor.dataset.mdCode !== undefined
    return { line, endLine, code, text: quoteOf(source, line, endLine, { code }), selection }
}

interface Hit {
    anchor: HTMLElement
    highlight: MarkdownHighlight
    range: Range
}

export function MarkdownSelectionLayer({ rootRef, action, source }: { rootRef: RefObject<HTMLDivElement | null>; action: MarkdownLineAction; source: string }) {
    const [current, setCurrent] = useState<Current | null>(null)
    const [open, setOpen] = useState(false)
    const openRef = useRef(false)
    const pointerDown = useRef(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hits = useRef<Hit[]>([])
    const owner = useRef({})
    const enabled = action.selectionLabel !== false

    const update = useCallback(() => {
        const root = rootRef.current
        if (!root || openRef.current || pointerDown.current) return
        const read = readSelection(root, window.getSelection())
        setCurrent(read ? { context: contextOf(read.anchor, source, read.selection), range: read.range, rect: rectOf(read.range) } : null)
    }, [rootRef, source])

    const schedule = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(update, SETTLE_MS)
    }, [update])

    useEffect(() => {
        openRef.current = open
    }, [open])

    const setOpenState = useCallback((value: boolean) => {
        setOpen(value)
        if (!value) setCurrent(null)
    }, [])

    // Seleção: só mostra depois de soltar o mouse/tecla (selectionchange contínuo durante o arraste).
    useEffect(() => {
        if (!enabled) return
        const onDown = (event: PointerEvent) => {
            if ((event.target as Element | null)?.closest?.("[data-md-selection-action]")) return
            pointerDown.current = true
        }
        const onUp = () => {
            pointerDown.current = false
            schedule()
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !openRef.current) setCurrent(null)
        }
        const onScroll = () => setCurrent((value) => (value && !openRef.current ? { ...value, rect: rectOf(value.range) } : value))
        document.addEventListener("selectionchange", schedule)
        document.addEventListener("pointerdown", onDown, true)
        document.addEventListener("pointerup", onUp, true)
        document.addEventListener("mouseup", onUp, true)
        document.addEventListener("keydown", onKey)
        window.addEventListener("scroll", onScroll, true)
        window.addEventListener("resize", onScroll)
        return () => {
            if (timer.current) clearTimeout(timer.current)
            document.removeEventListener("selectionchange", schedule)
            document.removeEventListener("pointerdown", onDown, true)
            document.removeEventListener("pointerup", onUp, true)
            document.removeEventListener("mouseup", onUp, true)
            document.removeEventListener("keydown", onKey)
            window.removeEventListener("scroll", onScroll, true)
            window.removeEventListener("resize", onScroll)
        }
    }, [enabled, schedule])

    // Trechos comentados: sublinhado (Highlight API) e alvo de clique.
    useEffect(() => {
        const root = rootRef.current
        const key = owner.current
        if (!root || !action.highlights) return
        const found: Hit[] = []
        for (const anchor of lineElements(root)) {
            for (const highlight of action.highlights(Number(anchor.dataset.mdLine))) {
                const range = selectionRange(root, anchor, highlight.selection)
                if (range) found.push({ anchor, highlight, range })
            }
        }
        hits.current = found
        setHighlightRanges(COMMENT_HIGHLIGHT, key, found.map((hit) => hit.range))
        return () => {
            hits.current = []
            setHighlightRanges(COMMENT_HIGHLIGHT, key, [])
        }
    }, [rootRef, action, source])

    // Clique num trecho sublinhado abre a ação com o trecho.
    useEffect(() => {
        const root = rootRef.current
        if (!root) return
        const onClick = (event: MouseEvent) => {
            if (!hits.current.length || !window.getSelection()?.isCollapsed) return
            if ((event.target as Element | null)?.closest?.("[data-md-line-action], a, button")) return
            const point = caretAt(event.clientX, event.clientY)
            if (!point) return
            const hit = hits.current.find((item) => {
                try {
                    return item.range.isPointInRange(point.node, point.offset)
                } catch {
                    return false
                }
            })
            if (!hit) return
            const selection: MarkdownSelection = { startLine: hit.highlight.selection.startLine ?? Number(hit.anchor.dataset.mdLine), ...hit.highlight.selection }
            const context = contextOf(hit.anchor, source, selection)
            if (action.renderPopover) {
                openRef.current = true
                setCurrent({ context, range: hit.range, rect: rectOf(hit.range) })
                setOpen(true)
            } else action.onSelect?.(context)
        }
        root.addEventListener("click", onClick)
        return () => root.removeEventListener("click", onClick)
    }, [rootRef, action, source])

    // Flash no trecho ao "Ir para a linha".
    const flashKey = action.flash?.selection ? action.flash.key : null
    useEffect(() => {
        const root = rootRef.current
        const flash = action.flash
        const key = owner.current
        if (!root || flashKey === null || !flash?.selection) return
        const anchor = root.querySelector<HTMLElement>(`[data-md-line="${flash.line}"]`)
        const range = anchor ? selectionRange(root, anchor, flash.selection) : null
        if (!range) return
        setHighlightRanges(FLASH_HIGHLIGHT, key, [range])
        const timeout = setTimeout(() => setHighlightRanges(FLASH_HIGHLIGHT, key, []), FLASH_MS)
        return () => {
            clearTimeout(timeout)
            setHighlightRanges(FLASH_HIGHLIGHT, key, [])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à troca da chave do flash
    }, [flashKey, rootRef])

    const virtualRef = useMemo(() => ({ current: { getBoundingClientRect: () => DOMRect.fromRect(current ? { x: current.rect.left, y: current.rect.top, width: current.rect.width, height: current.rect.height } : undefined) } }), [current])

    const select = () => {
        if (!current) return
        if (action.renderPopover) {
            setOpen(true)
            return
        }
        action.onSelect?.(current.context)
        window.getSelection()?.removeAllRanges()
        setCurrent(null)
    }

    if (typeof document === "undefined") return null
    const Icon = action.icon
    const label = (typeof action.selectionLabel === "string" && action.selectionLabel) || action.label
    const top = Math.min(current ? current.rect.bottom + 6 : 0, window.innerHeight - 32)
    const left = Math.max(8, Math.min(current ? current.rect.right - 12 : 0, window.innerWidth - 36))

    return (
        <>
            {createPortal(
                <AnimatePresence>
                    {current && !open && (
                        <motion.button
                            key="selection-action"
                            type="button"
                            data-md-selection-action
                            aria-label={label}
                            title={label}
                            initial={{ opacity: 0, scale: 0.8, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                            style={{ position: "fixed", top, left }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={select}
                            className="z-50 inline-flex h-7 w-7 items-center justify-center rounded-md border bg-popover text-primary shadow-md hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <Icon className="h-4 w-4" aria-hidden />
                        </motion.button>
                    )}
                </AnimatePresence>,
                document.body,
            )}
            {action.renderPopover && (
                <Popover open={open && Boolean(current)} onOpenChange={setOpenState}>
                    <PopoverAnchor virtualRef={virtualRef} />
                    <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-3" onClick={(event) => event.stopPropagation()}>
                        {open && current && action.renderPopover({ ...current.context, close: () => setOpenState(false) })}
                    </PopoverContent>
                </Popover>
            )}
        </>
    )
}
