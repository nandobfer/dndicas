"use client"

import * as React from "react"
import type { DiceRollPreset } from "../types"
import { useDiceResultConsoleApi } from "../hooks/use-dice-result-console-api"
import { useWindows } from "@/core/context/window-context"
import { DiceRollerPanel } from "./dice-roller-panel"

interface DiceRollerContextValue {
    openManual: () => void
    openPreset: (preset: DiceRollPreset) => void
    close: () => void
}

const DiceRollerContext = React.createContext<DiceRollerContextValue | null>(null)

export function DiceRollerProvider({ children }: { children: React.ReactNode }) {
    const { addWindow, removeWindow } = useWindows()
    useDiceResultConsoleApi()

    const close = React.useCallback(() => {
        removeWindow("dice-roller")
    }, [removeWindow])

    const openManual = React.useCallback(() => {
        addWindow({
            id: "dice-roller",
            title: "Rolagem de dados",
            initialSize: { width: "min(554px, 95vw)", height: "min(620px, 85vh)" },
            minSize: { width: 400, height: 250 },
            content: <DiceRollerPanel preset={null} />
        })
    }, [addWindow])

    const openPreset = React.useCallback((nextPreset: DiceRollPreset) => {
        addWindow({
            id: "dice-roller",
            title: "Rolagem de dados",
            initialSize: { width: "min(554px, 95vw)", height: "min(620px, 85vh)" },
            minSize: { width: 400, height: 250 },
            content: <DiceRollerPanel preset={nextPreset} />
        })
    }, [addWindow])

    const value = React.useMemo(() => ({ openManual, openPreset, close }), [close, openManual, openPreset])

    return (
        <DiceRollerContext.Provider value={value}>
            {children}
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
