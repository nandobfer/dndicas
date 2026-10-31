"use client"

/**
 * @fileoverview Navegação do header desktop: "Início" (link direto) e as categorias, que abrem um
 * container glass no hover (mouse) e no clique (toque). Fecha com Esc, clique fora, escolha de item
 * ou mudança de rota. Navegável pelo teclado (↓/Enter/Espaço abrem; ↑/↓/Home/End percorrem).
 */

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/core/utils"
import { useClickAway } from "@/core/hooks/useClickAway"
import { HOME_HREF, type ActiveNav, type NavCategory, type NavCategoryId } from "@/lib/config/navigation"

/** Tempo para sair do botão e chegar ao container sem fechá-lo. */
export const CATEGORY_CLOSE_DELAY_MS = 150
/** Distância mínima entre o container e as bordas da janela. */
export const PANEL_VIEWPORT_MARGIN = 10
const PANEL_WIDE_WIDTH = 440
const PANEL_NARROW_WIDTH = 260
const panelWidthFor = (category: NavCategory) => (category.items.length > 5 ? PANEL_WIDE_WIDTH : PANEL_NARROW_WIDTH)

/**
 * Posição do container (relativa ao grupo de links): a borda esquerda alinha com a da categoria
 * aberta, sem deixar o container sair da janela.
 */
export function anchorPanelLeft(root: { left: number }, trigger: { left: number }, panelWidth: number, viewportWidth: number, margin = PANEL_VIEWPORT_MARGIN) {
    const maxLeft = viewportWidth - margin - panelWidth - root.left
    const minLeft = margin - root.left
    return Math.round(Math.max(minLeft, Math.min(trigger.left - root.left, maxLeft)))
}
const PANEL_ID = "header-category-panel"

export const headerNavLinkClass = (active: boolean, open = false) =>
    cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        active ? "bg-white/15 text-white" : open ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
    )

interface HeaderCategoryMenuProps {
    categories: NavCategory[]
    active: ActiveNav
    pathname: string
}

export function HeaderCategoryMenu({ categories, active, pathname }: HeaderCategoryMenuProps) {
    const [openId, setOpenId] = React.useState<NavCategoryId | null>(null)
    const [focusFirst, setFocusFirst] = React.useState(false)
    const rootRef = React.useRef<HTMLDivElement>(null)
    const triggerRefs = React.useRef(new Map<NavCategoryId, HTMLButtonElement>())
    const itemRefs = React.useRef<HTMLAnchorElement[]>([])
    const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    /** Tipo do ponteiro que iniciou o clique atual (nulo no clique por teclado). */
    const clickPointerType = React.useRef<string | null>(null)
    const reduceMotion = useReducedMotion() ?? false

    const cancelClose = React.useCallback(() => {
        if (closeTimer.current) clearTimeout(closeTimer.current)
        closeTimer.current = null
    }, [])
    const close = React.useCallback(() => {
        cancelClose()
        setOpenId(null)
    }, [cancelClose])
    const scheduleClose = React.useCallback(() => {
        cancelClose()
        closeTimer.current = setTimeout(() => setOpenId(null), CATEGORY_CLOSE_DELAY_MS)
    }, [cancelClose])

    useClickAway(rootRef, () => {
        if (openId) close()
    })

    React.useEffect(() => close(), [pathname, close])
    React.useEffect(() => cancelClose, [cancelClose])

    // A categoria some (ex.: perdeu a permissão): fecha o container.
    React.useEffect(() => {
        if (openId && !categories.some((category) => category.id === openId)) setOpenId(null)
    }, [categories, openId])

    React.useEffect(() => {
        if (!focusFirst || !openId) return
        itemRefs.current[0]?.focus()
        setFocusFirst(false)
    }, [focusFirst, openId])

    // Esc fecha mesmo com o container aberto só pelo hover (foco fora do menu); o foco volta à
    // categoria apenas quando estava dentro do menu.
    React.useEffect(() => {
        if (!openId) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            const focusWasInside = Boolean(rootRef.current?.contains(document.activeElement))
            cancelClose()
            setOpenId(null)
            if (focusWasInside) triggerRefs.current.get(openId)?.focus()
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [openId, cancelClose])

    const openCategory = categories.find((category) => category.id === openId) ?? null
    const openPanelWidth = openCategory ? panelWidthFor(openCategory) : 0
    const [panelLeft, setPanelLeft] = React.useState(0)

    // Um único container: ao trocar de categoria ele é reposicionado sob a nova, sem remontar.
    React.useLayoutEffect(() => {
        if (!openId) return
        const measure = () => {
            const root = rootRef.current
            const trigger = triggerRefs.current.get(openId)
            if (!root || !trigger) return
            setPanelLeft(anchorPanelLeft(root.getBoundingClientRect(), trigger.getBoundingClientRect(), openPanelWidth, window.innerWidth))
        }
        measure()
        window.addEventListener("resize", measure)
        return () => window.removeEventListener("resize", measure)
    }, [openId, openPanelWidth])
    itemRefs.current = []

    const onTriggerKeyDown = (event: React.KeyboardEvent, id: NavCategoryId) => {
        if (event.key === "ArrowDown" || ((event.key === "Enter" || event.key === " ") && openId !== id)) {
            event.preventDefault()
            cancelClose()
            setOpenId(id)
            setFocusFirst(true)
        }
    }

    const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
        const items = itemRefs.current.filter(Boolean)
        const target =
            event.key === "ArrowDown" ? (index + 1) % items.length
            : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
            : event.key === "Home" ? 0
            : event.key === "End" ? items.length - 1
            : null
        if (target === null) return
        event.preventDefault()
        items[target]?.focus()
    }

    return (
        <div
            ref={rootRef}
            className="relative flex items-center gap-1"
            onPointerEnter={(event) => event.pointerType === "mouse" && cancelClose()}
            onPointerLeave={(event) => event.pointerType === "mouse" && openId && scheduleClose()}
        >
            <Link href={HOME_HREF} className={headerNavLinkClass(active?.kind === "home")} aria-current={active?.kind === "home" ? "page" : undefined}>
                Início
            </Link>

            {categories.map((category) => {
                const isOpen = openId === category.id
                const isActive = active?.kind === "item" && active.categoryId === category.id
                return (
                    <button
                        key={category.id}
                        ref={(node) => {
                            if (node) triggerRefs.current.set(category.id, node)
                            else triggerRefs.current.delete(category.id)
                        }}
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? PANEL_ID : undefined}
                        data-active={isActive ? "true" : undefined}
                        className={headerNavLinkClass(isActive, isOpen)}
                        onPointerEnter={(event) => {
                            if (event.pointerType !== "mouse") return
                            cancelClose()
                            setOpenId(category.id)
                        }}
                        onPointerDown={(event) => {
                            clickPointerType.current = event.pointerType
                        }}
                        onClick={() => {
                            const pointerType = clickPointerType.current
                            clickPointerType.current = null
                            cancelClose()
                            // Com mouse, o hover já abriu: o clique mantém aberto em vez de fechar.
                            // Toque e teclado alternam.
                            if (pointerType === "mouse") setOpenId(category.id)
                            else setOpenId((current) => (current === category.id ? null : category.id))
                        }}
                        onKeyDown={(event) => onTriggerKeyDown(event, category.id)}
                    >
                        {category.label}
                        <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", isOpen && "rotate-180")} aria-hidden />
                    </button>
                )
            })}

            <AnimatePresence>
                {openCategory && (
                    <motion.div
                        key="header-category-panel"
                        id={PANEL_ID}
                        role="region"
                        aria-label={openCategory.label}
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                        style={{ left: `${panelLeft}px` }}
                        className={cn("absolute top-[calc(100%+12px)] z-50", !reduceMotion && "transition-[left] duration-150 ease-out")}
                    >
                        <motion.div
                            layout={!reduceMotion}
                            className="overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
                        >
                            <ul className={cn("grid gap-1", openPanelWidth === PANEL_WIDE_WIDTH ? "w-[440px] grid-cols-2" : "w-[260px] grid-cols-1")}>
                                {openCategory.items.map((item, index) => {
                                    const isItemActive = active?.kind === "item" && active.href === item.href
                                    const Icon = item.icon
                                    return (
                                        <li key={item.href}>
                                            <Link
                                                ref={(node) => {
                                                    if (node) itemRefs.current[index] = node
                                                }}
                                                href={item.href}
                                                aria-current={isItemActive ? "page" : undefined}
                                                onClick={close}
                                                onKeyDown={(event) => onItemKeyDown(event, index)}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                                                    isItemActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                                                )}
                                            >
                                                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                                                <span className="truncate">{item.label}</span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
