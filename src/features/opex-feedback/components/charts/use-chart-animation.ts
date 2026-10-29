"use client"

import { useReducedMotion } from "framer-motion"

/** Animação das séries do recharts, desligada com movimento reduzido (exceção registrada no AGENTS.md). */
export function useChartAnimation(): boolean {
    return !useReducedMotion()
}
