"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/core/utils"

interface GlassNumberInputProps {
    label?: string
    value: number | ""
    onChange: (value: number | "") => void
    min?: number
    max?: number
    placeholder?: string
    className?: string
    inputClassName?: string
    allowEmpty?: boolean
    showControls?: boolean
}

export function GlassNumberInput({
    label,
    value,
    onChange,
    min,
    max,
    placeholder,
    className,
    inputClassName,
    allowEmpty = true,
    showControls = true,
}: GlassNumberInputProps) {
    const [localValue, setLocalValue] = React.useState(String(value))

    React.useEffect(() => {
        setLocalValue(String(value))
    }, [value])

    const clamp = React.useCallback((next: number) => {
        let valueToClamp = next
        if (min !== undefined) valueToClamp = Math.max(min, valueToClamp)
        if (max !== undefined) valueToClamp = Math.min(max, valueToClamp)
        return valueToClamp
    }, [max, min])

    const commit = (raw: string) => {
        if (raw === "" && allowEmpty) {
            onChange("")
            return
        }

        const parsed = Number.parseInt(raw, 10)
        if (!Number.isFinite(parsed)) {
            onChange(allowEmpty ? "" : 0)
            return
        }

        onChange(clamp(parsed))
    }

    const adjust = (amount: number) => {
        const current = typeof value === "number" ? value : Number.parseInt(localValue, 10) || 0
        const next = clamp(current + amount)
        setLocalValue(String(next))
        onChange(next)
    }

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {label && <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</label>}
            <div className="flex min-h-[40px] items-center rounded-xl border border-white/10 bg-white/5 px-2 focus-within:border-white/30 focus-within:bg-white/10">
                {showControls && (
                    <button type="button" onClick={() => adjust(-1)} className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
                        <Minus className="h-3.5 w-3.5" />
                    </button>
                )}
                <input
                    type="number"
                    value={localValue}
                    placeholder={placeholder}
                    onChange={(event) => setLocalValue(event.target.value)}
                    onBlur={() => commit(localValue)}
                    className={cn(
                        "min-w-0 flex-1 bg-transparent px-2 py-1 text-center text-lg font-black text-white outline-none placeholder:text-white/20",
                        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        inputClassName
                    )}
                />
                {showControls && (
                    <button type="button" onClick={() => adjust(1)} className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    )
}
