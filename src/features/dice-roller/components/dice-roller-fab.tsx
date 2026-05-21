"use client"

import { motion } from "framer-motion"
import { Dices } from "lucide-react"
import { cn } from "@/core/utils"
import { useDiceRoller } from "./dice-roll-context"

const GLASS_STYLE = "bg-black/40 backdrop-blur-[4px]"

export function DiceRollerFab() {
    const { openManual } = useDiceRoller()

    return (
        <motion.button
            type="button"
            layoutId="dice-roller-portal"
            onClick={openManual}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative overflow-hidden rounded-full bg-gradient-to-r from-amber-500/20 via-blue-500/20 to-emerald-500/20 bg-[length:200%_auto] p-[1.5px] shadow-2xl animate-gradient"
            )}
            aria-label="Abrir rolagem de dados"
        >
            <div className={cn("flex items-center justify-center rounded-full p-3.5 transition-colors hover:bg-slate-900/40", GLASS_STYLE)}>
                <Dices className="h-5 w-5 text-amber-300 transition-colors" />
            </div>
        </motion.button>
    )
}
