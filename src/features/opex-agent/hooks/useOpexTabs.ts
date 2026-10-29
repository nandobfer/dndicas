"use client"

import { useCallback, useEffect } from "react"
import { z } from "zod"
import { usePersistentState } from "@/hooks/usePersistentState"
import { useOpexScope } from "../components/OpexScopeProvider"
import type { OpexSessionDto } from "../types"

/** Aba da nova sessão (ainda não criada). */
export const OPEX_DRAFT_TAB = "draft"

const tabsSchema = z.object({
    open: z.array(z.string().max(40)).max(200),
    active: z.string().max(40).nullable(),
})
export type OpexTabsState = z.infer<typeof tabsSchema>

const INITIAL: OpexTabsState = { open: [], active: OPEX_DRAFT_TAB }

/** Fecha uma aba e ativa a vizinha (ou a nova sessão, se era a última). */
export function closeTab(state: OpexTabsState, id: string): OpexTabsState {
    const index = state.open.indexOf(id)
    const open = state.open.filter((item) => item !== id)
    if (state.active !== id) return { ...state, open }
    return { open, active: open[Math.min(index, open.length - 1)] ?? OPEX_DRAFT_TAB }
}

export function openTab(state: OpexTabsState, id: string): OpexTabsState {
    return { open: state.open.includes(id) ? state.open : [...state.open, id], active: id }
}

/** Abas abertas que ainda existem (sessões excluídas em outra janela somem). */
export function pruneTabs(state: OpexTabsState, sessions: readonly Pick<OpexSessionDto, "id">[]): OpexTabsState {
    const known = new Set(sessions.map((session) => session.id))
    const open = state.open.filter((id) => known.has(id))
    const active = state.active === OPEX_DRAFT_TAB || (state.active && known.has(state.active)) ? state.active : (open.at(-1) ?? OPEX_DRAFT_TAB)
    return open.length === state.open.length && active === state.active ? state : { open, active }
}

/** Abas de sessão do popover, guardadas no navegador. */
export function useOpexTabs(sessions: readonly OpexSessionDto[] | undefined) {
    const { tabsKey } = useOpexScope()
    const { value, setValue, ready } = usePersistentState(tabsKey, tabsSchema, INITIAL)

    useEffect(() => {
        if (sessions) setValue((current) => pruneTabs(current, sessions))
    }, [sessions, setValue])

    const open = useCallback((id: string) => setValue((current) => openTab(current, id)), [setValue])
    const close = useCallback((id: string) => setValue((current) => closeTab(current, id)), [setValue])
    const activate = useCallback((id: string) => setValue((current) => ({ ...current, active: id })), [setValue])
    const startDraft = useCallback(() => setValue((current) => ({ ...current, active: OPEX_DRAFT_TAB })), [setValue])

    return { tabs: value, ready, open, close, activate, startDraft }
}
