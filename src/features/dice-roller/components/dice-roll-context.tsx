"use client"

import * as React from "react"
import type { DiceRollPreset } from "../types"
import { useDiceResultConsoleApi } from "../hooks/use-dice-result-console-api"
import { DiceRollerModal } from "./dice-roller-modal"

interface DiceRollerContextValue {
    openManual: () => void
    openPreset: (preset: DiceRollPreset) => void
    close: () => void
}

const DiceRollerContext = React.createContext<DiceRollerContextValue | null>(null)

export function DiceRollerProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false)
    const [preset, setPreset] = React.useState<DiceRollPreset | null>(null)
    useDiceResultConsoleApi()

    const close = React.useCallback(() => setOpen(false), [])
    const openManual = React.useCallback(() => {
        setPreset(null)
        setOpen(true)
    }, [])
    const openPreset = React.useCallback((nextPreset: DiceRollPreset) => {
        setPreset(nextPreset)
        setOpen(true)
    }, [])

    const value = React.useMemo(() => ({ openManual, openPreset, close }), [close, openManual, openPreset])

    return (
        <DiceRollerContext.Provider value={value}>
            {children}
            <DiceRollerModal open={open} onOpenChange={setOpen} preset={preset} />
        </DiceRollerContext.Provider>
    )
}

export function useDiceRoller() {
    const context = React.useContext(DiceRollerContext)
    if (!context) {
        throw new Error("useDiceRoller must be used within DiceRollerProvider")
    }
    return context
}
