"use client"

import { useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/core/utils"
import { GlassBackdrop } from "@/components/ui/glass-backdrop"
import type { CalcPart } from "../utils/dnd-calculations"

// Attribute colors match attributeColors in src/lib/config/colors.ts
// strength=amber, dexterity=emerald, constitution=red, intelligence=blue, wisdom=slate, charisma=purple
const COLOR_MAP: Record<CalcPart["color"], string> = {
    // Attributes
    strength:     "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    dexterity:    "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    constitution: "bg-red-500/20 text-red-300 border border-red-500/30",
    intelligence: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    wisdom:       "bg-slate-400/20 text-slate-300 border border-slate-400/30",
    charisma:     "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    // Non-attribute
    prof:   "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
    bonus:  "bg-green-500/20 text-green-300 border border-green-500/30",
    base:   "bg-white/10 text-white/60 border border-white/20",
    manual: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
}

interface CalcTooltipProps {
    formula: string
    parts?: CalcPart[]
    result?: string
    children: React.ReactNode
    className?: string
}

function getTooltipPosition(pos: { x: number; y: number }) {
    const tooltipWidth = 260
    const tooltipHeight = 132
    const gap = 14
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0
    const prefersLeft = pos.x + gap + tooltipWidth > viewportWidth - 12
    const prefersTop = pos.y + gap + tooltipHeight > viewportHeight - 12

    return {
        left: Math.max(12, Math.min(viewportWidth - 12, prefersLeft ? pos.x - gap : pos.x + gap)),
        top: Math.max(12, Math.min(viewportHeight - 12, prefersTop ? pos.y - gap : pos.y + gap)),
        transform: `${prefersLeft ? "translateX(-100%) " : ""}${prefersTop ? "translateY(-100%)" : ""}`.trim(),
    }
}

export function CalcTooltip({ formula, parts, result, children, className }: CalcTooltipProps) {
    const [visible, setVisible] = useState(false)
    const [pos, setPos] = useState({ x: 0, y: 0 })

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setPos({ x: e.clientX, y: e.clientY })
    }, [])

    return (
        <span
            className={cn("cursor-help", className)}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onMouseMove={handleMouseMove}
        >
            {children}
            {visible && typeof document !== "undefined" && createPortal(
                <div
                    style={{
                        position: "fixed",
                        ...getTooltipPosition(pos),
                        zIndex: 9999,
                    }}
                    className="pointer-events-none rounded-lg px-3 py-2 text-sm border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-sm min-w-[180px]"
                >
                    <GlassBackdrop />
                    <div className="relative z-10 space-y-2">
                        {result && (
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/45">Resultado</span>
                                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-base font-black text-white shadow-[0_0_20px_rgba(255,255,255,0.08)]">
                                    {result}
                                </span>
                            </div>
                        )}
                        {parts && parts.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {parts.map((part, i) => (
                                    <span
                                        key={i}
                                        className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", COLOR_MAP[part.color])}
                                    >
                                        {part.label} {part.value}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1.5">
                                <span className="font-mono text-[10px] text-white/70">{formula}</span>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </span>
    )
}
