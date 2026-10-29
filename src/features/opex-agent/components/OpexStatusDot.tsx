"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { OpexSessionStatus } from "../types"

export const OPEX_STATUS_LABELS: Record<OpexSessionStatus, string> = {
    idle: "Ociosa",
    running: "Respondendo",
    awaiting_confirmation: "Aguardando confirmação",
    error: "Com erro",
}

const COLORS: Record<OpexSessionStatus, string> = {
    idle: "bg-muted-foreground/40",
    running: "bg-primary",
    awaiting_confirmation: "bg-warning",
    error: "bg-destructive",
}

/** Ponto de situação da sessão (pulsa enquanto responde); o texto vai para o leitor de tela. */
export function OpexStatusDot({ status, className }: { status: OpexSessionStatus; className?: string }) {
    const reduceMotion = useReducedMotion() ?? false
    const pulsing = status === "running" || status === "awaiting_confirmation"
    return (
        <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)} title={OPEX_STATUS_LABELS[status]}>
            {pulsing && !reduceMotion && (
                <motion.span
                    className={cn("absolute inset-0 rounded-full", COLORS[status])}
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: 0, scale: 2.4 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    aria-hidden
                />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", COLORS[status])} aria-hidden />
            <span className="sr-only">{OPEX_STATUS_LABELS[status]}</span>
        </span>
    )
}
