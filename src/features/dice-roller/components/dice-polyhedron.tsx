"use client"

import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { colors, diceColors } from "@/lib/config/colors"
import { diceAssetRegistry } from "./dice-asset-registry"
import type { DiceType } from "../types"

interface DicePolyhedronProps {
    dice: DiceType
    value?: number | null
    isRolling?: boolean
    index?: number
    rollRole?: "single" | "kept" | "discarded"
}

export function DicePolyhedron({ dice, value, isRolling = false, index = 0, rollRole = "single" }: DicePolyhedronProps) {
    const color = colors.rarity[diceColors[dice].rarity]
    const asset = diceAssetRegistry[dice]
    const gradientId = `dice-gloss-${dice}-${index}`

    return (
        <motion.div
            data-testid="dice-polyhedron"
            data-dice={dice}
            data-shape={asset.shape}
            data-roll-role={rollRole}
            className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28"
            initial={{ opacity: 0, scale: 0.72, rotate: -18 }}
            animate={{
                opacity: 1,
                scale: 1,
                rotate: isRolling ? [0, 26, -24, 14, 0] : 0,
                y: isRolling ? [0, -10, 5, -4, 0] : 0,
            }}
            transition={{
                duration: isRolling ? 1.05 : 0.35,
                delay: Math.min(index * 0.035, 0.24),
                ease: "easeOut",
            }}
        >
            <div className="absolute inset-2 rounded-full blur-2xl opacity-35" style={{ backgroundColor: color }} />
            <svg viewBox={asset.viewBox} className="relative h-full w-full drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)]" role="img" aria-label={dice}>
                {asset.render({ color, gradientId })}
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="white" stopOpacity="0.42" />
                        <stop offset="55%" stopColor="white" stopOpacity="0.04" />
                        <stop offset="100%" stopColor="black" stopOpacity="0.28" />
                    </linearGradient>
                </defs>
            </svg>
            {typeof value === "number" && !isRolling && (
                <span
                    className={cn(
                        "absolute inset-0 flex items-center justify-center text-4xl font-black tabular-nums text-white",
                        "drop-shadow-[0_0_18px_rgba(255,255,255,0.4)]"
                    )}
                >
                    {value}
                </span>
            )}
        </motion.div>
    )
}
