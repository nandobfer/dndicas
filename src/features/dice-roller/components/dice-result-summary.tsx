"use client"

import { cn } from "@/core/utils"
import type { DiceCriticalState, DiceRollResponse } from "../types"

const CRITICAL_SUMMARY_CONFIG: Record<DiceCriticalState, { badge: string, cardClassName: string, totalClassName: string }> = {
    "critical-success": {
        badge: "Sucesso crítico",
        cardClassName: "border-emerald-400/25 bg-emerald-500/10 shadow-[0_0_42px_rgba(16,185,129,0.14)]",
        totalClassName: "text-emerald-200 drop-shadow-[0_0_18px_rgba(16,185,129,0.45)]",
    },
    "critical-failure": {
        badge: "Falha crítica",
        cardClassName: "border-red-400/25 bg-red-500/10 shadow-[0_0_42px_rgba(239,68,68,0.14)]",
        totalClassName: "text-red-200 drop-shadow-[0_0_18px_rgba(239,68,68,0.4)]",
    },
}

interface DiceResultSummaryProps {
    result: DiceRollResponse | null
    criticalState: DiceCriticalState | null
}

export function DiceResultSummary({ result, criticalState }: DiceResultSummaryProps) {
    if (!result) {
        return null
    }

    const criticalConfig = criticalState ? CRITICAL_SUMMARY_CONFIG[criticalState] : null

    return (
        <div
            data-testid="dice-result-summary"
            data-critical-state={criticalState ?? "none"}
            className={cn(
                "space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 transition-colors duration-500",
                criticalConfig?.cardClassName
            )}
        >
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-white/35">Total</p>
                    <div className="flex flex-wrap items-center gap-3">
                        <p className={cn("text-5xl font-black text-white", criticalConfig?.totalClassName)}>{result.total}</p>
                        {criticalConfig && (
                            <span
                                data-testid="dice-critical-summary-badge"
                                className={cn(
                                    "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em]",
                                    criticalState === "critical-success"
                                        ? "border-emerald-300/30 bg-emerald-400/14 text-emerald-100"
                                        : "border-red-300/30 bg-red-400/14 text-red-100"
                                )}
                            >
                                {criticalConfig.badge}
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-right text-sm text-white/55">
                    <p>Dados: <span className="font-bold text-white/80">{result.diceTotal}</span></p>
                    <p>Modificador: <span className="font-bold text-white/80">{result.modifier >= 0 ? "+" : ""}{result.modifier}</span></p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {result.terms.map((term, index) => (
                    <span key={`${term.dice}-${index}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
                        {term.quantity}{term.dice}: {term.results.join(", ")}
                    </span>
                ))}
                {result.selectedD20?.discarded !== undefined && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50">
                        descartado: {result.selectedD20.discarded}
                    </span>
                )}
            </div>
        </div>
    )
}
