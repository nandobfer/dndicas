"use client"

import * as React from "react"
import { colors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { getSharedDiceBox, releaseSharedDiceBox, syncDiceBoxSize, type SharedDiceBox } from "../dice-box-loader"
import { buildDiceBoxNotation, buildDiceBoxStandbyNotation, expandStandbyVisualTerms, expandVisualResult } from "../dice-box-notation"
import { renderStaticDiceBoxStandby } from "../dice-box-static-standby"
import { CRITICAL_STAGE_CONFIG, CriticalHighlight, criticalBoxShadow } from "./critical-highlight"
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
    /** `bare`: só a tela do 3D, sem moldura, brilhos, selo de crítico nem etiquetas dos dados (dado solto no card). */
    variant?: "frame" | "bare"
    /** `compact`: palco menor, para caber dentro de um card da conversa. */
    size?: "default" | "compact"
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

export function DiceVisualStage({ terms, result, isRolling, mode, criticalState, onAnimationStateChange, onRollComplete, variant = "frame", size = "default" }: DiceVisualStageProps) {
    const bare = variant === "bare"
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
    // Entre `box.roll` e o fim da animação: o indicador de preparação nunca cobre o dado rolando.
    const [isAnimating, setIsAnimating] = React.useState(false)
    const showStageResults = result && showRollResults
    const dice = showStageResults ? expandVisualResult(result) : expandStandbyVisualTerms(terms, mode)
    const stageColor = getStageColor(mode, showStageResults ? criticalState : null)
    const criticalConfig = !bare && showStageResults && criticalState ? CRITICAL_STAGE_CONFIG[criticalState] : null

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

                    // O container nasce fora da tela em 450×260: ajusta o canvas ao palco antes da primeira rolagem.
                    syncDiceBoxSize(box)

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
            setIsAnimating(false)
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
        setIsAnimating(true)
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
                    setIsAnimating(false)
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
            data-variant={variant}
            data-size={size}
            className={cn(
                "relative flex max-w-full mx-auto items-center justify-center overflow-hidden",
                size === "compact" ? "h-[190px] w-[240px]" : "min-h-[260px] w-[450px]",
                !bare && "rounded-[2rem] border bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(0,0,0,0.08)_46%,rgba(0,0,0,0.38))] p-5 transition-colors duration-500",
                !bare && (mode === "normal" ? "border-blue-400/25" : "border-white/10")
            )}
            style={bare ? undefined : {
                borderColor: `${stageColor}80`,
                boxShadow: criticalConfig
                    ? criticalBoxShadow(stageColor)
                    : `inset 0 0 32px ${stageColor}16, 0 0 42px ${stageColor}12`,
            }}
        >
            {criticalConfig && criticalState && (
                <>
                    <CriticalHighlight state={criticalState} />
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
            {!bare && (
                <>
                    <div className="absolute inset-6 rounded-full border border-white/10 blur-sm" />
                    <div className="absolute h-52 w-52 rounded-full blur-3xl" style={{ backgroundColor: `${stageColor}18` }} />
                </>
            )}
            <div
                ref={containerRef}
                id={containerId}
                data-testid="dice-box-canvas-stage"
                className="absolute inset-0 z-10"
                aria-hidden="true"
            />
            {(isRolling || !isReady) && !isAnimating && !visualError && (
                <div className={cn("pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-xs font-black uppercase tracking-[0.28em] text-white/45", !bare && "bg-black/10")}>
                    <span data-testid="dice-loading-ellipsis" aria-label="Preparando dados" className="inline-flex min-w-12 justify-center">
                        <span className="animate-pulse [animation-delay:0ms]">.</span>
                        <span className="animate-pulse [animation-delay:180ms]">.</span>
                        <span className="animate-pulse [animation-delay:360ms]">.</span>
                    </span>
                </div>
            )}
            {visualError && (
                <div className={cn("absolute z-30 rounded-xl border border-amber-400/20 bg-amber-500/10 text-center font-medium text-amber-100", bare ? "inset-x-2 top-2 px-2 py-1 text-[11px]" : "inset-x-5 top-5 px-3 py-2 text-xs")}>
                    {visualError}
                </div>
            )}
            {!bare && <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex max-w-full flex-wrap items-center justify-center gap-2">
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
            </div>}
        </div>
    )
}

