"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { colors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { getSharedDiceBox, releaseSharedDiceBox, type SharedDiceBox } from "../dice-box-loader"
import { buildDiceBoxNotation, buildDiceBoxStandbyNotation, expandStandbyVisualTerms, expandVisualResult } from "../dice-box-notation"
import { renderStaticDiceBoxStandby } from "../dice-box-static-standby"
import type { DiceCriticalState, DiceRollMode, DiceRollResponse, DiceTerm } from "../types"
import type DiceBox from "@3d-dice/dice-box-threejs"

interface DiceVisualStageProps {
    terms: DiceTerm[]
    result: DiceRollResponse | null
    isRolling: boolean
    mode: DiceRollMode
    criticalState: DiceCriticalState | null
    onAnimationStateChange?: (isAnimating: boolean) => void
    onRollComplete?: (result: DiceRollResponse) => void
}

const CRITICAL_STAGE_CONFIG: Record<DiceCriticalState, { color: string, label: string, badgeClassName: string }> = {
    "critical-success": {
        color: colors.rarity.uncommon,
        label: "Sucesso crítico",
        badgeClassName: "border-emerald-300/40 bg-emerald-400/18 text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.4)]",
    },
    "critical-failure": {
        color: colors.rarity.artifact,
        label: "Falha crítica",
        badgeClassName: "border-red-300/40 bg-red-400/18 text-red-50 shadow-[0_0_24px_rgba(239,68,68,0.38)]",
    },
}

function getStageColor(mode: DiceRollMode, criticalState: DiceCriticalState | null) {
    if (criticalState) return CRITICAL_STAGE_CONFIG[criticalState].color
    if (mode === "advantage") return colors.rarity.uncommon
    if (mode === "disadvantage") return colors.rarity.artifact
    return colors.rarity.rare
}

function buildContainerId(reactId: string) {
    return `dice-box-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

export function DiceVisualStage({ terms, result, isRolling, mode, criticalState, onAnimationStateChange, onRollComplete }: DiceVisualStageProps) {
    const reactId = React.useId()
    const containerId = React.useMemo(() => buildContainerId(reactId), [reactId])
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const diceBoxRef = React.useRef<DiceBox | null>(null)
    const sharedContainerRef = React.useRef<SharedDiceBox | null>(null)
    const rollTokenRef = React.useRef(0)
    const hasRenderedRollRef = React.useRef(false)
    const lastRolledResultIdRef = React.useRef<string | null>(null)
    const standbyNotationRef = React.useRef<string | null>(null)
    const [isReady, setIsReady] = React.useState(false)
    const [visualError, setVisualError] = React.useState<string | null>(null)
    const [showRollResults, setShowRollResults] = React.useState(false)
    const showStageResults = result && showRollResults
    const dice = showStageResults ? expandVisualResult(result) : expandStandbyVisualTerms(terms, mode)
    const stageColor = getStageColor(mode, showStageResults ? criticalState : null)
    const criticalConfig = showStageResults && criticalState ? CRITICAL_STAGE_CONFIG[criticalState] : null

    React.useEffect(() => {
        let cancelled = false
        const containerElement = containerRef.current

        async function initializeDiceBox() {
            try {
                const shared = await getSharedDiceBox()
                if (cancelled) {
                    releaseSharedDiceBox(shared)
                    return
                }

                sharedContainerRef.current = shared
                const box = shared.box

                if (containerElement && shared.container.parentElement !== containerElement) {
                    containerElement.appendChild(shared.container)
                    
                    // Reset styling for the visual stage wrapper
                    shared.container.style.position = "absolute"
                    shared.container.style.inset = "0"
                    shared.container.style.width = "100%"
                    shared.container.style.height = "100%"
                    shared.container.style.left = "0"
                    shared.container.style.top = "0"
                    shared.container.style.zIndex = "1"
                    
                    // Dispatch a resize event to ensure Three.js canvas size matches the new container
                    setTimeout(() => {
                        if (typeof window !== "undefined") {
                            window.dispatchEvent(new Event("resize"))
                        }
                    }, 50)
                }

                diceBoxRef.current = box
                setIsReady(true)
            } catch (error) {
                console.error("Failed to initialize dice box", error)
                if (!cancelled) {
                    setVisualError("Visual 3D indisponível neste navegador.")
                    onAnimationStateChange?.(false)
                }
            }
        }

        initializeDiceBox()

        return () => {
            cancelled = true
            onAnimationStateChange?.(false)
            if (sharedContainerRef.current) {
                releaseSharedDiceBox(sharedContainerRef.current)
                sharedContainerRef.current = null
            }
            diceBoxRef.current = null
            containerElement?.replaceChildren()
        }
    }, [onAnimationStateChange])

    React.useEffect(() => {
        const box = diceBoxRef.current
        if (!box || !isReady) {
            if (result && visualError) {
                onRollComplete?.(result)
            }
            return
        }

        if (!result) {
            rollTokenRef.current += 1
            onAnimationStateChange?.(false)
            lastRolledResultIdRef.current = null
            setShowRollResults(false)

            const standbyNotation = buildDiceBoxStandbyNotation(terms, mode)
            if (!standbyNotation) {
                standbyNotationRef.current = null
                box.clearDice?.()
                hasRenderedRollRef.current = false
                return
            }

            if (standbyNotationRef.current === standbyNotation && !hasRenderedRollRef.current) {
                return
            }

            standbyNotationRef.current = standbyNotation
            hasRenderedRollRef.current = false
            setVisualError(null)

            const didRenderStandby = renderStaticDiceBoxStandby(box, standbyNotation)
            if (!didRenderStandby) {
                box.clearDice?.()
                setVisualError("Não foi possível preparar os dados em standby.")
            }
            return
        }

        if (lastRolledResultIdRef.current === result.rollId) {
            return
        }

        const notation = buildDiceBoxNotation(result)
        if (!notation) {
            return
        }

        lastRolledResultIdRef.current = result.rollId
        standbyNotationRef.current = null
        hasRenderedRollRef.current = true
        const token = rollTokenRef.current + 1
        rollTokenRef.current = token
        setVisualError(null)
        onAnimationStateChange?.(true)
        setShowRollResults(false)

        box.clearDice?.()
        box.roll(notation)
            .catch((error) => {
                console.error("Failed to roll dice box", error)
                if (rollTokenRef.current === token) {
                    setVisualError("Não foi possível animar esta rolagem em 3D.")
                }
            })
            .finally(() => {
                if (rollTokenRef.current === token) {
                    onAnimationStateChange?.(false)
                    setShowRollResults(true)
                    if (result) {
                        onRollComplete?.(result)
                    }
                }
            })
    }, [isReady, mode, onAnimationStateChange, onRollComplete, result, terms, visualError])

    return (
        <div
            data-testid="dice-visual-stage"
            data-mode={mode}
            data-critical-state={showStageResults && criticalState ? criticalState : "none"}
            data-border-color={stageColor}
            className={cn(
                "relative flex min-h-[260px] w-[450px] max-w-full mx-auto items-center justify-center overflow-hidden rounded-[2rem] border bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(0,0,0,0.08)_46%,rgba(0,0,0,0.38))] p-5 transition-colors duration-500",
                mode === "normal" ? "border-blue-400/25" : "border-white/10"
            )}
            style={{
                borderColor: `${stageColor}80`,
                boxShadow: criticalConfig
                    ? `inset 0 0 36px ${stageColor}30, 0 0 48px ${stageColor}40, 0 0 120px ${stageColor}24`
                    : `inset 0 0 32px ${stageColor}16, 0 0 42px ${stageColor}12`,
            }}
        >
            {criticalConfig && (
                <>
                    <motion.div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-[-12%] z-0 rounded-full blur-3xl"
                        style={{ background: `radial-gradient(circle, ${stageColor}55 0%, ${stageColor}18 35%, transparent 72%)` }}
                        animate={{ opacity: [0.5, 0.95, 0.6], scale: [0.94, 1.08, 0.97] }}
                        transition={{ duration: 1.45, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-2 z-0 rounded-[1.9rem]"
                        style={{
                            background: `conic-gradient(from 0deg, transparent 0deg, ${stageColor} 60deg, transparent 132deg, ${stageColor} 220deg, transparent 290deg, ${stageColor} 360deg)`,
                            opacity: 0.2,
                            filter: "blur(10px)",
                        }}
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 5.8, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-3 z-0 rounded-[1.8rem] border"
                        style={{
                            borderColor: `${stageColor}cc`,
                            boxShadow: `0 0 40px ${stageColor}70, inset 0 0 22px ${stageColor}50`,
                        }}
                        animate={{ opacity: [0.45, 1, 0.55], scale: [0.985, 1.01, 0.99] }}
                        transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="pointer-events-none absolute inset-x-5 top-5 z-30 flex justify-center">
                        <span
                            data-testid="dice-critical-banner"
                            className={cn(
                                "rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.34em] backdrop-blur",
                                criticalConfig.badgeClassName
                            )}
                        >
                            {criticalConfig.label}
                        </span>
                    </div>
                </>
            )}
            <div className="absolute inset-6 rounded-full border border-white/10 blur-sm" />
            <div className="absolute h-52 w-52 rounded-full blur-3xl" style={{ backgroundColor: `${stageColor}18` }} />
            <div
                ref={containerRef}
                id={containerId}
                data-testid="dice-box-canvas-stage"
                className="absolute inset-0 z-10"
                aria-hidden="true"
            />
            {(isRolling || !isReady) && !visualError && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/10 text-xs font-black uppercase tracking-[0.28em] text-white/45">
                    <span data-testid="dice-loading-ellipsis" aria-label="Preparando dados" className="inline-flex min-w-12 justify-center">
                        <span className="animate-pulse [animation-delay:0ms]">.</span>
                        <span className="animate-pulse [animation-delay:180ms]">.</span>
                        <span className="animate-pulse [animation-delay:360ms]">.</span>
                    </span>
                </div>
            )}
            {visualError && (
                <div className="absolute inset-x-5 top-5 z-30 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-center text-xs font-medium text-amber-100">
                    {visualError}
                </div>
            )}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex max-w-full flex-wrap items-center justify-center gap-2">
                {dice.map((die, index) => {
                    const hasValue = showStageResults || !result
                    return (
                        <span
                            key={`${die.sourceDice}-${die.dice}-${index}`}
                            data-testid="dice-visual-die"
                            data-dice={die.dice}
                            data-source-dice={die.sourceDice}
                            data-value={hasValue && typeof die.value === "number" ? die.value : undefined}
                            data-roll-role={die.rollRole}
                            className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-black text-white/70 backdrop-blur"
                        >
                            {die.sourceDice}{hasValue && typeof die.value === "number" ? ` ${die.value}` : ""}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

