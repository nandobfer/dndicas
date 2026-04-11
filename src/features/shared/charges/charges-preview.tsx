"use client"

import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import type { Charges } from "./types"
import { parseChargeDice, sortChargeRows } from "./utils"

function renderChargeValue(value: string) {
    const dice = parseChargeDice(value)
    if (dice) {
        return <GlassDiceValue value={dice} className="text-xs" />
    }

    return <span className="font-mono text-xs text-white/70">{value}</span>
}

export function ChargesPreview({ charges, title = "Cargas" }: { charges?: Charges; title?: string }) {
    if (!charges) return null

    if (charges.mode === "fixed") {
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">{title}</p>
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-xs text-white/45">Fixa</span>
                    {renderChargeValue(charges.value)}
                </div>
            </div>
        )
    }

    if (charges.mode === "proficiency") {
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">{title}</p>
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-xs text-white/45">Tipo</span>
                    <span className="text-xs font-semibold text-white/75">Proficiência</span>
                </div>
            </div>
        )
    }

    const rows = sortChargeRows(charges.values)

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">{title} por nível</p>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[220px] border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.03]">
                                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Nível</th>
                                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Cargas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.level} className="border-b border-white/5 last:border-b-0">
                                    <td className="px-3 py-2 text-xs font-semibold text-white/70">{row.level}</td>
                                    <td className="px-3 py-2">{renderChargeValue(row.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
