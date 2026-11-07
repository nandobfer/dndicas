"use client"

import { motion } from "framer-motion"
import { BookmarkCheck, Clock, Lightbulb, Sparkles } from "lucide-react"
import { MADDOX_REMINDER_STATUS_LABELS } from "../../constants"
import type { MaddoxGameMessageDto } from "../../game-types"

const STATUS_ICONS = { pending: Clock, saved: BookmarkCheck, discarded: Sparkles } as const

/**
 * Lembrança injetada por um jogador (DND-25), vista por toda a mesa como linha discreta: "{Personagem} lembrou o
 * Maddox: “…”" e, abaixo, o que aconteceu com ela (aguardando a próxima narração, guardada como memória ou usada só
 * naquela narração).
 */
export function ReminderLine({ message, color }: { message: MaddoxGameMessageDto; color: string }) {
    const status = message.reminder?.status ?? "pending"
    const Icon = STATUS_ICONS[status]
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-0.5 pb-3 text-center" data-testid="reminder-line" data-status={status}>
            <p className="flex max-w-[90%] items-start gap-1.5 text-xs text-white/70">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
                <span className="whitespace-pre-wrap break-words">
                    <span className="font-semibold text-white/85">{message.characterName ?? "Personagem"}</span> lembrou o Maddox: “{message.content}”
                </span>
            </p>
            <p className="flex items-center gap-1 text-[11px] text-white/45" data-testid="reminder-status">
                <Icon className="h-3 w-3" aria-hidden /> {MADDOX_REMINDER_STATUS_LABELS[status]}
            </p>
        </motion.div>
    )
}
