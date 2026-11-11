"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
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
        modifierParts: preset?.modifierParts,
    }
}

interface DiceRollerPanelProps {
    preset?: DiceRollPreset | null
    className?: string
    requestContext?: Pick<DiceRollRequest, "source" | "playerName" | "owlbearRoomId" | "owlbearPlayerId">
    onRollCreated?: (result: DiceRollResponse) => void
    onRollResolved?: (result: DiceRollResponse) => void
    externalResult?: DiceRollResponse | null
    disableRolling?: boolean
    disabledRollingMessage?: string | null
    hideConfigurationControls?: boolean
    forceCombinationModifierInline?: boolean
    /** Quem faz a rolagem oficial (padrão: `requestDiceRoll`). Ex.: o teste do Maddox rola no servidor da campanha. */
    rollRequest?: (input: Omit<DiceRollRequest, "diceSessionId">) => Promise<DiceRollResponse>
    /** Rótulo do botão de rolar (padrão "JOGAR"). */
    rollButtonLabel?: string
    /** Esconde o botão de rolar (só repete um resultado externo). */
    hideRollButton?: boolean
    /** `inline`: sem o cartão de vidro, o gradiente e o padding, e sem o resumo do resultado (o card de quem usa já mostra). */
    appearance?: "card" | "inline"
    /** Aparência e tamanho do palco 3D (padrão: moldura, tamanho normal). */
    stageVariant?: "frame" | "bare"
    stageSize?: "default" | "compact"
    /** `roll`: o palco só existe enquanto há uma rolagem ou um resultado (local ou externo) na tela. */
    stageVisibility?: "always" | "roll"
    /** Com `stageVisibility="roll"`: N ms depois do fim da animação o palco sai com animação e não volta para aquele resultado. */
    stageHideDelayMs?: number
    /** Classes extras do botão de rolar (ex.: botão pequeno num card). */
    rollButtonClassName?: string
    /** Fim da animação de qualquer rolagem (local ou externa); `onRollResolved` só avisa as locais. */
    onRollSettled?: (result: DiceRollResponse) => void
    /** Com `stageVisibility="roll"` e `stageHideDelayMs`: o palco daquele resultado terminou de sair da tela. */
    onStageHidden?: (result: DiceRollResponse) => void
    /** DND-47: o tooltip do resultado marca o menor dado como descartado (atributos 4d6). */
    resultDropLowest?: boolean
}

export function DiceRollerPanel({
    preset,
    className,
    requestContext,
    onRollCreated,
    onRollResolved,
    externalResult,
    disableRolling = false,
    disabledRollingMessage = null,
    hideConfigurationControls = false,
    forceCombinationModifierInline = false,
    rollRequest,
    rollButtonLabel = "JOGAR",
    hideRollButton = false,
    appearance = "card",
    stageVariant = "frame",
    stageSize = "default",
    stageVisibility = "always",
    stageHideDelayMs,
    rollButtonClassName,
    onRollSettled,
    onStageHidden,
    resultDropLowest = false,
}: DiceRollerPanelProps) {
    const inline = appearance === "inline"
    const [hiddenStageRollId, setHiddenStageRollId] = React.useState<string | null>(null)
    const stageHideTimeoutRef = React.useRef<number | null>(null)
    const onRollSettledRef = React.useRef(onRollSettled)
    React.useEffect(() => {
        onRollSettledRef.current = onRollSettled
    }, [onRollSettled])
    const onStageHiddenRef = React.useRef(onStageHidden)
    React.useEffect(() => {
        onStageHiddenRef.current = onStageHidden
    }, [onStageHidden])
    React.useEffect(() => () => {
        if (stageHideTimeoutRef.current) window.clearTimeout(stageHideTimeoutRef.current)
    }, [])
    const [terms, setTerms] = React.useState<DiceTerm[]>(() => getInitialState(preset).terms)
    const [modifier, setModifier] = React.useState<number | "">(() => getInitialState(preset).modifier)
    const [mode, setMode] = React.useState<DiceRollMode>(() => getInitialState(preset).mode)
    const labelRef = React.useRef(getInitialState(preset).label)
    const sourceRef = React.useRef(getInitialState(preset).source)
    const modifierPartsRef = React.useRef(getInitialState(preset).modifierParts)
    const [result, setResult] = React.useState<DiceRollResponse | null>(null)
    const [isRolling, setIsRolling] = React.useState(false)
    // Só a espera da resposta do servidor (sem a folga do botão): é o que o palco mostra como "preparando".
    const [awaitingResult, setAwaitingResult] = React.useState(false)
    const [isAnimatingDice, setIsAnimatingDice] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const lastExternalRollIdRef = React.useRef<string | null>(null)
    const animationTimeoutRef = React.useRef<number | null>(null)
    const [showResults, setShowResults] = React.useState(false)
    const isLocalRollRef = React.useRef(false)
    const [containerWidth, setContainerWidth] = React.useState(0)
    const observerRef = React.useRef<ResizeObserver | null>(null)

    const containerRef = React.useCallback((node: HTMLElement | null) => {
        if (observerRef.current) {
            observerRef.current.disconnect()
            observerRef.current = null
        }

        if (node) {
            if (typeof window !== "undefined" && typeof ResizeObserver !== "undefined") {
                const observer = new ResizeObserver((entries) => {
                    if (!entries || entries.length === 0) return
                    const { width } = entries[0].contentRect
                    setContainerWidth(width)
                })
                observer.observe(node)
                observerRef.current = observer
            }
        }
    }, [])

    React.useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [])
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

    const onRollCreatedRef = React.useRef(onRollCreated)
    React.useEffect(() => {
        onRollCreatedRef.current = onRollCreated
    }, [onRollCreated])

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
        modifierPartsRef.current = next.modifierParts
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
        setAwaitingResult(false)
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
        // O modificador digitado à mão não tem mais as parcelas do preset.
        modifierPartsRef.current = undefined
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
        modifierPartsRef.current = undefined
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
        onRollSettledRef.current?.(completedResult)
        if (stageVisibility === "roll" && stageHideDelayMs !== undefined) {
            if (stageHideTimeoutRef.current) window.clearTimeout(stageHideTimeoutRef.current)
            stageHideTimeoutRef.current = window.setTimeout(() => {
                stageHideTimeoutRef.current = null
                setHiddenStageRollId(completedResult.rollId)
            }, stageHideDelayMs)
        }
        if (isLocalRollRef.current) {
            onRollResolvedRef.current?.(completedResult)
            isLocalRollRef.current = false
        }
    }, [stageHideDelayMs, stageVisibility])

    const handleRoll = async () => {
        const nextTerms = normalizedTerms
        if (nextTerms.length === 0) {
            setErrorMessage("Adicione pelo menos um dado.")
            return
        }

        setIsRolling(true)
        setAwaitingResult(true)
        setShowResults(false)
        setErrorMessage(null)
        try {
            const nextModifier = modifier === "" ? 0 : modifier
            const nextResult = await (rollRequest ?? requestDiceRoll)({
                terms: nextTerms,
                modifier: nextModifier,
                ...(modifierPartsRef.current?.length ? { modifierParts: modifierPartsRef.current } : {}),
                mode: activeMode,
                label: labelRef.current,
                source: requestContext?.source ?? sourceRef.current,
                playerName: requestContext?.playerName,
                owlbearRoomId: requestContext?.owlbearRoomId,
                owlbearPlayerId: requestContext?.owlbearPlayerId,
            })
            isLocalRollRef.current = true
            setAwaitingResult(false)
            onRollCreatedRef.current?.(nextResult)
            setResult(nextResult)
        } catch (error) {
            console.error("Failed to roll dice", error)
            setAwaitingResult(false)
            setErrorMessage(error instanceof Error ? error.message : "Não foi possível rolar os dados.")
        } finally {
            window.setTimeout(() => setIsRolling(false), 500)
        }
    }

    const stageMounted = stageVisibility === "always" || isRolling || (result !== null && hiddenStageRollId !== result.rollId)
    const stage = (
        <DiceVisualStage
            terms={normalizedTerms}
            result={result}
            isRolling={awaitingResult}
            mode={displayedMode}
            criticalState={criticalState}
            onAnimationStateChange={handleAnimationStateChange}
            onRollComplete={handleRollComplete}
            variant={stageVariant}
            size={stageSize}
        />
    )

    const content = (
            <div className={cn(
                inline ? "relative grid gap-3" : "relative grid gap-5 p-5 md:p-7",
                hideConfigurationControls
                    ? "grid-cols-1"
                    : containerWidth === 0
                    ? "grid-cols-1"
                    : containerWidth >= 950
                        ? "grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]"
                        : "grid-cols-1"
            )}>
                <div className={inline ? "space-y-3" : "space-y-5"}>
                    {!hideRollButton && (
                        <GlassButton
                            type="button"
                            size={rollButtonClassName ? "sm" : "lg"}
                            onClick={handleRoll}
                            disabled={isRollButtonDisabled}
                            className={cn("w-full border-blue-400/20 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30", rollButtonClassName)}
                        >
                            {isRolling || isAnimatingDice ? "Rolando..." : rollButtonLabel}
                        </GlassButton>
                    )}
                    {stageVisibility === "always" ? (
                        stage
                    ) : (
                        <AnimatePresence
                            initial={false}
                            onExitComplete={() => {
                                if (result && hiddenStageRollId === result.rollId) onStageHiddenRef.current?.(result)
                            }}
                        >
                            {stageMounted && (
                                <motion.div
                                    key="dice-stage"
                                    data-testid="dice-stage-presence"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.35, ease: "easeOut" }}
                                    className="overflow-hidden"
                                >
                                    {stage}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                    {!inline && <DiceResultSummary result={showResults ? result : null} criticalState={showResults ? criticalState : null} dropLowest={resultDropLowest} />}
                </div>

                {(!hideConfigurationControls || errorMessage || disabledRollingMessage) && (
                <div className={inline ? "space-y-2" : "space-y-4"}>
                    {!hideConfigurationControls && (
                        <>
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

                            <div
                                data-testid="dice-combination-modifier-grid"
                                className={cn(
                                    "grid gap-4",
                                    forceCombinationModifierInline
                                        ? "grid-cols-[minmax(0,1fr)_minmax(120px,160px)]"
                                        : "xl:grid-cols-2"
                                )}
                            >
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
                        </>
                    )}

                    {(errorMessage || disabledRollingMessage) && (
                        <p className={cn(
                            inline ? "rounded-lg px-2.5 py-1.5 text-xs" : "rounded-xl px-3 py-2 text-sm",
                            errorMessage
                                ? "border border-red-500/20 bg-red-500/10 text-red-100"
                                : "border border-amber-500/20 bg-amber-500/10 text-amber-100"
                        )}
                        >
                            {errorMessage ?? disabledRollingMessage}
                        </p>
                    )}
                </div>
                )}
            </div>
    )

    if (inline) {
        return (
            <div ref={containerRef} data-testid="dice-roller-inline" className={cn("relative w-full max-w-full", className)}>
                {content}
            </div>
        )
    }

    return (
        <GlassCard ref={containerRef} className={cn("w-full max-w-full relative overflow-hidden border-white/10 bg-black/35 p-0", className)}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_30%)]" />
            {content}
        </GlassCard>
    )
}
