"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { GlassButton } from "@/components/ui/glass-button"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassNumberInput } from "@/components/ui/glass-number-input"
import { cn } from "@/core/utils"
import { colors, diceColors } from "@/lib/config/colors"
import { requestDiceRoll } from "../dice-api"
import { DICE_TYPES, type DiceRollMode, type DiceRollPreset, type DiceRollResponse, type DiceTerm, type DiceType } from "../types"
import { DiceVisualStage } from "./dice-visual-stage"
import { DiceModeSelector } from "./dice-mode-selector"
import { DiceResultSummary } from "./dice-result-summary"

function normalizeTerms(terms: DiceTerm[]) {
    return terms.filter((term) => term.quantity > 0)
}

function isSingleD20(terms: DiceTerm[]) {
    return terms.length === 1 && terms[0]?.dice === "d20" && terms[0]?.quantity === 1
}

function getInitialState(preset?: DiceRollPreset | null) {
    return {
        terms: preset?.terms?.length ? preset.terms : [{ dice: "d20" as DiceType, quantity: 1 }],
        modifier: preset?.modifier ?? 0,
        mode: preset?.mode ?? "normal" as DiceRollMode,
        label: preset?.label ?? "Rolagem",
        source: preset?.source ?? "manual",
    }
}

interface DiceRollerPanelProps {
    preset?: DiceRollPreset | null
    className?: string
}

export function DiceRollerPanel({ preset, className }: DiceRollerPanelProps) {
    const [terms, setTerms] = React.useState<DiceTerm[]>(() => getInitialState(preset).terms)
    const [modifier, setModifier] = React.useState<number | "">(() => getInitialState(preset).modifier)
    const [mode, setMode] = React.useState<DiceRollMode>(() => getInitialState(preset).mode)
    const labelRef = React.useRef(getInitialState(preset).label)
    const sourceRef = React.useRef(getInitialState(preset).source)
    const [result, setResult] = React.useState<DiceRollResponse | null>(null)
    const [isRolling, setIsRolling] = React.useState(false)
    const [isAnimatingDice, setIsAnimatingDice] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const normalizedTerms = normalizeTerms(terms)
    const canUseD20Mode = isSingleD20(normalizedTerms)
    const activeMode: DiceRollMode = canUseD20Mode ? mode : "normal"
    const d20ModeLocked = canUseD20Mode && activeMode !== "normal"
    const isRollButtonDisabled = isRolling || isAnimatingDice

    React.useEffect(() => {
        const next = getInitialState(preset)
        setTerms(next.terms)
        setModifier(next.modifier)
        setMode(next.mode)
        labelRef.current = next.label
        sourceRef.current = next.source
        setResult(null)
        setIsAnimatingDice(false)
        setErrorMessage(null)
    }, [preset])

    React.useEffect(() => {
        if (!canUseD20Mode && mode !== "normal") {
            setMode("normal")
        }
    }, [canUseD20Mode, mode])

    const markDirty = () => {
        setResult(null)
        setIsAnimatingDice(false)
        setErrorMessage(null)
    }

    const addDie = (dice: DiceType) => {
        markDirty()
        setTerms((current) => {
            const existing = current.find((term) => term.dice === dice)
            if (existing) {
                return current.map((term) => term.dice === dice ? { ...term, quantity: term.quantity + 1 } : term)
            }
            return [...current, { dice, quantity: 1 }]
        })
    }

    const adjustDie = (dice: DiceType, amount: number) => {
        markDirty()
        setTerms((current) => normalizeTerms(current.map((term) => term.dice === dice ? { ...term, quantity: term.quantity + amount } : term)))
    }

    const handleModeChange = (nextMode: DiceRollMode) => {
        markDirty()
        setMode(nextMode)
    }

    const handleModifierChange = (nextModifier: number | "") => {
        markDirty()
        setModifier(nextModifier)
    }

    const clear = () => {
        setTerms([])
        setModifier(0)
        setMode("normal")
        labelRef.current = "Rolagem"
        sourceRef.current = "manual"
        setResult(null)
        setIsAnimatingDice(false)
        setErrorMessage(null)
    }

    const handleAnimationStateChange = React.useCallback((nextIsAnimating: boolean) => {
        setIsAnimatingDice(nextIsAnimating)
    }, [])

    const handleRoll = async () => {
        const nextTerms = normalizedTerms
        if (nextTerms.length === 0) {
            setErrorMessage("Adicione pelo menos um dado.")
            return
        }

        setIsRolling(true)
        setErrorMessage(null)
        try {
            const nextResult = await requestDiceRoll({
                terms: nextTerms,
                modifier: modifier === "" ? 0 : modifier,
                mode: activeMode,
                label: labelRef.current,
                source: sourceRef.current,
            })
            setResult(nextResult)
        } catch (error) {
            console.error("Failed to roll dice", error)
            setErrorMessage(error instanceof Error ? error.message : "Não foi possível rolar os dados.")
        } finally {
            window.setTimeout(() => setIsRolling(false), 500)
        }
    }

    return (
        <GlassCard className={cn("relative overflow-hidden border-white/10 bg-black/35 p-0", className)}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_30%)]" />
            <div className="relative grid gap-5 p-5 md:grid-cols-[1fr_320px] md:p-7">
                <div className="space-y-5">
                    <GlassButton
                        type="button"
                        size="lg"
                        onClick={handleRoll}
                        disabled={isRollButtonDisabled}
                        className="w-full border-blue-400/20 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                    >
                        {isRollButtonDisabled ? "Rolando..." : "Rolar dados"}
                    </GlassButton>
                    <DiceVisualStage
                        terms={normalizedTerms}
                        result={result}
                        isRolling={isRolling}
                        mode={activeMode}
                        onAnimationStateChange={handleAnimationStateChange}
                    />
                    <DiceResultSummary result={result} />
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Adicionar dados</span>
                            <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white">
                                <RotateCcw className="h-3 w-3" />
                                limpar
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {DICE_TYPES.map((dice) => (
                                <motion.button
                                    key={dice}
                                    type="button"
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => addDie(dice)}
                                    disabled={d20ModeLocked}
                                    className={cn(
                                        "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-black transition-colors hover:bg-white/10",
                                        d20ModeLocked && "cursor-not-allowed opacity-35 hover:bg-white/5"
                                    )}
                                    style={{ color: colors.rarity[diceColors[dice].rarity] }}
                                >
                                    {dice}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-white/40">Combinação</p>
                        <div className="space-y-2">
                            {normalizedTerms.map((term) => {
                                const termControlsDisabled = d20ModeLocked && term.dice === "d20"
                                return (
                                <div key={term.dice} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                    <span className="text-sm font-black" style={{ color: colors.rarity[diceColors[term.dice].rarity] }}>{term.quantity}{term.dice}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            aria-label={`Remover ${term.dice}`}
                                            onClick={() => adjustDie(term.dice, -1)}
                                            disabled={termControlsDisabled}
                                            className={cn(
                                                "rounded-full p-1 text-white/45 hover:bg-white/10 hover:text-white",
                                                termControlsDisabled && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-white/45"
                                            )}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Adicionar ${term.dice}`}
                                            onClick={() => adjustDie(term.dice, 1)}
                                            disabled={termControlsDisabled}
                                            className={cn(
                                                "rounded-full p-1 text-white/45 hover:bg-white/10 hover:text-white",
                                                termControlsDisabled && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-white/45"
                                            )}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                )
                            })}
                        </div>
                    </div>

                    {canUseD20Mode && (
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                            <DiceModeSelector value={activeMode} onChange={handleModeChange} />
                        </div>
                    )}

                    <GlassNumberInput
                        label="Modificador"
                        value={modifier}
                        onChange={handleModifierChange}
                        placeholder="0"
                        className="rounded-2xl border border-white/10 bg-black/25 p-4"
                    />

                    {errorMessage && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">{errorMessage}</p>}
                </div>
            </div>
        </GlassCard>
    )
}
