"use client"

import { motion } from "framer-motion"
import { HeartPulse } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxGameMessageDto } from "../../game-types"

/** DND-49: linha da mesa quando o Maddox muda os PV de um personagem na ficha ("PV de X: 0 → 1 (motivo)"). */
export function HitPointsLine({ message }: { message: MaddoxGameMessageDto }) {
    if (!message.content.trim()) return null
    return (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-1.5 pb-3 text-center text-xs text-white/75" data-testid="hit-points-line">
            <HeartPulse className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.uncommon }} aria-hidden />
            {message.content}
        </motion.p>
    )
}
