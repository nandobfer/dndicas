"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, X } from "lucide-react"
import { GlassBackdrop } from "@/components/ui/glass-backdrop"
import { cn } from "@/core/utils"
import { colors, diceColors } from "@/lib/config/colors"
import { buildDiceBreakdown, signedNumber } from "../dice-breakdown"
import type { DiceCriticalState, DiceModifierPartColor, DiceRollResponse } from "../types"
import { CRITICAL_STAGE_CONFIG } from "./critical-highlight"

/** Cores das parcelas: as mesmas do `CalcTooltip` da ficha. */
const PART_CLASSES: Record<DiceModifierPartColor, string> = {
    strength: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    dexterity: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    constitution: "bg-red-500/20 text-red-300 border-red-500/30",
    intelligence: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    wisdom: "bg-slate-400/20 text-slate-300 border-slate-400/30",
    charisma: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    prof: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    bonus: "bg-green-500/20 text-green-300 border-green-500/30",
    base: "bg-white/10 text-white/70 border-white/20",
    manual: "bg-orange-500/20 text-orange-300 border-orange-500/30",
}

const HOVER_OPEN_DELAY_MS = 120

interface DiceResultTooltipProps {
    roll: DiceRollResponse
    children: React.ReactNode
    /** Crítico mostrado no tooltip; sem a prop, vem do d20 da rolagem. `null` esconde. */
    criticalState?: DiceCriticalState | null
    /** Atributos 4d6: o menor dado aparece descartado e a pontuação sem ele. */
    dropLowest?: boolean
    side?: "top" | "bottom" | "left" | "right"
    align?: "start" | "center" | "end"
    className?: string
    "data-testid"?: string
}

/**
 * Tooltip com a conta de uma rolagem (DND-47): dados um a um, o par de d20 da vantagem/desvantagem (mantido e
 * descartado), cada parcela do modificador e a soma até o total do servidor. Abre no hover, no foco e no toque; fecha
 * com Esc, ao sair o mouse, ao perder o foco ou ao tocar fora. Fica num portal (o card não o corta) e troca de lado
 * quando falta espaço.
 */
export function DiceResultTooltip({ roll, children, criticalState, dropLowest = false, side = "top", align = "center", className, "data-testid": testId }: DiceResultTooltipProps) {
    const [open, setOpen] = React.useState(false)
    const hoverTimer = React.useRef<number | null>(null)
    const anchorRef = React.useRef<HTMLSpanElement | null>(null)
    // Foco vindo de um toque/clique: quem decide é o clique (o toque alterna), não o foco.
    const pointerFocus = React.useRef(false)
    const id = React.useId()
    const contentId = `dice-result-tooltip-${id.replace(/:/g, "")}`
    const breakdown = React.useMemo(() => buildDiceBreakdown(roll, { dropLowest, criticalState }), [roll, dropLowest, criticalState])

    const clearTimer = () => {
        if (hoverTimer.current !== null) {
            window.clearTimeout(hoverTimer.current)
            hoverTimer.current = null
        }
    }
    React.useEffect(() => clearTimer, [])

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Anchor asChild>
                <span
                    ref={anchorRef}
                    role="button"
                    tabIndex={0}
                    aria-label={`Total ${roll.total}: ver como foi calculado`}
                    aria-describedby={open ? contentId : undefined}
                    aria-expanded={open}
                    data-testid={testId ?? "dice-result-tooltip-trigger"}
                    className={cn("cursor-help rounded-sm underline decoration-white/25 decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white/40", className)}
                    onPointerEnter={(event) => {
                        if (event.pointerType !== "mouse") return
                        clearTimer()
                        hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS)
                    }}
                    onPointerLeave={(event) => {
                        if (event.pointerType !== "mouse") return
                        clearTimer()
                        setOpen(false)
                    }}
                    onPointerDown={() => {
                        pointerFocus.current = true
                    }}
                    onFocus={() => {
                        if (!pointerFocus.current) setOpen(true)
                    }}
                    onBlur={() => {
                        pointerFocus.current = false
                        setOpen(false)
                    }}
                    onClick={(event) => {
                        pointerFocus.current = false
                        // Mouse: o hover já abriu e o clique mantém. Toque: alterna (tocar fora fecha).
                        const pointer = (event.nativeEvent as PointerEvent).pointerType
                        if (pointer === "mouse") return setOpen(true)
                        setOpen((current) => !current)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setOpen(false)
                        else if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setOpen((current) => !current)
                        }
                    }}
                >
                    {children}
                </span>
            </PopoverPrimitive.Anchor>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    id={contentId}
                    role="tooltip"
                    side={side}
                    align={align}
                    sideOffset={8}
                    collisionPadding={10}
                    avoidCollisions
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    onEscapeKeyDown={() => setOpen(false)}
                    onInteractOutside={(event) => {
                        // Tocar no próprio total é o clique que alterna: não conta como "fora".
                        if (anchorRef.current && event.target instanceof Node && anchorRef.current.contains(event.target)) event.preventDefault()
                    }}
                    className="relative z-[9999] w-[min(20rem,90vw)] overflow-hidden rounded-xl border border-white/10 bg-black/70 p-3 text-white shadow-2xl shadow-black/50 outline-none backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                    data-testid="dice-result-tooltip"
                >
                    <GlassBackdrop />
                    <DiceBreakdownView breakdown={breakdown} />
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    )
}

function DiceBreakdownView({ breakdown }: { breakdown: ReturnType<typeof buildDiceBreakdown> }) {
    const critical = breakdown.critical ? CRITICAL_STAGE_CONFIG[breakdown.critical] : null
    return (
        <div className="relative z-10 space-y-2.5 text-xs">
            <div className="space-y-0.5" data-testid="dice-tooltip-header">
                <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-white">{breakdown.label ?? "Rolagem"}</p>
                    {breakdown.time && <span className="shrink-0 text-[10px] text-white/45">{breakdown.time}</span>}
                </div>
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60">
                    <span
                        className={cn(
                            "rounded-full border px-1.5 py-px font-semibold",
                            breakdown.mode === "advantage" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : breakdown.mode === "disadvantage" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-white/15 bg-white/5 text-white/70",
                        )}
                        data-testid="dice-tooltip-mode"
                    >
                        {breakdown.modeLabel}
                    </span>
                    <span className="font-mono" data-testid="dice-tooltip-formula">{breakdown.formula}</span>
                </p>
            </div>

            {breakdown.d20Pair && (
                <div className="space-y-1" data-testid="dice-tooltip-d20-pair">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{breakdown.d20Pair.mode === "advantage" ? "Vantagem: vale o maior" : "Desvantagem: vale o menor"}</p>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 font-black text-emerald-100" data-kept="true" data-testid="dice-tooltip-d20-kept">
                            <Check className="h-3 w-3" aria-hidden />
                            d20 {breakdown.d20Pair.kept}
                            <span className="text-[10px] font-semibold text-emerald-200/80">mantido</span>
                        </span>
                        <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white/40" data-discarded="true" data-testid="dice-tooltip-d20-discarded">
                            <X className="h-3 w-3" aria-hidden />
                            <span className="line-through">d20 {breakdown.d20Pair.discarded}</span>
                            <span className="text-[10px]">descartado</span>
                        </span>
                    </div>
                </div>
            )}

            <div className="space-y-1" data-testid="dice-tooltip-terms">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Dados rolados</p>
                {breakdown.terms.map((term, index) => (
                    <div key={`${term.dice}-${index}`} className="flex flex-wrap items-center gap-1" data-testid="dice-tooltip-term" data-dice={term.dice}>
                        <span className="min-w-[2.75rem] font-mono font-semibold" style={{ color: colors.rarity[diceColors[term.dice].rarity] }}>
                            {term.label}
                        </span>
                        <span className="text-white/35">→</span>
                        {term.values.map((die, dieIndex) => (
                            <span
                                key={dieIndex}
                                data-testid="dice-tooltip-die"
                                data-role={die.role}
                                className={cn(
                                    "inline-flex min-w-[1.6rem] justify-center rounded-md border px-1.5 py-px font-bold",
                                    die.role === "dropped" ? "border-white/10 bg-white/5 text-white/35 line-through" : die.role === "kept" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : cn(diceColors[term.dice].border, diceColors[term.dice].bg, "text-white"),
                                )}
                                title={die.role === "dropped" ? "Menor dado, descartado" : undefined}
                            >
                                {die.value}
                            </span>
                        ))}
                    </div>
                ))}
                {breakdown.keptScore !== null && (
                    <p className="text-[11px] text-white/60" data-testid="dice-tooltip-kept-score">
                        Pontuação sem o menor dado: <span className="font-bold text-white">{breakdown.keptScore}</span>
                    </p>
                )}
            </div>

            <div className="space-y-1 border-t border-white/10 pt-2" data-testid="dice-tooltip-lines">
                <div className="flex items-center justify-between gap-2" data-testid="dice-tooltip-line" data-kind="dice">
                    <span className="text-white/70">{breakdown.diceLabel}</span>
                    <span className="font-bold text-white">{breakdown.diceTotal}</span>
                </div>
                {breakdown.lines.map((part, index) => (
                    <div key={`${part.label}-${index}`} className="flex items-center justify-between gap-2" data-testid="dice-tooltip-line" data-kind="modifier">
                        <span className={cn("truncate rounded-md border px-1.5 py-px font-semibold", PART_CLASSES[part.color ?? "base"])}>{part.label}</span>
                        <span className="font-bold text-white">{signedNumber(part.value)}</span>
                    </div>
                ))}
                {breakdown.lines.length === 0 && <p className="text-white/45" data-testid="dice-tooltip-no-modifier">Sem modificador</p>}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                <span className="font-mono text-[11px] text-white/70" data-testid="dice-tooltip-equation">{breakdown.equation}</span>
                <span className="text-lg font-black text-white" data-testid="dice-tooltip-total">{breakdown.total}</span>
            </div>

            {critical && (
                <p className={cn("rounded-full border px-2 py-0.5 text-center text-[10px] font-black uppercase tracking-[0.22em]", critical.badgeClassName)} data-testid="dice-tooltip-critical">
                    {critical.label}
                </p>
            )}
        </div>
    )
}
