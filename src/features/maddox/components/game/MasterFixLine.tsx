"use client"

import { motion } from "framer-motion"
import { BookmarkCheck, Lightbulb, Sparkles, Wrench, XCircle } from "lucide-react"
import { MADDOX_REMINDER_STATUS_LABELS } from "../../constants"
import type { MaddoxGameMessageDto } from "../../game-types"

const ICONS = { reminder: Lightbulb, "check-update": Wrench, "check-cancel": XCircle } as const
const STATUS_ICONS = { saved: BookmarkCheck, discarded: Sparkles } as const

/**
 * DND-74: linha de resultado do "Conversar com o Mestre", no desenho da lembrança injetada (`ReminderLine`): "Teste de
 * Furtividade de Fulano atualizado: CD 15 → 10", "Lembrança injetada: …" (com o que aconteceu com ela) ou "Teste de
 * Atletismo de Fulano cancelado". Toda a mesa vê.
 */
export function MasterFixLine({ message, color }: { message: MaddoxGameMessageDto; color: string }) {
    const text = message.content.trim()
    if (!text) return null
    const kind = message.masterFix?.kind ?? "reminder"
    const Icon = ICONS[kind]
    const status = kind === "reminder" ? message.masterFix?.status : undefined
    const StatusIcon = status ? STATUS_ICONS[status] : null
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-0.5 pb-3 text-center" data-testid="master-fix-line" data-kind={kind}>
            <p className="flex max-w-[90%] items-start gap-1.5 text-xs text-white/70">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
                <span className="whitespace-pre-wrap break-words">{text}</span>
            </p>
            {status && StatusIcon && (
                <p className="flex items-center gap-1 text-[11px] text-white/45" data-testid="master-fix-status">
                    <StatusIcon className="h-3 w-3" aria-hidden /> {status === "saved" ? MADDOX_REMINDER_STATUS_LABELS.saved : "Vale para agora"}
                </p>
            )}
        </motion.div>
    )
}
