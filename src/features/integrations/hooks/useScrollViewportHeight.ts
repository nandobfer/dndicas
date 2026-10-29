"use client"

import { useEffect, useState, type RefObject } from "react"

/** Ancestral rolável mais próximo (no dashboard, o `<main>` do `DashboardShell`). */
export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
    let node = element?.parentElement ?? null
    while (node) {
        const { overflowY } = getComputedStyle(node)
        if (overflowY === "auto" || overflowY === "scroll") return node
        node = node.parentElement
    }
    return null
}

/** Altura visível do contêiner rolável descontando o padding vertical dele. */
export function visibleContentHeight(container: HTMLElement): number {
    const style = getComputedStyle(container)
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    return Math.max(0, container.clientHeight - padding)
}

/**
 * Altura exata da área visível do contêiner rolável que envolve `ref` — acompanha resize da
 * janela e a entrada/saída dos tickers (via `ResizeObserver`). `undefined` até medir.
 */
export function useScrollViewportHeight(ref: RefObject<HTMLElement | null>, enabled = true): number | undefined {
    const [height, setHeight] = useState<number>()

    useEffect(() => {
        if (!enabled) return
        const container = findScrollParent(ref.current)
        if (!container) return

        if (typeof ResizeObserver === "undefined") return
        // O `ResizeObserver` dispara uma vez ao observar: é a medição inicial.
        const observer = new ResizeObserver(() => setHeight(visibleContentHeight(container)))
        observer.observe(container)
        return () => observer.disconnect()
    }, [ref, enabled])

    return enabled ? height : undefined
}

/**
 * Altura para um bloco preencher a área visível do contêiner rolável a partir do seu próprio topo.
 * A medida é estável (não muda com a rolagem) e nunca fica abaixo de `minHeight`, para o conteúdo
 * não colapsar quando o cabeçalho/filtros acima forem altos — nesse caso a própria página rola.
 * Acompanha o resize da janela e mudanças de altura do que está acima (via `ResizeObserver`).
 */
export function useFillViewportHeight(ref: RefObject<HTMLElement | null>, enabled = true, minHeight = 320): number | undefined {
    const [height, setHeight] = useState<number>()

    useEffect(() => {
        if (!enabled) return
        const element = ref.current
        const container = findScrollParent(element)
        if (!element || !container || typeof ResizeObserver === "undefined") return

        const compute = () => {
            const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0
            // Deslocamento do topo do bloco dentro do conteúdo (independe da rolagem).
            const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - paddingTop
            setHeight(Math.max(minHeight, Math.round(visibleContentHeight(container) - offset)))
        }

        const observer = new ResizeObserver(compute)
        observer.observe(container)
        // O que fica acima (cabeçalho, filtros) muda de altura sem rolar: mede de novo.
        const page = container.firstElementChild
        if (page) observer.observe(page)
        compute()
        window.addEventListener("resize", compute)
        return () => {
            observer.disconnect()
            window.removeEventListener("resize", compute)
        }
    }, [ref, enabled, minHeight])

    return enabled ? height : undefined
}
