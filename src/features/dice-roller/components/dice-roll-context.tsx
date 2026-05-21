"use client"

import * as React from "react"
import { clearDiceOverride, listDiceOverrides, setDiceOverride } from "../dice-api"
import type { DiceResultConsoleApi, DiceRollPreset } from "../types"
import { DiceRollerModal } from "./dice-roller-modal"

interface DiceRollerContextValue {
    openManual: () => void
    openPreset: (preset: DiceRollPreset) => void
    close: () => void
}

const DiceRollerContext = React.createContext<DiceRollerContextValue | null>(null)

declare global {
    interface Window {
        diceResult?: DiceResultConsoleApi
    }
}

export function DiceRollerProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false)
    const [preset, setPreset] = React.useState<DiceRollPreset | null>(null)

    const close = React.useCallback(() => setOpen(false), [])
    const openManual = React.useCallback(() => {
        setPreset(null)
        setOpen(true)
    }, [])
    const openPreset = React.useCallback((nextPreset: DiceRollPreset) => {
        setPreset(nextPreset)
        setOpen(true)
    }, [])

    React.useEffect(() => {
        window.diceResult = {
            min: async (dice, value) => {
                const result = await setDiceOverride({ action: "min", dice, value })
                console.info("[diceResult] override mínimo definido.", result)
                return result
            },
            max: async (dice, value) => {
                const result = await setDiceOverride({ action: "max", dice, value })
                console.info("[diceResult] override máximo definido.", result)
                return result
            },
            range: async (dice, min, max) => {
                const result = await setDiceOverride({ action: "range", dice, min, max })
                console.info("[diceResult] override de faixa definido.", result)
                return result
            },
            exact: async (dice, value) => {
                const result = await setDiceOverride({ action: "exact", dice, value })
                console.info("[diceResult] override exato definido.", result)
                return result
            },
            clear: async (dice) => {
                const result = await clearDiceOverride(dice)
                console.info("[diceResult] overrides limpos.", result)
                return result
            },
            list: async () => {
                const result = await listDiceOverrides()
                console.info("[diceResult] overrides pendentes.", result)
                return result
            },
        }

        return () => {
            delete window.diceResult
        }
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
