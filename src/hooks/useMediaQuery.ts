"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Consulta de mídia reativa. Antes da primeira medição (SSR) devolve `false`, como o
 * `getServerSnapshot` exige; sem `matchMedia` no ambiente (jsdom de teste) também devolve `false`.
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
            const list = window.matchMedia(query)
            // jsdom antigo só expõe `addListener`/`removeListener` (depreciados).
            if (typeof list.addEventListener === "function") list.addEventListener("change", onChange)
            else list.addListener?.(onChange)
            return () => {
                if (typeof list.removeEventListener === "function") list.removeEventListener("change", onChange)
                else list.removeListener?.(onChange)
            }
        },
        [query],
    )
    const getSnapshot = useCallback(
        () => (typeof window === "undefined" || typeof window.matchMedia !== "function" ? false : window.matchMedia(query).matches),
        [query],
    )
    return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Consulta de celular: abaixo de `md` (768px). */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)"

/**
 * Celular (`< md`). A tela de Tarefas troca a tabela por cards compactos aqui — por isso a
 * apresentação é escolhida em JS (só a ativa monta) e não apenas por classes responsivas.
 */
export function useIsMobile(): boolean {
    return useMediaQuery(MOBILE_MEDIA_QUERY)
}
