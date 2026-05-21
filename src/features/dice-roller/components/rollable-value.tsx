"use client"

import * as React from "react"
import { Dices } from "lucide-react"
import { cn } from "@/core/utils"
import type { DiceRollPreset } from "../types"
import { useDiceRoller } from "./dice-roll-context"

interface RollableValueProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    preset: DiceRollPreset
}

export function RollableValue({ preset, className, children, ...props }: RollableValueProps) {
    const { openPreset } = useDiceRoller()

    return (
        <button
            type="button"
            onClick={() => openPreset(preset)}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-blue-400/15 bg-blue-400/5 px-2 py-1 text-blue-100 transition-colors hover:border-blue-300/35 hover:bg-blue-400/10",
                className
            )}
            {...props}
        >
            <Dices className="h-3.5 w-3.5" />
            {children}
        </button>
    )
}
