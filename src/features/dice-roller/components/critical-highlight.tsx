"use client"

import { motion } from "framer-motion"
import { colors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { DiceCriticalState } from "../types"

/** Cores e selo do crítico, os mesmos da rolagem flutuante. */
export const CRITICAL_STAGE_CONFIG: Record<DiceCriticalState, { color: string; label: string; badgeClassName: string }> = {
    "critical-success": {
        color: colors.rarity.uncommon,
        label: "Sucesso crítico",
        badgeClassName: "border-emerald-300/40 bg-emerald-400/18 text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.4)]",
    },
    "critical-failure": {
        color: colors.rarity.artifact,
        label: "Falha crítica",
        badgeClassName: "border-red-300/40 bg-red-400/18 text-red-50 shadow-[0_0_24px_rgba(239,68,68,0.38)]",
    },
}

/** Sombra de brilho da borda no crítico (no padrão do palco do dado). */
export const criticalBoxShadow = (color: string) => `inset 0 0 36px ${color}30, 0 0 48px ${color}40, 0 0 120px ${color}24`

/**
 * Destaque animado do crítico (fundo pulsando, gradiente girando e borda pulsando), sem fim, atrás do conteúdo. Quem usa
 * precisa de `relative overflow-hidden` e do mesmo arredondamento (`rounded`: classes de cada camada).
 */
export function CriticalHighlight({ state, rounded = { inner: "rounded-[1.9rem]", border: "rounded-[1.8rem]" } }: { state: DiceCriticalState; rounded?: { inner: string; border: string } }) {
    const color = CRITICAL_STAGE_CONFIG[state].color
    return (
        <>
            <motion.div
                aria-hidden="true"
                data-testid="critical-highlight"
                data-critical-state={state}
                className="pointer-events-none absolute inset-[-12%] z-0 rounded-full blur-3xl"
                style={{ background: `radial-gradient(circle, ${color}55 0%, ${color}18 35%, transparent 72%)` }}
                animate={{ opacity: [0.5, 0.95, 0.6], scale: [0.94, 1.08, 0.97] }}
                transition={{ duration: 1.45, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                aria-hidden="true"
                className={cn("pointer-events-none absolute inset-2 z-0", rounded.inner)}
                style={{
                    background: `conic-gradient(from 0deg, transparent 0deg, ${color} 60deg, transparent 132deg, ${color} 220deg, transparent 290deg, ${color} 360deg)`,
                    opacity: 0.2,
                    filter: "blur(10px)",
                }}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 5.8, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
                aria-hidden="true"
                className={cn("pointer-events-none absolute inset-3 z-0 border", rounded.border)}
                style={{
                    borderColor: `${color}cc`,
                    boxShadow: `0 0 40px ${color}70, inset 0 0 22px ${color}50`,
                }}
                animate={{ opacity: [0.45, 1, 0.55], scale: [0.985, 1.01, 0.99] }}
                transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
            />
        </>
    )
}
