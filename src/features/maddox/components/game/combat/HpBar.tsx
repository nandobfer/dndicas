"use client"

import { cn } from "@/core/utils"
import { hpColor } from "./combat-visuals"

export interface HpBarValue {
    current: number
    max: number
    temp: number
}

export const hpPercent = (hp: HpBarValue) => (hp.max ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0)

interface Props {
    hp: HpBarValue
    /** Nome do personagem no rótulo acessível ("PV de X: 9 de 12"). */
    name?: string
    testId?: string
    className?: string
}

/** Barra e números de PV do card da mesa (DND-63), dentro e fora do combate (DND-75). */
export function HpBar({ hp, name, testId = "seat-hp", className }: Props) {
    const label = `PV${name ? ` de ${name}` : ""}: ${hp.current} de ${hp.max}${hp.temp ? ` (+${hp.temp} temporários)` : ""}`
    return (
        <div className={cn("flex items-center gap-2", className)} data-testid={testId}>
            <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={hp.max} aria-valuenow={hp.current} className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${hpPercent(hp)}%`, background: hpColor(hp.current, hp.max) }} />
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/80">
                {hp.current}/{hp.max}
                {hp.temp ? ` +${hp.temp}` : ""}
            </span>
        </div>
    )
}
