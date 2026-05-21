"use client"

import { GlassSelector } from "@/components/ui/glass-selector"
import { colors } from "@/lib/config/colors"
import type { DiceRollMode } from "../types"

interface DiceModeSelectorProps {
    value: DiceRollMode
    onChange: (value: DiceRollMode) => void
}

export function DiceModeSelector({ value, onChange }: DiceModeSelectorProps) {
    return (
        <GlassSelector<DiceRollMode>
            value={value}
            onChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
            options={[
                { value: "disadvantage", label: "Desvantagem", activeColor: colors.rarity.artifact, textColor: colors.rarity.artifact },
                { value: "normal", label: "Padrão", activeColor: colors.rarity.rare, textColor: colors.rarity.rare },
                { value: "advantage", label: "Vantagem", activeColor: colors.rarity.uncommon, textColor: colors.rarity.uncommon },
            ]}
            fullWidth
            layoutId="dice-roll-mode"
        />
    )
}
