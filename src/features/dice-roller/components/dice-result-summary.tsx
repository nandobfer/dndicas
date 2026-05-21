"use client"

import type { DiceRollResponse } from "../types"

export function DiceResultSummary({ result }: { result: DiceRollResponse | null }) {
    if (!result) {
        return null
    }

    return (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-white/35">Total</p>
                    <p className="text-5xl font-black text-white">{result.total}</p>
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
