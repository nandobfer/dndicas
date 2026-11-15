"use client"

import { motion } from "framer-motion"
import { Wrench } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxGameMessageDto } from "../../game-types"

/**
 * DND-59: linha da mesa quando o Maddox corrige o combate tático pelo "Pergunte ao mestre" ou por um lembrete (condição,
 * card pendente, adversário, economia). Todos os jogadores veem, como a linha de PV.
 */
export function CombatFixLine({ message }: { message: MaddoxGameMessageDto }) {
    const text = message.content.trim()
    if (!text) return null
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pb-3" data-testid="combat-fix-line">
            <p className="flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80">
                <Wrench className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.uncommon }} aria-hidden />
                <span className="break-words">{text}</span>
            </p>
        </motion.div>
    )
}
