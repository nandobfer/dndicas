"use client"

import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import Link from "next/link"
import type { MaddoxQuestStatus } from "../../constants"
import type { MaddoxJournalImageKind } from "../../journal-schemas"
import { journalHref, journalLocation, MADDOX_JOURNAL_DEFAULT_TAB, type JournalTarget, type MaddoxJournalNoteKind, type MaddoxJournalTab } from "./journal-links"
import { useJournalHash } from "./use-journal-hash-target"

export type JournalQuestFilter = MaddoxQuestStatus | "todas"

/** Onde o diário está: aba, filtros e âncora do item aberto. */
export interface JournalNavigationState {
    tab: MaddoxJournalTab
    noteKind: MaddoxJournalNoteKind
    questFilter: JournalQuestFilter
    imageKind: MaddoxJournalImageKind
}

/**
 * Navegação do diário. A página guarda tudo na URL (`?aba=`, filtros e `#âncora`); a janela da mesa (DND-77) guarda em
 * estado local (`local`), para não mexer na URL da mesa: os links internos trocam a aba e destacam o item na própria janela.
 */
export interface JournalNavigation extends JournalNavigationState {
    local: boolean
    /** Âncora do item aberto na janela (na página, a âncora vem do `#` da URL). */
    anchor: string
    selectTab: (tab: MaddoxJournalTab) => void
    selectNoteKind: (kind: MaddoxJournalNoteKind) => void
    selectQuestFilter: (filter: JournalQuestFilter) => void
    selectImageKind: (kind: MaddoxJournalImageKind) => void
    /** Abre um item (resultado da busca, "Ver NPC"). */
    go: (target: JournalTarget) => void
}

const JournalNavigationContext = createContext<JournalNavigation | null>(null)

export function JournalNavigationProvider({ value, children }: { value: JournalNavigation; children: ReactNode }) {
    return <JournalNavigationContext.Provider value={value}>{children}</JournalNavigationContext.Provider>
}

/** Navegação atual; fora de um provedor (busca rápida da mesa) é `null` e os links levam à página do diário. */
export const useJournalNavigation = () => useContext(JournalNavigationContext)

export const INITIAL_JOURNAL_STATE: JournalNavigationState = { tab: MADDOX_JOURNAL_DEFAULT_TAB, noteKind: "evento", questFilter: "todas", imageKind: "todas" }

/** Navegação em estado local (janela do diário na mesa): começa na aba padrão a cada montagem. */
export function useLocalJournalNavigation(): JournalNavigation {
    const [state, setState] = useState<JournalNavigationState & { anchor: string }>({ ...INITIAL_JOURNAL_STATE, anchor: "" })
    const go = useCallback((target: JournalTarget) => {
        const location = journalLocation(target)
        setState((current) => ({ ...current, tab: location.tab, noteKind: location.noteKind ?? current.noteKind, questFilter: "todas", imageKind: "todas", anchor: location.anchor ?? "" }))
    }, [])
    return useMemo(
        () => ({
            ...state,
            local: true,
            selectTab: (tab) => setState((current) => ({ ...current, tab, noteKind: "evento", questFilter: "todas", imageKind: "todas", anchor: "" })),
            selectNoteKind: (noteKind) => setState((current) => ({ ...current, noteKind })),
            selectQuestFilter: (questFilter) => setState((current) => ({ ...current, questFilter })),
            selectImageKind: (imageKind) => setState((current) => ({ ...current, imageKind })),
            go,
        }),
        [state, go],
    )
}

/** Âncora do item aberto: o `#` da URL na página, o estado local na janela da mesa. */
export function useJournalAnchor(key: unknown = null): string {
    const navigation = useJournalNavigation()
    const hash = useJournalHash(key)
    return navigation?.local ? navigation.anchor : hash
}

/**
 * Link para um item do diário. Na página e fora do diário é um link comum (`journalHref`); na janela da mesa mantém o
 * `href` (abrir em nova aba continua levando à página), mas o clique troca a aba e destaca o item na própria janela.
 */
export function JournalTargetLink({ campaignId, target, onClick, className, children, "data-testid": testId }: { campaignId: string; target: JournalTarget; onClick?: () => void; className?: string; children: ReactNode; "data-testid"?: string }) {
    const navigation = useJournalNavigation()
    const href = journalHref(campaignId, target)
    if (navigation?.local) {
        const open = (event: MouseEvent<HTMLAnchorElement>) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
            event.preventDefault()
            onClick?.()
            navigation.go(target)
        }
        return (
            <a href={href} onClick={open} className={className} data-testid={testId}>
                {children}
            </a>
        )
    }
    return (
        <Link href={href} onClick={onClick} className={className} data-testid={testId}>
            {children}
        </Link>
    )
}
