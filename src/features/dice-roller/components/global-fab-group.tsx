"use client"

import { DiceRollerFab } from "./dice-roller-fab"
import { GlobalSearchFAB } from "@/components/ui/global-search-fab"

export function GlobalFabGroup() {
    return (
        <div className="fixed bottom-6 right-6 z-[99] flex flex-col items-end gap-3 sm:flex-row sm:items-center">
            <DiceRollerFab />
            <GlobalSearchFAB embedded />
        </div>
    )
}
