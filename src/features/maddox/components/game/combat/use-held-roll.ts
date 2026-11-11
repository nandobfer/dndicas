"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_COMBAT_ROLL_HOLD_MAX_MS } from "../../../constants"
import { rollSlot, type LocalRollHold, type RollSlot } from "./roll-hold"

const EMPTY: ReadonlySet<string> = new Set()
const withId = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => (set.has(id) ? set : new Set([...set, id]))

export interface HeldRoll extends RollSlot {
    /** Repetição que o dado do card ainda deve mostrar (`null` depois que o palco dela saiu). */
    replay: DiceRollResponse | null
    start: (index: number) => void
    created: (roll: DiceRollResponse) => void
    failed: () => void
    settled: (roll: DiceRollResponse) => void
    hidden: (roll: DiceRollResponse) => void
}

/**
 * Ciclo do dado num card de combate (DND-48): o clique prende o passo; o dado parado revela o resultado; o palco saindo
 * libera o passo (o próximo "Rolar" aparece). Se o palco nunca avisar, o passo é liberado depois de
 * `MADDOX_COMBAT_ROLL_HOLD_MAX_MS`.
 */
export function useHeldRoll({ rolls, pendingIndex, replay }: { rolls: ReadonlyArray<DiceRollResponse | null>; pendingIndex: number; replay: DiceRollResponse | null }): HeldRoll {
    const [local, setLocal] = useState<LocalRollHold | null>(null)
    const [revealed, setRevealed] = useState<ReadonlySet<string>>(EMPTY)
    const [finished, setFinished] = useState<ReadonlySet<string>>(EMPTY)
    const slot = rollSlot({ rolls, pendingIndex, local, replay, revealed, finished })
    const activeReplay = replay && !finished.has(replay.rollId) ? replay : null

    const current = useRef({ local, replay: activeReplay })
    current.current = { local, replay: activeReplay }
    const holdKey = local ? `local:${local.index}` : slot.holding && activeReplay ? `replay:${activeReplay.rollId}` : null
    useEffect(() => {
        if (!holdKey) return
        const timer = window.setTimeout(() => {
            const { local: held, replay: replaying } = current.current
            setLocal(null)
            const ids = [held?.rollId, replaying?.rollId].filter((id): id is string => Boolean(id))
            if (ids.length) {
                setRevealed((set) => ids.reduce(withId, set))
                setFinished((set) => ids.reduce(withId, set))
            }
        }, MADDOX_COMBAT_ROLL_HOLD_MAX_MS)
        return () => window.clearTimeout(timer)
    }, [holdKey])

    const start = useCallback((index: number) => setLocal({ index, rollId: null }), [])
    const created = useCallback((roll: DiceRollResponse) => setLocal((held) => (held ? { ...held, rollId: roll.rollId } : held)), [])
    const failed = useCallback(() => setLocal(null), [])
    const settled = useCallback((roll: DiceRollResponse) => setRevealed((set) => withId(set, roll.rollId)), [])
    const hidden = useCallback((roll: DiceRollResponse) => {
        setRevealed((set) => withId(set, roll.rollId))
        setFinished((set) => withId(set, roll.rollId))
        setLocal(null)
    }, [])

    return { ...slot, replay: activeReplay, start, created, failed, settled, hidden }
}
