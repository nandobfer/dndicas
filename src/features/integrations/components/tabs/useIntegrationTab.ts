"use client"

import { useCallback, useState, useSyncExternalStore } from "react"

/** Parâmetro da URL com a aba ativa da página da integração. */
export const TAB_PARAM = "aba"
const TAB_CHANGE_EVENT = "integration-tab-change"

/** Aba pedida na URL, se existir; senão a padrão. */
export function parseTab<T extends string>(search: string, tabs: readonly T[], fallback: T, param = TAB_PARAM): T {
    const value = new URLSearchParams(search).get(param)
    return value && (tabs as readonly string[]).includes(value) ? (value as T) : fallback
}

/** URL com a aba (a padrão é omitida), preservando os demais parâmetros e o hash. */
export function urlWithTab(location: { pathname: string; search: string; hash: string }, tab: string, fallback: string, param = TAB_PARAM): string {
    const params = new URLSearchParams(location.search)
    if (tab === fallback) params.delete(param)
    else params.set(param, tab)
    const search = params.toString()
    return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`
}

function subscribe(onChange: () => void) {
    window.addEventListener("popstate", onChange)
    window.addEventListener(TAB_CHANGE_EVENT, onChange)
    return () => {
        window.removeEventListener("popstate", onChange)
        window.removeEventListener(TAB_CHANGE_EVENT, onChange)
    }
}
const getSnapshot = () => window.location.search
const getServerSnapshot = () => ""

/**
 * Aba ativa com a URL como fonte única (`?aba=…`, padrão omitida, `history.replaceState`). Trocar
 * de aba com alterações não salvas pede "Descartar alterações?" (`pendingTab` até confirmar).
 * Copiado do Orquestrador WhatsApp do CRM, genérico.
 */
export function useIntegrationTab<T extends string>(tabs: readonly T[], fallback: T, hasChanges: boolean, discard: () => void, param = TAB_PARAM) {
    const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    const tab = parseTab(search, tabs, fallback, param)
    const [pendingTab, setPendingTab] = useState<T | null>(null)

    const go = useCallback(
        (next: T) => {
            window.history.replaceState(window.history.state, "", urlWithTab(window.location, next, fallback, param))
            window.dispatchEvent(new Event(TAB_CHANGE_EVENT))
        },
        [fallback, param],
    )

    const requestTab = useCallback(
        (next: T) => {
            if (next === tab) return
            if (hasChanges) setPendingTab(next)
            else go(next)
        },
        [go, hasChanges, tab],
    )

    const confirmDiscard = useCallback(() => {
        if (!pendingTab) return
        discard()
        go(pendingTab)
        setPendingTab(null)
    }, [discard, go, pendingTab])

    return { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard: () => setPendingTab(null) }
}
