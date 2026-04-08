"use client"

import * as React from "react"
import { cn } from "@/core/utils"

import { Minus, Plus } from "lucide-react"

interface SheetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    compact?: boolean
    isLoading?: boolean
    debounceMs?: number
    onChangeValue?: (value: string) => void
    onActionClick?: (e: React.MouseEvent) => void
    icon?: React.ReactNode
    inputClassName?: string
    showControls?: boolean
}

export const SheetInput = React.forwardRef<HTMLInputElement, SheetInputProps>(
    ({ label, compact = false, className, inputClassName, isLoading, debounceMs = 0, onChangeValue, value, onActionClick, icon, showControls = false, min, max, ...props }, ref) => {
        const [localValue, setLocalValue] = React.useState(String(value ?? ""))
        const lastValidRef = React.useRef(String(value ?? ""))
        const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

        React.useEffect(() => {
            const newStr = String(value ?? "")
            // Only sync from outside if the field is not actively being edited to an empty/intermediate state
            if (newStr !== localValue && newStr !== "") {
                setLocalValue(newStr)
                lastValidRef.current = newStr
            }
        }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

        const triggerChange = (val: string) => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)

            if (debounceMs > 0) {
                timeoutRef.current = setTimeout(() => {
                    onChangeValue?.(val)
                }, debounceMs)
            } else {
                onChangeValue?.(val)
            }
        }

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value
            setLocalValue(val)

            // For number inputs, don't commit empty/partial values — wait for blur
            if (props.type === "number" || props.inputMode === "numeric") {
                const num = parseFloat(val)
                if (val === "" || isNaN(num)) return
                const minNum = min !== undefined ? Number(min) : undefined
                const maxNum = max !== undefined ? Number(max) : undefined
                if (minNum !== undefined && num < minNum) return
                if (maxNum !== undefined && num > maxNum) return
                lastValidRef.current = String(num)
                triggerChange(String(num))
            } else {
                lastValidRef.current = val
                triggerChange(val)
            }
        }

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            const val = e.target.value
            if (props.type === "number" || props.inputMode === "numeric") {
                const num = parseFloat(val)
                if (val === "" || isNaN(num)) {
                    // Revert to last valid value
                    setLocalValue(lastValidRef.current)
                    return
                }
                const minNum = min !== undefined ? Number(min) : undefined
                const maxNum = max !== undefined ? Number(max) : undefined
                if (minNum !== undefined && num < minNum) {
                    const clamped = String(minNum)
                    setLocalValue(clamped)
                    lastValidRef.current = clamped
                    triggerChange(clamped)
                    return
                }
                if (maxNum !== undefined && num > maxNum) {
                    const clamped = String(maxNum)
                    setLocalValue(clamped)
                    lastValidRef.current = clamped
                    triggerChange(clamped)
                    return
                }
            }
            props.onBlur?.(e)
        }

        const adjustValue = (amount: number) => {
            const currentNum = parseInt(localValue) || 0
            const minNum = min !== undefined ? Number(min) : undefined
            const maxNum = max !== undefined ? Number(max) : undefined
            let next = currentNum + amount
            if (minNum !== undefined) next = Math.max(minNum, next)
            if (maxNum !== undefined) next = Math.min(maxNum, next)
            const newVal = String(next)
            setLocalValue(newVal)
            lastValidRef.current = newVal
            triggerChange(newVal)
        }

        return (
            <div className={cn("flex flex-col group w-full relative", className)}>
                <div className="flex items-center w-full min-h-[38px]">
                    {showControls && (
                        <button
                            type="button"
                            onClick={() => adjustValue(-1)}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
                        >
                            <Minus size={14} />
                        </button>
                    )}

                    <input
                        ref={ref}
                        className={cn(
                            "w-full bg-transparent px-2 py-1 outline-none placeholder:text-white/20 tracking-tight transition-all text-white",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            compact ? "text-sm font-semibold" : "text-lg font-bold",
                            isLoading && "animate-pulse opacity-50",
                            inputClassName,
                        )}
                        value={localValue}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        min={min}
                        max={max}
                        {...props}
                    />

                    {showControls && (
                        <button
                            type="button"
                            onClick={() => adjustValue(1)}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
                <div className={cn("w-full bg-white/10 group-focus-within:bg-white/40 transition-colors", compact ? "h-[1px]" : "h-0.5")} />
                {label && <label className={cn("font-black uppercase tracking-widest text-white/40 mt-1 ml-1 select-none", compact ? "text-[9px]" : "text-[10px]")}>{label}</label>}
            </div>
        )
    },
)
SheetInput.displayName = "SheetInput"

