"use client"

import { useEffect, useLayoutEffect, type RefObject } from "react"
import { animate } from "framer-motion"

/** Seletor da área de conteúdo do dashboard (o `<motion.main>` de `src/app/(dashboard)/layout.tsx`). */
export const DASHBOARD_CONTENT_SELECTOR = "[data-dashboard-content]"
/** Seletor do header fixo do app (ausente no catálogo embutido no Owlbear). */
export const APP_HEADER_SELECTOR = "[data-app-header]"

export const MAXIMIZE_ENTER = { duration: 0.22, ease: "easeOut" } as const
export const MAXIMIZE_EXIT = { duration: 0.16, ease: "easeIn" } as const

/** Propriedades de estilo que o hook aplica — e somente elas são removidas ao restaurar. */
const GEOMETRY_PROPS = ["position", "top", "left", "width", "height", "max-width", "max-height", "translate", "transform", "z-index", "margin"] as const

/** Camada do elemento maximizado (acima do conteúdo da página, abaixo de popovers e modais). */
export const MAXIMIZED_Z_INDEX = 10

export interface FrameRect {
    top: number
    left: number
    width: number
    height: number
}

/** Retângulo visível da área de conteúdo, ou da janela quando fora do dashboard. */
export function dashboardContentRect(doc: Document = document): FrameRect {
    const view = doc.defaultView
    const viewWidth = view?.innerWidth ?? 0
    const viewHeight = view?.innerHeight ?? 0
    // Nada fica sob o header fixo: o topo visível começa onde ele termina.
    const header = doc.querySelector<HTMLElement>(APP_HEADER_SELECTOR)
    const visibleTop = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
    const main = doc.querySelector<HTMLElement>(DASHBOARD_CONTENT_SELECTOR)
    if (main) {
        const r = main.getBoundingClientRect()
        // Só a parte visível do `<main>` (ele rola junto com a página).
        const top = Math.max(r.top, visibleTop)
        const bottom = Math.min(r.bottom, viewHeight)
        return { top, left: r.left, width: r.width, height: Math.max(0, bottom - top) }
    }
    return { top: visibleTop, left: 0, width: viewWidth, height: Math.max(0, viewHeight - visibleTop) }
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/** Marca do elemento atualmente maximizado — restaurar só anima quem estava maximizado. */
export const MAXIMIZED_ATTR = "data-maximized"

/**
 * Remove só o que `applyFrame` aplicou. A geometria sai com a transição ainda desligada (e um
 * reflow forçado): senão uma transição CSS do elemento (ex.: `duration-200` do `DialogContent`,
 * com `transition-property: all`) faria o elemento deslizar de volta.
 */
function clearFrame(el: HTMLElement) {
    for (const prop of GEOMETRY_PROPS) el.style.removeProperty(prop)
    void el.getBoundingClientRect()
    el.style.removeProperty("transition")
    el.removeAttribute(MAXIMIZED_ATTR)
}

/**
 * Posiciona `el` exatamente sobre `rect` (coordenadas da janela) com `position: fixed`.
 *
 * Um ancestral com `transform` vira o containing block do `fixed` (ex.: o `<main>` durante a
 * animação de rota). Por isso posiciona em 0,0, mede onde o elemento realmente ficou e compensa
 * o deslocamento.
 *
 * A transição CSS do elemento é desligada: com uma transição ativa (ex.: classes `duration-*`,
 * com `transition-property: all`), a medição leria a posição ANTIGA e a compensação jogaria o
 * elemento para o lugar errado. As animações de entrada/saída são do framer-motion (opacidade/escala).
 */
export function applyFrame(el: HTMLElement, rect: FrameRect) {
    el.setAttribute(MAXIMIZED_ATTR, "")
    el.style.setProperty("transition", "none")
    el.style.setProperty("position", "fixed")
    el.style.setProperty("translate", "none")
    el.style.setProperty("transform", "none")
    el.style.setProperty("margin", "0")
    el.style.setProperty("max-width", "none")
    el.style.setProperty("max-height", "none")
    el.style.setProperty("z-index", String(MAXIMIZED_Z_INDEX))
    el.style.setProperty("top", "0px")
    el.style.setProperty("left", "0px")
    el.style.setProperty("width", `${rect.width}px`)
    el.style.setProperty("height", `${rect.height}px`)
    const origin = el.getBoundingClientRect()
    el.style.setProperty("top", `${rect.top - origin.top}px`)
    el.style.setProperty("left", `${rect.left - origin.left}px`)
}

/**
 * Maximiza o PRÓPRIO elemento sobre a área de conteúdo do dashboard, sem remontá-lo (o terminal
 * xterm mantém logs, busca e destaques). Header e tickers continuam visíveis. Acompanha resize
 * da janela e do `<main>`. Entrada e saída animadas com framer-motion
 * (fade + leve escala), imediatas com `prefers-reduced-motion`.
 */
export function useMaximizedFrame(frameRef: RefObject<HTMLElement | null>, maximized: boolean): void {
    useLayoutEffect(() => {
        const el = frameRef.current
        if (!el) return
        // Restaurar um elemento que não está maximizado (montagem, reabertura do modal): nada a fazer.
        if (!maximized && !el.hasAttribute(MAXIMIZED_ATTR)) return
        const reduced = prefersReducedMotion()
        let cancelled = false

        if (maximized) {
            applyFrame(el, dashboardContentRect(el.ownerDocument))
            if (!reduced) {
                const controls = animate(el, { opacity: [0, 1], scale: [0.97, 1] }, MAXIMIZE_ENTER)
                return () => {
                    cancelled = true
                    controls.stop()
                }
            }
            return
        }

        if (reduced) {
            clearFrame(el)
            return
        }
        const exit = animate(el, { opacity: [1, 0], scale: [1, 0.97] }, MAXIMIZE_EXIT)
        let enter: ReturnType<typeof animate> | null = null
        void exit.then(() => {
            if (cancelled) return
            clearFrame(el)
            enter = animate(el, { opacity: [0, 1], scale: [0.98, 1] }, MAXIMIZE_ENTER)
        })
        return () => {
            cancelled = true
            exit.stop()
            enter?.stop()
        }
    }, [frameRef, maximized])

    // Enquanto maximizado, acompanha a área de conteúdo.
    useEffect(() => {
        const el = frameRef.current
        if (!maximized || !el) return
        const reposition = () => applyFrame(el, dashboardContentRect(el.ownerDocument))
        const main = el.ownerDocument.querySelector<HTMLElement>(DASHBOARD_CONTENT_SELECTOR)
        const observer = typeof ResizeObserver !== "undefined" && main ? new ResizeObserver(reposition) : null
        if (main) observer?.observe(main)
        window.addEventListener("resize", reposition)
        return () => {
            observer?.disconnect()
            window.removeEventListener("resize", reposition)
        }
    }, [frameRef, maximized])

    // Desmontar maximizado não deixa estilo órfão (o elemento some junto, mas por garantia).
    useEffect(() => {
        const el = frameRef.current
        return () => {
            if (el) {
                clearFrame(el)
                el.style.removeProperty("opacity")
                el.style.removeProperty("scale")
            }
        }
    }, [frameRef])
}
