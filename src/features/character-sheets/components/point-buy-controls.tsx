"use client"

import { cn } from "@/core/utils"
import { attributeColors } from "@/lib/config/colors"
import { ABILITY_SCORE_KEYS, POINT_BUY_BUDGET, POINT_BUY_COSTS, getPointBuyCost } from "../utils/ability-score-rules"
import type { AttributeType } from "../types/character-sheet.types"

const ATTRIBUTE_LABELS: Record<AttributeType, keyof typeof attributeColors> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

/** Compra de pontos (27 pontos, 8–15): usada pela criação assistida de ficha e pelo card de atributos do Maddox. */
export function PointBuyControls({
    scores,
    onChange,
    disabled = false,
}: {
    scores: Record<AttributeType, number>
    onChange: (attr: AttributeType, value: number) => void
    disabled?: boolean
}) {
    const spent = getPointBuyCost(scores)
    const remaining = Math.max(0, POINT_BUY_BUDGET - spent)

    return (
        <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70" data-testid="point-buy-remaining">
                Pontos disponíveis: <span className="font-bold text-white">{remaining}</span>/{POINT_BUY_BUDGET}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ABILITY_SCORE_KEYS.map((attr) => {
                    const value = scores[attr]
                    const colors = attributeColors[ATTRIBUTE_LABELS[attr]]
                    const decrementDisabled = disabled || value <= 8
                    const nextCost = POINT_BUY_COSTS[value + 1]
                    const incrementDisabled = disabled || value >= 15 || nextCost == null || spent - POINT_BUY_COSTS[value] + nextCost > POINT_BUY_BUDGET

                    return (
                        <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{ATTRIBUTE_LABELS[attr]}</span>
                                <span className="text-[10px] text-white/45">custo {POINT_BUY_COSTS[value]}</span>
                            </div>
                            <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                                <button
                                    type="button"
                                    disabled={decrementDisabled}
                                    onClick={() => onChange(attr, value - 1)}
                                    aria-label={`Diminuir ${ATTRIBUTE_LABELS[attr]}`}
                                    className="h-10 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-bold text-white/70 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    -
                                </button>
                                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center text-2xl font-black text-white" data-testid={`point-buy-${attr}`}>
                                    {value}
                                </div>
                                <button
                                    type="button"
                                    disabled={incrementDisabled}
                                    onClick={() => onChange(attr, value + 1)}
                                    aria-label={`Aumentar ${ATTRIBUTE_LABELS[attr]}`}
                                    className="h-10 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-bold text-white/70 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
