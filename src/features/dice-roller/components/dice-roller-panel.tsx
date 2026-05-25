"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { GlassButton } from "@/components/ui/glass-button"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassNumberInput } from "@/components/ui/glass-number-input"
import { cn } from "@/core/utils"
import { colors, diceColors } from "@/lib/config/colors"
import { getDiceCriticalState } from "../critical-state"
import { requestDiceRoll } from "../dice-api"
import { DICE_TYPES, type DiceRollMode, type DiceRollPreset, type DiceRollRequest, type DiceRollResponse, type DiceTerm, type DiceType } from "../types"
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
    requestContext?: Pick<DiceRollRequest, "source" | "playerName" | "owlbearRoomId" | "owlbearPlayerId">
    onRollResolved?: (result: DiceRollResponse) => void
    externalResult?: DiceRollResponse | null
    disableRolling?: boolean
    disabledRollingMessage?: string | null
}

export function DiceRollerPanel({
    preset,
    className,
    requestContext,
    onRollResolved,
    externalResult,
    disableRolling = false,
    disabledRollingMessage = null,
}: DiceRollerPanelProps) {
    const [terms, setTerms] = React.useState<DiceTerm[]>(() => getInitialState(preset).terms)
    const [modifier, setModifier] = React.useState<number | "">(() => getInitialState(preset).modifier)
    const [mode, setMode] = React.useState<DiceRollMode>(() => getInitialState(preset).mode)
    const labelRef = React.useRef(getInitialState(preset).label)
    const sourceRef = React.useRef(getInitialState(preset).source)
    const [result, setResult] = React.useState<DiceRollResponse | null>(null)
    const [isRolling, setIsRolling] = React.useState(false)
    const [isAnimatingDice, setIsAnimatingDice] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const lastExternalRollIdRef = React.useRef<string | null>(null)
    const animationTimeoutRef = React.useRef<number | null>(null)
    const [showResults, setShowResults] = React.useState(false)
    const isLocalRollRef = React.useRef(false)
    const normalizedTerms = normalizeTerms(terms)
    const canUseD20Mode = isSingleD20(normalizedTerms)
    const activeMode: DiceRollMode = canUseD20Mode ? mode : "normal"
    const displayedMode: DiceRollMode = result?.mode ?? activeMode
    const d20ModeLocked = canUseD20Mode && activeMode !== "normal"
    const isRollButtonDisabled = isRolling || isAnimatingDice || disableRolling
    const criticalState = React.useMemo(() => getDiceCriticalState(result), [result])

    const onRollResolvedRef = React.useRef(onRollResolved)
    React.useEffect(() => {
        onRollResolvedRef.current = onRollResolved
    }, [onRollResolved])

    React.useEffect(() => {
        if (animationTimeoutRef.current) {
            window.clearTimeout(animationTimeoutRef.current)
            animationTimeoutRef.current = null
        }
        const next = getInitialState(preset)
        setTerms(next.terms)
        setModifier(next.modifier)
        setMode(next.mode)
        labelRef.current = next.label
        sourceRef.current = next.source
        setResult(null)
        setIsAnimatingDice(false)
        setShowResults(false)
        isLocalRollRef.current = false
        setErrorMessage(null)
    }, [preset])

    React.useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) {
                window.clearTimeout(animationTimeoutRef.current)
            }
        }
    }, [])

    React.useEffect(() => {
        if (!externalResult || lastExternalRollIdRef.current === externalResult.rollId || result?.rollId === externalResult.rollId) return

        lastExternalRollIdRef.current = externalResult.rollId
        isLocalRollRef.current = false
        setResult(externalResult)
        setIsRolling(false)
        setShowResults(false)
        setErrorMessage(null)
    }, [externalResult, result])

    React.useEffect(() => {
        if (!canUseD20Mode && mode !== "normal") {
            setMode("normal")
        }
    }, [canUseD20Mode, mode])

    const markDirty = () => {
        if (animationTimeoutRef.current) {
            window.clearTimeout(animationTimeoutRef.current)
            animationTimeoutRef.current = null
        }
        setResult(null)
        setIsAnimatingDice(false)
        setShowResults(false)
        isLocalRollRef.current = false
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
        if (animationTimeoutRef.current) {
            window.clearTimeout(animationTimeoutRef.current)
            animationTimeoutRef.current = null
        }
        setTerms([])
        setModifier(0)
        setMode("normal")
        labelRef.current = "Rolagem"
        sourceRef.current = "manual"
        setResult(null)
        setIsAnimatingDice(false)
        setShowResults(false)
        isLocalRollRef.current = false
        setErrorMessage(null)
    }

    const handleAnimationStateChange = React.useCallback((nextIsAnimating: boolean) => {
        if (animationTimeoutRef.current) {
            window.clearTimeout(animationTimeoutRef.current)
            animationTimeoutRef.current = null
        }

        if (nextIsAnimating) {
            setIsAnimatingDice(true)
            animationTimeoutRef.current = window.setTimeout(() => {
                setIsAnimatingDice(false)
                animationTimeoutRef.current = null
            }, 1000)
        } else {
            setIsAnimatingDice(false)
        }
    }, [])

    const handleRollComplete = React.useCallback((completedResult: DiceRollResponse) => {
        setShowResults(true)
        if (isLocalRollRef.current) {
            onRollResolvedRef.current?.(completedResult)
            isLocalRollRef.current = false
        }
    }, [])

    const handleRoll = async () => {
        const nextTerms = normalizedTerms
        if (nextTerms.length === 0) {
            setErrorMessage("Adicione pelo menos um dado.")
            return
        }

        setIsRolling(true)
        setShowResults(false)
        setErrorMessage(null)
        try {
            const nextResult = await requestDiceRoll({
                terms: nextTerms,
                modifier: modifier === "" ? 0 : modifier,
                mode: activeMode,
                label: labelRef.current,
                source: requestContext?.source ?? sourceRef.current,
                playerName: requestContext?.playerName,
                owlbearRoomId: requestContext?.owlbearRoomId,
                owlbearPlayerId: requestContext?.owlbearPlayerId,
            })
            isLocalRollRef.current = true
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
            <div className="relative grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] md:p-7">
                <div className="space-y-5">
                    <GlassButton
                        type="button"
                        size="lg"
                        onClick={handleRoll}
                        disabled={isRollButtonDisabled}
                        className="w-full border-blue-400/20 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                    >
                        {isRollButtonDisabled ? "Rolando..." : "JOGAR"}
                    </GlassButton>
                    <DiceVisualStage
                        terms={normalizedTerms}
                        result={result}
                        isRolling={isRolling}
                        mode={displayedMode}
                        criticalState={criticalState}
                        onAnimationStateChange={handleAnimationStateChange}
                        onRollComplete={handleRollComplete}
                    />
                    <DiceResultSummary result={showResults ? result : null} criticalState={showResults ? criticalState : null} />
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
                        <div data-testid="dice-add-grid" className="grid grid-cols-4 gap-2">
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

                    <div data-testid="dice-combination-modifier-grid" className="grid gap-4 xl:grid-cols-2">
                        <div data-testid="dice-combination-card" className="rounded-2xl border border-white/10 bg-black/25 p-4">
                            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-white/40">Combinação</p>
                            <div className="space-y-2">
                                {normalizedTerms.map((term) => {
                                    const termControlsDisabled = d20ModeLocked && term.dice === "d20"
                                    return (
                                        <div
                                            key={term.dice}
                                            data-testid={`dice-combination-row-${term.dice}`}
                                            className="flex min-h-[40px] items-center rounded-xl border border-white/10 bg-white/5 px-2"
                                        >
                                            <button
                                                type="button"
                                                aria-label={`Remover ${term.dice}`}
                                                onClick={() => adjustDie(term.dice, -1)}
                                                disabled={termControlsDisabled}
                                                className={cn(
                                                    "rounded-full p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white",
                                                    termControlsDisabled && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-white/45"
                                                )}
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                            <span className="min-w-0 flex-1 px-2 py-1 text-center text-lg font-black" style={{ color: colors.rarity[diceColors[term.dice].rarity] }}>{term.quantity}{term.dice}</span>
                                            <button
                                                type="button"
                                                aria-label={`Adicionar ${term.dice}`}
                                                onClick={() => adjustDie(term.dice, 1)}
                                                disabled={termControlsDisabled}
                                                className={cn(
                                                    "rounded-full p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white",
                                                    termControlsDisabled && "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-white/45"
                                                )}
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <GlassNumberInput
                            label="Modificador"
                            value={modifier}
                            onChange={handleModifierChange}
                            placeholder="0"
                            className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        />
                    </div>

                    {canUseD20Mode && (
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                            <DiceModeSelector value={activeMode} onChange={handleModeChange} />
                        </div>
                    )}

                    {(errorMessage || disabledRollingMessage) && (
                        <p className={cn(
                            "rounded-xl px-3 py-2 text-sm",
                            errorMessage
                                ? "border border-red-500/20 bg-red-500/10 text-red-100"
                                : "border border-amber-500/20 bg-amber-500/10 text-amber-100"
                        )}
                        >
                            {errorMessage ?? disabledRollingMessage}
                        </p>
                    )}
                </div>
            </div>
        </GlassCard>
    )
}
