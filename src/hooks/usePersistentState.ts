"use client"

import { useCallback, useSyncExternalStore, type SetStateAction } from "react"
import type { ZodType } from "zod"

/**
 * Estado salvo no `localStorage` sem prazo (ex.: filtros de uma tela), validado por um schema Zod
 * — dado corrompido ou de versão antiga volta ao padrão. Sincroniza entre componentes da mesma
 * aba e entre abas (evento `storage`). Versione a chave ao mudar o formato (`…:v2`).
 *
 * `ready` é `false` no servidor e na hidratação: mostre um esqueleto até lá para não piscar os
 * valores padrão (padrão `areFiltersReady` do Smart Desk).
 */

const LOCAL_EVENT = "opex:persistent-state"

const cache = new Map<string, { raw: string | null; value: unknown }>()

function read<T>(key: string, schema: ZodType<T, unknown>, fallback: T): T {
    let raw: string | null = null
    try {
        raw = window.localStorage.getItem(key)
    } catch {
        return fallback
    }
    const hit = cache.get(key)
    if (hit && hit.raw === raw) return hit.value as T
    let value = fallback
    if (raw !== null) {
        try {
            const parsed = schema.safeParse(JSON.parse(raw))
            if (parsed.success) value = parsed.data
        } catch {
            // JSON inválido: padrão.
        }
    }
    cache.set(key, { raw, value })
    return value
}

function subscribe(key: string, callback: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) callback()
    }
    const onLocal = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) callback()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(LOCAL_EVENT, onLocal)
    return () => {
        window.removeEventListener("storage", onStorage)
        window.removeEventListener(LOCAL_EVENT, onLocal)
    }
}

const subscribeNoop = () => () => {}

/**
 * Leitura imperativa do mesmo estado persistido (mesma validação e mesmo cache do hook). Usada por
 * código fora do React (ex.: comandos `:set` do editor Vim).
 */
export function readPersistentState<T>(key: string, schema: ZodType<T, unknown>, fallback: T): T {
    if (typeof window === "undefined") return fallback
    return read(key, schema, fallback)
}

/** Gravação imperativa do estado persistido, notificando os componentes da mesma aba. */
export function writePersistentState<T>(key: string, value: T): void {
    if (typeof window === "undefined") return
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // Armazenamento cheio/bloqueado: mantém só na memória desta sessão.
        cache.set(key, { raw: null, value })
    }
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }))
}

export function usePersistentState<T>(
    key: string,
    schema: ZodType<T, unknown>,
    fallback: T,
): { value: T; setValue: (next: SetStateAction<T>) => void; reset: () => void; ready: boolean } {
    const value = useSyncExternalStore(
        useCallback((callback: () => void) => subscribe(key, callback), [key]),
        () => read(key, schema, fallback),
        () => fallback,
    )
    const ready = useSyncExternalStore(
        subscribeNoop,
        () => true,
        () => false,
    )

    const setValue = useCallback(
        (next: SetStateAction<T>) => {
            const current = read(key, schema, fallback)
            const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next
            try {
                window.localStorage.setItem(key, JSON.stringify(resolved))
            } catch {
                // Armazenamento cheio/bloqueado: mantém só na memória desta sessão.
                cache.set(key, { raw: null, value: resolved })
            }
            window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }))
        },
        [key, schema, fallback],
    )

    const reset = useCallback(() => setValue(fallback), [setValue, fallback])

    return { value, setValue, reset, ready }
}
