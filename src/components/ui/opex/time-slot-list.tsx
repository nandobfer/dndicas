"use client"

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

/** `HH:MM` → minutos do dia. */
export const timeToMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
}
/** Minutos do dia → `HH:MM`. */
export const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/** Horários de `min` a `max` (inclusive), de `step` em `step` minutos. */
export function buildTimeSlots(min = "00:00", max = "23:30", step = 30): string[] {
    const slots: string[] = []
    for (let minute = timeToMinutes(min); minute <= timeToMinutes(max); minute += step) slots.push(minutesToTime(minute))
    return slots
}

export interface TimeSlotListProps {
    value: string
    onChange: (value: string) => void
    min?: string
    max?: string
    /** Passo em minutos (padrão 30). */
    step?: number
    /** Horário indisponível (ex.: fim menor ou igual ao início). */
    isDisabled?: (slot: string) => boolean
    disabled?: boolean
    "aria-label"?: string
    "aria-labelledby"?: string
    className?: string
}

/**
 * Lista de horários do app (no lugar do `<input type="time">` nativo): opções de `step` em `step`
 * minutos, escolhida com a cor primária, rolada até a escolhida ao montar. `listbox`
 * acessível: setas, Home/End navegam entre os horários habilitados e selecionam.
 */
export function TimeSlotList({ value, onChange, min, max, step = 30, isDisabled, disabled = false, className, ...aria }: TimeSlotListProps) {
    const slots = useMemo(() => buildTimeSlots(min, max, step), [min, max, step])
    const refs = useRef<Array<HTMLButtonElement | null>>([])
    const selectedIndex = slots.indexOf(value)
    const enabled = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => !disabled && !isDisabled?.(slot))

    useEffect(() => {
        // Sem `scrollIntoView` no jsdom: o horário escolhido aparece ao abrir.
        refs.current[selectedIndex]?.scrollIntoView?.({ block: "nearest" })
        // Só ao montar: rolar a cada escolha "pularia" a lista sob o cursor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const select = (index: number) => {
        const slot = slots[index]
        if (!slot || disabled || isDisabled?.(slot)) return
        onChange(slot)
        refs.current[index]?.focus()
    }

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (enabled.length === 0) return
        const position = enabled.findIndex((item) => item.index === index)
        let target: number | undefined
        if (event.key === "ArrowDown" || event.key === "ArrowRight") target = enabled[Math.min(position + 1, enabled.length - 1)]?.index
        else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = enabled[Math.max(position - 1, 0)]?.index
        else if (event.key === "Home") target = enabled[0]?.index
        else if (event.key === "End") target = enabled[enabled.length - 1]?.index
        if (target === undefined) return
        event.preventDefault()
        select(target)
    }

    const focusIndex = selectedIndex >= 0 ? selectedIndex : (enabled[0]?.index ?? 0)

    return (
        <div
            role="listbox"
            aria-label={aria["aria-label"]}
            aria-labelledby={aria["aria-labelledby"]}
            aria-disabled={disabled || undefined}
            className={cn("flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border bg-background p-1", disabled && "opacity-60", className)}
        >
            {slots.map((slot, index) => {
                const active = slot === value
                const off = disabled || isDisabled?.(slot) === true
                return (
                    <button
                        key={slot}
                        ref={(node) => {
                            refs.current[index] = node
                        }}
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={off}
                        tabIndex={index === focusIndex ? 0 : -1}
                        onClick={() => select(index)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={cn(
                            "shrink-0 rounded-md px-3 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                            active ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "text-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                    >
                        {slot}
                    </button>
                )
            })}
        </div>
    )
}
