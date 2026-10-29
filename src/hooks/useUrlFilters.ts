"use client"

import { useCallback, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"

const URL_FILTERS_CHANGE_EVENT = "opex:url-filters-change"

export interface UrlFilterCodec<T> {
    parse: (raw: string | null, fallback: T) => T
    serialize: (value: T) => string
}

export type UrlFilterSchema<T extends object> = {
    [K in keyof T]: UrlFilterCodec<T[K]>
}

function allowedValue<T extends string>(value: string, allowed?: readonly T[]): value is T {
    return !allowed || allowed.includes(value as T)
}

export const urlFilterCodecs = {
    string<T extends string = string>(allowed?: readonly T[]): UrlFilterCodec<T> {
        return {
            parse: (raw, fallback) => (raw !== null && allowedValue(raw, allowed) ? raw : fallback),
            serialize: (value) => value,
        }
    },

    strings<T extends string = string>(allowed?: readonly T[]): UrlFilterCodec<T[]> {
        return {
            parse: (raw, fallback) => {
                if (raw === null) return fallback
                if (!raw) return []

                return raw
                    .split(",")
                    .map((value) => value.trim())
                    .filter((value): value is T => Boolean(value) && allowedValue(value, allowed))
            },
            serialize: (value) => value.join(","),
        }
    },

    booleans(): UrlFilterCodec<boolean[]> {
        return {
            parse: (raw, fallback) => {
                if (raw === null) return fallback
                if (!raw) return []

                return raw
                    .split(",")
                    .map((value) => value.trim())
                    .filter((value) => value === "true" || value === "false")
                    .map((value) => value === "true")
            },
            serialize: (value) => value.map(String).join(","),
        }
    },
}

function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener("popstate", onStoreChange)
    window.addEventListener(URL_FILTERS_CHANGE_EVENT, onStoreChange)

    return () => {
        window.removeEventListener("popstate", onStoreChange)
        window.removeEventListener(URL_FILTERS_CHANGE_EVENT, onStoreChange)
    }
}

function getSnapshot(): string {
    return window.location.search
}

function getServerSnapshot(): string {
    return ""
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((value, index) => value === right[index])
    }

    return left === right
}

export function parseUrlFilters<T extends object>(
    search: string,
    defaults: T,
    schema: UrlFilterSchema<T>,
): T {
    const params = new URLSearchParams(search)
    const parsed = { ...defaults }

    for (const key of Object.keys(schema) as Array<keyof T>) {
        parsed[key] = schema[key].parse(params.get(String(key)), defaults[key])
    }

    return parsed
}

export function serializeUrlFilters<T extends object>(
    search: string,
    values: T,
    defaults: T,
    schema: UrlFilterSchema<T>,
): string {
    const params = new URLSearchParams(search)

    for (const key of Object.keys(schema) as Array<keyof T>) {
        const param = String(key)
        params.delete(param)

        if (!valuesEqual(values[key], defaults[key])) {
            params.set(param, schema[key].serialize(values[key]))
        }
    }

    return params.toString()
}

export function serializeAllUrlFilters<T extends object>(
    values: T,
    schema: UrlFilterSchema<T>,
): string {
    const params = new URLSearchParams()

    for (const key of Object.keys(schema) as Array<keyof T>) {
        params.set(String(key), schema[key].serialize(values[key]))
    }

    return params.toString()
}

export function useUrlFilters<T extends object>(
    defaults: T,
    schema: UrlFilterSchema<T>,
    getFallback?: () => T | null,
    navigationSearch?: string,
): [T, Dispatch<SetStateAction<T>>, () => void] {
    const browserSearch = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    const normalizedNavigationSearch = useMemo(() => {
        if (navigationSearch === undefined) return undefined
        const serialized = navigationSearch.startsWith("?")
            ? navigationSearch.slice(1)
            : navigationSearch
        return serialized ? `?${serialized}` : ""
    }, [navigationSearch])
    const [optimisticSearch, setOptimisticSearch] = useState<string | null>(null)
    // O fallback (ex.: preferência salva) vale só até a primeira interação.
    const [canUseFallback, setCanUseFallback] = useState(true)
    // Navegação nova descarta a busca otimista (ajuste de estado durante o render, padrão React).
    const [lastNavigationSearch, setLastNavigationSearch] = useState(normalizedNavigationSearch)
    if (lastNavigationSearch !== normalizedNavigationSearch) {
        setLastNavigationSearch(normalizedNavigationSearch)
        setOptimisticSearch(null)
    }
    const search = normalizedNavigationSearch === undefined
        ? browserSearch
        : optimisticSearch ?? normalizedNavigationSearch
    const parseCurrent = useCallback((currentSearch: string) => {
        const params = new URLSearchParams(currentSearch)
        const hasExplicitValue = (Object.keys(schema) as Array<keyof T>)
            .some((key) => params.has(String(key)))
        const base = hasExplicitValue || !canUseFallback
            ? defaults
            : getFallback?.() ?? defaults
        return parseUrlFilters(currentSearch, base, schema)
    }, [canUseFallback, defaults, getFallback, schema])
    const values = useMemo(() => parseCurrent(search), [parseCurrent, search])

    const setValues = useCallback<Dispatch<SetStateAction<T>>>((next) => {
        const current = parseCurrent(search)
        const resolved = typeof next === "function"
            ? (next as (previous: T) => T)(current)
            : next
        setCanUseFallback(false)
        const nextSearch = serializeUrlFilters(search, resolved, defaults, schema)
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`

        if (normalizedNavigationSearch !== undefined) {
            setOptimisticSearch(nextSearch ? `?${nextSearch}` : "")
        }
        window.history.replaceState(window.history.state, "", nextUrl)
        window.dispatchEvent(new Event(URL_FILTERS_CHANGE_EVENT))
    }, [defaults, normalizedNavigationSearch, parseCurrent, schema, search])

    const reset = useCallback(() => setValues(defaults), [defaults, setValues])

    return [values, setValues, reset]
}
