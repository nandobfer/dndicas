"use client"

import * as React from "react"
import { DiceRollerPanel } from "./dice-roller-panel"
import type { DiceModifierPart, DiceRollResponse, DiceTerm } from "../types"

export interface HpDicePanelProps {
    label: string
    terms: DiceTerm[]
    modifier?: number
    /** DND-47: parcelas nomeadas do modificador (ex.: "Constituição"), mostradas no tooltip do resultado. */
    modifierParts?: DiceModifierPart[]
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
    modifierParts,
    sourceRef,
    onRollResolved,
}: HpDicePanelProps) {
    // As parcelas costumam chegar como array novo a cada render: o preset só muda quando o conteúdo muda (senão o painel
    // reiniciaria e apagaria o resultado).
    const partsKey = JSON.stringify(modifierParts ?? [])
    const stableParts = React.useMemo(() => JSON.parse(partsKey) as DiceModifierPart[], [partsKey])
    const preset = React.useMemo(() => ({
        label,
        terms,
        modifier,
        ...(stableParts.length ? { modifierParts: stableParts } : {}),
        source: "sheet" as const,
        sourceRef,
    }), [label, modifier, stableParts, sourceRef, terms])

    return (
        <DiceRollerPanel
            preset={preset}
            hideConfigurationControls
            onRollResolved={(result) => onRollResolved(result.total, result)}
        />
    )
}
