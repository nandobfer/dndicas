"use client"

import * as React from "react"
import { colors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { loadDiceBox } from "../dice-box-loader"
import { buildDiceBoxNotation, buildDiceBoxStandbyNotation, expandStandbyVisualTerms, expandVisualResult } from "../dice-box-notation"
import { renderStaticDiceBoxStandby } from "../dice-box-static-standby"
import type { DiceRollMode, DiceRollResponse, DiceTerm } from "../types"
import type DiceBox from "@3d-dice/dice-box-threejs"

interface DiceVisualStageProps {
    terms: DiceTerm[]
    result: DiceRollResponse | null
    isRolling: boolean
    mode: DiceRollMode
    onAnimationStateChange?: (isAnimating: boolean) => void
}

function getStageColor(mode: DiceRollMode) {
    if (mode === "advantage") return colors.rarity.uncommon
    if (mode === "disadvantage") return colors.rarity.artifact
    return colors.rarity.rare
}

function buildContainerId(reactId: string) {
    return `dice-box-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

const DICE_TEXTURE = "stainedglass"

export function DiceVisualStage({ terms, result, isRolling, mode, onAnimationStateChange }: DiceVisualStageProps) {
    const reactId = React.useId()
    const containerId = React.useMemo(() => buildContainerId(reactId), [reactId])
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const diceBoxRef = React.useRef<DiceBox | null>(null)
    const rollTokenRef = React.useRef(0)
    const hasRenderedRollRef = React.useRef(false)
    const lastRolledResultIdRef = React.useRef<string | null>(null)
    const standbyNotationRef = React.useRef<string | null>(null)
    const [isReady, setIsReady] = React.useState(false)
    const [visualError, setVisualError] = React.useState<string | null>(null)
    const dice = result ? expandVisualResult(result) : expandStandbyVisualTerms(terms, mode)
    const stageColor = getStageColor(mode)

    React.useEffect(() => {
        let cancelled = false

        async function initializeDiceBox() {
            try {
                const DiceBoxCtor = await loadDiceBox()
                if (cancelled) return

                const box = new DiceBoxCtor(`#${containerId}`, {
                    assetPath: "/",
                    sounds: false,
                    shadows: true,
                    theme_surface: "default",
                    theme_texture: "none",
                    theme_material: "glass",
                    theme_customColorset: {
                        name: "dndicas",
                        foreground: "#f8fafc",
                        background: ["#0f172a", "#1f2937", "#334155", "#111827"],
                        outline: "#f8fafc",
                        texture: DICE_TEXTURE,
                        material: "glass",
                    },
                    gravity_multiplier: 360,
                    light_intensity: 0.85,
                    baseScale: 67,
                    strength: 1.2,
                })

                await box.initialize()
                if (cancelled) {
                    box.clearDice?.()
                    return
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
            diceBoxRef.current?.clearDice?.()
            diceBoxRef.current = null
            containerRef.current?.replaceChildren()
        }
    }, [containerId, onAnimationStateChange])

    React.useEffect(() => {
        const box = diceBoxRef.current
        if (!box || !isReady) {
            return
        }

        if (!result) {
            rollTokenRef.current += 1
            onAnimationStateChange?.(false)
            lastRolledResultIdRef.current = null

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
                }
            })
    }, [isReady, mode, onAnimationStateChange, result, terms])

    return (
        <div
            data-testid="dice-visual-stage"
            data-mode={mode}
            data-border-color={stageColor}
            className={cn(
                "relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-[2rem] border bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(0,0,0,0.08)_46%,rgba(0,0,0,0.38))] p-5 transition-colors",
                mode === "normal" ? "border-blue-400/25" : "border-white/10"
            )}
            style={{
                borderColor: `${stageColor}80`,
                boxShadow: `inset 0 0 32px ${stageColor}16, 0 0 42px ${stageColor}12`,
            }}
        >
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
                {dice.map((die, index) => (
                    <span
                        key={`${die.sourceDice}-${die.dice}-${index}`}
                        data-testid="dice-visual-die"
                        data-dice={die.dice}
                        data-source-dice={die.sourceDice}
                        data-value={typeof die.value === "number" ? die.value : undefined}
                        data-roll-role={die.rollRole}
                        className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-black text-white/70 backdrop-blur"
                    >
                        {die.sourceDice}{typeof die.value === "number" ? ` ${die.value}` : ""}
                    </span>
                ))}
            </div>
        </div>
    )
}
