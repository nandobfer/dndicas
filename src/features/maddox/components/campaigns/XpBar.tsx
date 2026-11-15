"use client"

import { cn } from "@/lib/utils"
import type { MaddoxXpProgressDto } from "../../campaign-types"
import { xpProgressLabel } from "../../experience-progress"

interface Props {
    /** `null` (modo Marco, sem ficha ou entrevista em andamento) = não mostra nada. */
    xp: MaddoxXpProgressDto | null | undefined
    /** Cor do rigor da campanha. */
    color: string
    className?: string
}

/** Barrinha de XP do personagem no modo Experiência (DND-63): XP atual e quanto falta para o próximo nível. */
export function XpBar({ xp, color, className }: Props) {
    if (!xp) return null
    const { text, detail } = xpProgressLabel(xp)
    return (
        <div className={cn("mt-1 flex items-center gap-2", className)} data-testid="xp-bar" title={detail}>
            <div
                role="progressbar"
                aria-label={detail}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={xp.percent}
                className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full border"
                style={{ borderColor: `${color}55`, backgroundColor: `${color}1a` }}
            >
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${xp.percent}%`, backgroundColor: color }} />
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-white/60">{text}</span>
        </div>
    )
}
