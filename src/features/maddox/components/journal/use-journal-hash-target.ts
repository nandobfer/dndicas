"use client"

import { useEffect, useState } from "react"

const currentHash = () => (typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.replace(/^#/, "")))

/** Evento para avisar a troca de âncora feita pelo roteador (o `pushState` não dispara `hashchange`). */
export const MADDOX_JOURNAL_HASH_EVENT = "maddox-journal-hash"

export function announceJournalHash() {
    if (typeof window !== "undefined") setTimeout(() => window.dispatchEvent(new Event(MADDOX_JOURNAL_HASH_EVENT)), 0)
}

/** Âncora atual (`#npc-…`, `#anotacao-…`, `#personagem-…`); acompanha a troca de âncora sem recarregar a página. */
export function useJournalHash(key: unknown = null): string {
    const [hash, setHash] = useState(currentHash)
    useEffect(() => {
        const sync = () => setHash(currentHash())
        sync()
        window.addEventListener("hashchange", sync)
        window.addEventListener(MADDOX_JOURNAL_HASH_EVENT, sync)
        return () => {
            window.removeEventListener("hashchange", sync)
            window.removeEventListener(MADDOX_JOURNAL_HASH_EVENT, sync)
        }
    }, [key])
    return hash
}

/** Quando o item da âncora está na lista (`found`), a rolagem vai até ele (o card fica em destaque). */
export function useScrollToAnchor(hash: string, found: boolean) {
    useEffect(() => {
        if (!found || !hash) return
        document.getElementById(hash)?.scrollIntoView?.({ block: "center", behavior: "smooth" })
    }, [found, hash])
}

/** Quantas páginas uma lista do diário carrega sozinha atrás do item aberto por link (30 por página). */
export const MADDOX_JOURNAL_SEEK_PAGES = 10

/**
 * O item da âncora pode estar além da primeira página (a busca não segue a ordem da lista): carrega as páginas seguintes
 * até achá-lo ou até `MADDOX_JOURNAL_SEEK_PAGES`. Devolve `tooFar` quando passou do limite sem achar.
 */
export function useSeekAnchor({ wanted, found, hasNextPage, isFetchingNextPage, fetchNextPage, pages }: { wanted: boolean; found: boolean; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; pages: number }): { seeking: boolean; tooFar: boolean } {
    const missing = wanted && !found && pages > 0 && hasNextPage
    const seeking = missing && pages < MADDOX_JOURNAL_SEEK_PAGES
    useEffect(() => {
        if (seeking && !isFetchingNextPage) void fetchNextPage()
    }, [seeking, isFetchingNextPage, fetchNextPage, pages])
    return { seeking, tooFar: missing && !seeking }
}
