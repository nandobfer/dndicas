"use client"

import { motion } from "framer-motion"
import { ClipboardPen } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxGameMessageDto } from "../../game-types"

/**
 * DND-51: linha da mesa quando o Maddox corrige a ficha pelo "Pergunte ao mestre" ("Ficha de X corrigida:" e uma linha
 * por alteração, com o motivo). Todos os jogadores veem, como a linha de PV.
 */
export function SheetChangeLine({ message }: { message: MaddoxGameMessageDto }) {
    const [title, ...rest] = message.content.split("\n")
    if (!title?.trim()) return null
    const lines = rest.map((line) => line.replace(/^-\s*/, "").trim()).filter(Boolean)
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pb-3" data-testid="sheet-change-line">
            <div className="max-w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/75">
                <p className="flex items-center justify-center gap-1.5 font-semibold text-white/85">
                    <ClipboardPen className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.uncommon }} aria-hidden />
                    {title}
                </p>
                {lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                        {lines.map((line, index) => (
                            <li key={index} className="break-words" data-testid="sheet-change-item">
                                {line}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </motion.div>
    )
}
