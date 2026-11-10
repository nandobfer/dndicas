"use client"

import { motion } from "framer-motion"
import { History } from "lucide-react"
import type { MaddoxGameMessageDto } from "../../game-types"
import { rewindNoticeText } from "../../rewind-plan"

/** Linha de aviso da volta a um turno (DND-44), para toda a mesa: "O dono voltou a mesa para o turno X" / "O dono retomou o turno N". */
export function RewindNoticeLine({ message, color }: { message: MaddoxGameMessageDto; color: string }) {
    const notice = message.rewindNotice
    if (!notice) return null
    return (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-1.5 pb-3 text-center text-xs text-white/70" data-testid="rewind-notice" data-event={notice.event}>
            <History className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
            {rewindNoticeText(notice)}
        </motion.p>
    )
}
