"use client"

import { useEffect, useState } from "react"

const currentHash = () => (typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.replace(/^#/, "")))

/** Evento para avisar a troca de âncora feita pelo roteador (o `pushState` não dispara `hashchange`). */
export const MADDOX_JOURNAL_HASH_EVENT = "maddox-journal-hash"

export function announceJournalHash() {
    if (typeof window !== "undefined") setTimeout(() => window.dispatchEvent(new Event(MADDOX_JOURNAL_HASH_EVENT)), 0)
}

/**
 * Item aberto pela âncora (`#npc-…`, `#anotacao-…`, `#personagem-…`): quando a lista carrega, a rolagem vai até ele
 * e ele fica em destaque. Acompanha a troca de âncora sem recarregar a página.
 */
export function useJournalHashTarget(ready: boolean, key: unknown = null): string {
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
    useEffect(() => {
        if (!ready || !hash) return
        document.getElementById(hash)?.scrollIntoView?.({ block: "center", behavior: "smooth" })
    }, [ready, hash])
    return hash
}
