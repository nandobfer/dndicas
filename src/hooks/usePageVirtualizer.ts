"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

/**
 * Id da área que rola as páginas (o `<main>` do `AppShell`). Listas longas rolam por ela, não por
 * um container próprio com altura máxima.
 */
export const APP_SCROLL_CONTAINER_ID = "main-content"

export function getAppScrollContainer(): HTMLElement | null {
    return typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_CONTAINER_ID)
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

interface PageVirtualizerOptions {
    count: number
    estimateSize: number
    overscan?: number
    /** Altura de tela usada antes da primeira medição (e em testes, sem layout). */
    initialHeight?: number
}

/**
 * Virtualização de uma lista que rola com a página (`#main-content`): mede a posição da lista dentro
 * da área de rolagem (`scrollMargin`, recalculada quando o conteúdo acima muda de altura — ex.:
 * filtros abrindo) e informa se o topo da lista já passou (`stuck`, para sombra do cabeçalho fixo).
 * Prenda `anchorRef` no elemento que envolve a lista.
 */
export function usePageVirtualizer({ count, estimateSize, overscan = 10, initialHeight = 800 }: PageVirtualizerOptions) {
    const anchorRef = useRef<HTMLDivElement>(null)
    const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
    const [scrollMargin, setScrollMargin] = useState(0)
    const [stuck, setStuck] = useState(false)

    const measure = useCallback(() => {
        const anchor = anchorRef.current
        const container = getAppScrollContainer()
        if (!anchor || !container) return
        const offset = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
        setScrollMargin((current) => (Math.abs(current - offset) < 1 ? current : offset))
        setStuck(container.scrollTop > offset)
    }, [])

    useIsomorphicLayoutEffect(() => {
        const container = getAppScrollContainer()
        setScrollElement(container)
        measure()
        if (!container) return
        container.addEventListener("scroll", measure, { passive: true })
        window.addEventListener("resize", measure)
        // O que está acima da lista (filtros, cabeçalho) muda de altura sem rolar: mede de novo.
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
        const page = container.firstElementChild
        if (observer && page) observer.observe(page)
        return () => {
            container.removeEventListener("scroll", measure)
            window.removeEventListener("resize", measure)
            observer?.disconnect()
        }
    }, [measure])

    // eslint-disable-next-line react-hooks/incompatible-library -- padrão do TanStack Virtual
    const virtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollElement,
        estimateSize: () => estimateSize,
        overscan,
        scrollMargin,
        initialRect: { width: 0, height: initialHeight },
    })

    const items = virtualizer.getVirtualItems()
    const padTop = Math.max(0, (items[0]?.start ?? scrollMargin) - scrollMargin)
    const padBottom = Math.max(0, virtualizer.getTotalSize() - ((items.at(-1)?.end ?? scrollMargin) - scrollMargin))

    return { anchorRef, virtualizer, items, padTop, padBottom, stuck }
}
