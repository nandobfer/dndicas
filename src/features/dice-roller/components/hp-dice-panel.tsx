"use client"

import * as React from "react"
import { DiceRollerPanel } from "./dice-roller-panel"
import type { DiceRollResponse, DiceTerm } from "../types"

export interface HpDicePanelProps {
    label: string
    terms: DiceTerm[]
    modifier?: number
    sourceRef?: {
        sheetId?: string
        fieldId?: string
        owlbearPlayerId?: string
        roomId?: string
    }
    onRollResolved: (total: number, result: DiceRollResponse) => void
}

export function HpDicePanel({
    label,
    terms,
    modifier = 0,
    sourceRef,
    onRollResolved,
}: HpDicePanelProps) {
    const preset = React.useMemo(() => ({
        label,
        terms,
        modifier,
        source: "sheet" as const,
        sourceRef,
    }), [label, modifier, sourceRef, terms])

    return (
        <DiceRollerPanel
            preset={preset}
            hideConfigurationControls
            onRollResolved={(result) => onRollResolved(result.total, result)}
        />
    )
}
