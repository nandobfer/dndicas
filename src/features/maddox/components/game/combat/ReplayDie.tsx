"use client"

import { useMemo } from "react"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import type { DiceRollPreset, DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_CHECK_DIE_HIDE_MS } from "../../../constants"

/**
 * Dado rolado pelo servidor e repetido na tela de todos (DND-25): iniciativa dos inimigos, ataques e dano dos NPCs,
 * salvaguardas dos adversários. Ninguém rola: o painel só anima o resultado oficial e avisa quando ele parou.
 */
export function ReplayDie({ roll, label, onSettled }: { roll: DiceRollResponse; label: string; onSettled?: (roll: DiceRollResponse) => void }) {
    const preset = useMemo<DiceRollPreset>(
        () => ({ label, terms: roll.terms.length ? roll.terms.map((term) => ({ dice: term.dice, quantity: term.quantity })) : [{ dice: "d20", quantity: 1 }], modifier: roll.modifier, mode: roll.mode ?? "normal", source: "sheet" }),
        [label, roll],
    )
    return (
        <div className="flex shrink-0 flex-col items-center justify-center sm:min-w-[9rem]" data-testid="replay-die">
            <DiceRollerPanel
                preset={preset}
                hideConfigurationControls
                appearance="inline"
                stageVariant="bare"
                stageSize="compact"
                stageVisibility="roll"
                stageHideDelayMs={MADDOX_CHECK_DIE_HIDE_MS}
                hideRollButton
                disableRolling
                externalResult={roll}
                onRollSettled={onSettled}
            />
        </div>
    )
}
