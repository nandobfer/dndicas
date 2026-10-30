"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface SliderMark {
    value: number
    label?: string
}

export interface SliderProps {
    value: number
    onChange: (value: number) => void
    min: number
    max: number
    step?: number
    disabled?: boolean
    id?: string
    "aria-label"?: string
    "aria-labelledby"?: string
    /** Texto acessível do valor (ex.: "8 mensagens por minuto"). */
    formatValue?: (value: number) => string
    /** Marcas abaixo do trilho (ex.: 2, 5, 10, 15, 20). */
    marks?: readonly SliderMark[]
    onBlur?: () => void
    className?: string
    /**
     * Cor do preenchimento, do polegar e da marca ativa (DnDicas: cor de raridade, ex.: o nível de
     * rigor das Campanhas Maddox). Sem cor, usa a primária.
     */
    color?: string
}

/**
 * Slider padrão do app — copiado do Opex (Radix Slider, padrão Shadcn): trilho `muted`, preenchimento
 * e polegar com a cor primária (ou `color`), polegar que cresce ao passar o mouse/arrastar (Framer Motion) e marcas
 * opcionais. Teclado: setas, PageUp/PageDown, Home/End. Nunca use `<input type="range">` nativo.
 */
export function Slider({ value, onChange, min, max, step = 1, disabled, id, formatValue, marks, onBlur, className, color, ...aria }: SliderProps) {
    const reduceMotion = useReducedMotion()
    const [dragging, setDragging] = React.useState(false)
    const percent = (v: number) => ((v - min) / (max - min)) * 100

    return (
        <div className={cn("w-full", className)}>
            <SliderPrimitive.Root
                id={id}
                value={[value]}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onValueChange={([next]) => next !== undefined && onChange(next)}
                onPointerDown={() => setDragging(true)}
                onPointerUp={() => setDragging(false)}
                onLostPointerCapture={() => setDragging(false)}
                className={cn("relative flex h-5 w-full touch-none select-none items-center", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}
            >
                <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
                    <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary transition-colors" style={color ? { backgroundColor: color } : undefined} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    aria-label={aria["aria-label"]}
                    aria-labelledby={aria["aria-labelledby"]}
                    aria-valuetext={formatValue?.(value)}
                    onBlur={onBlur}
                    className="group block rounded-full focus-visible:outline-none"
                >
                    <motion.span
                        aria-hidden
                        className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow-sm ring-primary/30 transition-colors group-focus-visible:ring-4"
                        style={color ? { borderColor: color } : undefined}
                        animate={{ scale: dragging && !reduceMotion ? 1.2 : 1 }}
                        whileHover={disabled || reduceMotion ? undefined : { scale: 1.12 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                    />
                </SliderPrimitive.Thumb>
            </SliderPrimitive.Root>
            {marks && marks.length > 0 && (
                <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
                    {marks.map((mark) => (
                        <button
                            key={mark.value}
                            type="button"
                            tabIndex={-1}
                            disabled={disabled}
                            onClick={() => onChange(mark.value)}
                            className={cn(
                                "absolute -translate-x-1/2 tabular-nums transition-colors hover:text-foreground disabled:pointer-events-none",
                                mark.value === value && "font-semibold text-primary",
                            )}
                            style={{ left: `${percent(mark.value)}%`, ...(color && mark.value === value ? { color } : {}) }}
                        >
                            {mark.label ?? mark.value}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
