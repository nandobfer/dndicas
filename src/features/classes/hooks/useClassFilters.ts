"use client";

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebounce } from "@/core/hooks/useDebounce"
import type { ClassesFilters, HitDiceType, SpellcastingTier } from "../types/classes.types"

const DEFAULT_LIMIT = 10
const SEARCH_DEBOUNCE_MS = 300

export function useClassFilters() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [page, setPageState] = useState(() => {
        const p = searchParams.get("page")
        return p ? parseInt(p, 10) : 1
    })
    const [limit] = useState(DEFAULT_LIMIT)
    const [search, setSearchState] = useState(() => searchParams.get("search") || "")
    const [status, setStatusState] = useState<ClassesFilters["status"]>(() => {
        const s = searchParams.get("status")
        return (s as ClassesFilters["status"]) || "all"
    })
    const [hitDice, setHitDiceState] = useState<HitDiceType[]>(() => {
        const p = searchParams.get("hitDice")
        return p ? (p.split(",") as HitDiceType[]) : []
    })
    const [spellcasting, setSpellcastingState] = useState<SpellcastingTier[]>(() => {
        const p = searchParams.get("spellcasting")
        return p ? (p.split(",") as SpellcastingTier[]) : []
    })

    const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

    const setSearch = useCallback((value: string) => {
        setSearchState(value)
        setPageState(1)
    }, [])

    const setStatus = useCallback((value: ClassesFilters["status"]) => {
        setStatusState(value)
        setPageState(1)
    }, [])

    const setHitDice = useCallback((value: HitDiceType[]) => {
        setHitDiceState(value)
        setPageState(1)
    }, [])

    const setSpellcasting = useCallback((value: SpellcastingTier[]) => {
        setSpellcastingState(value)
        setPageState(1)
    }, [])

    const setPage = useCallback((newPage: number) => setPageState(newPage), [])

    const resetFilters = useCallback(() => {
        setSearchState("")
        setStatusState("all")
        setHitDiceState([])
        setSpellcastingState([])
        setPageState(1)
    }, [])

    const filters: ClassesFilters & { page: number; limit: number } = useMemo(
        () => ({
            search: debouncedSearch,
            status,
            hitDice: hitDice.length > 0 ? hitDice : undefined,
            spellcasting: spellcasting.length > 0 ? spellcasting : undefined,
            page,
            limit,
        }),
        [debouncedSearch, status, hitDice, spellcasting, page, limit]
    )

    useEffect(() => {
        const params = new URLSearchParams()
        if (search) params.set("search", search)
        if (status && status !== "all") params.set("status", status)
        if (page > 1) params.set("page", page.toString())
        if (hitDice.length > 0) params.set("hitDice", hitDice.join(","))
        if (spellcasting.length > 0) params.set("spellcasting", spellcasting.join(","))

        const qs = params.toString()
        const newUrl = qs ? `?${qs}` : window.location.pathname
        router.replace(newUrl, { scroll: false })
    }, [search, status, page, hitDice, spellcasting, router])

    return {
        filters,
        search,
        debouncedSearch,
        page,
        limit,
        setSearch,
        setStatus,
        setHitDice,
        setSpellcasting,
        setPage,
        resetFilters,
    }
}
