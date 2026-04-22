"use client"

import * as React from "react"
import { cn } from "@/core/utils"

import { Minus, Plus } from "lucide-react"

interface SheetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    compact?: boolean
    isLoading?: boolean
    /** Debounce for numeric +/- controls. Defaults to 300ms when controls are enabled. */
    debounceMs?: number
    onChangeValue?: (value: string) => void
    onActionClick?: (e: React.MouseEvent) => void
    icon?: React.ReactNode
    inputClassName?: string
    showControls?: boolean
    readOnlyMode?: boolean
    allowEmptyNumber?: boolean
}

export const SheetInput = React.forwardRef<HTMLInputElement, SheetInputProps>(
    ({ label, compact = false, className, inputClassName, isLoading, debounceMs, onChangeValue, onActionClick, value, showControls = false, min, max, readOnlyMode = false, allowEmptyNumber = false, disabled, readOnly, ...props }, ref) => {
        const isNonInteractive = !!disabled || !!readOnly || readOnlyMode
        const [localValue, setLocalValue] = React.useState(String(value ?? ""))
        const lastValidRef = React.useRef(String(value ?? ""))
        const pendingControlValueRef = React.useRef<string | null>(null)
        const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
        const isNumericInput = props.type === "number" || props.inputMode === "numeric"
        const controlsDebounceMs = isNumericInput && showControls ? (debounceMs ?? 300) : 0

        const clearPendingControlEmission = React.useCallback(() => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
                debounceTimeoutRef.current = null
            }
            pendingControlValueRef.current = null
        }, [])

        const emitChangeValue = React.useCallback((nextValue: string) => {
            onChangeValue?.(nextValue)
        }, [onChangeValue])

        const flushPendingControlEmission = React.useCallback(() => {
            if (pendingControlValueRef.current === null) return

            const nextValue = pendingControlValueRef.current
            clearPendingControlEmission()
            emitChangeValue(nextValue)
        }, [clearPendingControlEmission, emitChangeValue])

        const scheduleControlEmission = React.useCallback((nextValue: string) => {
            if (controlsDebounceMs <= 0) {
                emitChangeValue(nextValue)
                return
            }

            pendingControlValueRef.current = nextValue
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
            }

            debounceTimeoutRef.current = setTimeout(() => {
                flushPendingControlEmission()
            }, controlsDebounceMs)
        }, [controlsDebounceMs, emitChangeValue, flushPendingControlEmission])

        React.useEffect(() => {
            const newStr = String(value ?? "")
            // Only sync from outside if the field is not actively being edited to an empty/intermediate state
            if (newStr !== localValue && newStr !== "") {
                setLocalValue(newStr)
                lastValidRef.current = newStr
            }
        }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

        React.useEffect(() => {
            return () => {
                if (debounceTimeoutRef.current) {
                    clearTimeout(debounceTimeoutRef.current)
                }
            }
        }, [])

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (isNonInteractive) return
            const val = e.target.value
            setLocalValue(val)

            if (isNumericInput) {
                const num = parseFloat(val)
                if (!val || isNaN(num)) return
                const minNum = min !== undefined ? Number(min) : undefined
                const maxNum = max !== undefined ? Number(max) : undefined
                if (minNum !== undefined && num < minNum) return
                if (maxNum !== undefined && num > maxNum) return
                lastValidRef.current = String(num)
            } else {
                lastValidRef.current = val
            }
        }

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            if (isNonInteractive) {
                props.onBlur?.(e)
                return
            }
            const val = e.target.value
            if (isNumericInput) {
                const num = parseFloat(val)
                if (val === "" || isNaN(num)) {
                    if (allowEmptyNumber) {
                        setLocalValue("")
                        lastValidRef.current = ""
                        clearPendingControlEmission()
                        onChangeValue?.("")
                        props.onBlur?.(e)
                        return
                    }
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
                    clearPendingControlEmission()
                    onChangeValue?.(clamped)
                    props.onBlur?.(e)
                    return
                }
                if (maxNum !== undefined && num > maxNum) {
                    const clamped = String(maxNum)
                    setLocalValue(clamped)
                    lastValidRef.current = clamped
                    clearPendingControlEmission()
                    onChangeValue?.(clamped)
                    props.onBlur?.(e)
                    return
                }
                const hadPendingControlEmission = pendingControlValueRef.current !== null
                flushPendingControlEmission()
                if (hadPendingControlEmission && pendingControlValueRef.current === null) {
                    props.onBlur?.(e)
                    return
                }
                onChangeValue?.(String(num))
            } else {
                onChangeValue?.(val)
            }
            props.onBlur?.(e)
        }

        const adjustValue = (amount: number, event: React.MouseEvent<HTMLButtonElement>) => {
            if (isNonInteractive) return
            const currentNum = parseInt(localValue) || 0
            const minNum = min !== undefined ? Number(min) : undefined
            const maxNum = max !== undefined ? Number(max) : undefined
            let next = currentNum + amount
            if (minNum !== undefined) next = Math.max(minNum, next)
            if (maxNum !== undefined) next = Math.min(maxNum, next)
            const newVal = String(next)
            setLocalValue(newVal)
            lastValidRef.current = newVal
            scheduleControlEmission(newVal)
            onActionClick?.(event)
        }

        return (
            <div className={cn("flex flex-col group w-full relative", className)}>
                <div className="flex items-center w-full min-h-[38px]">
                    {showControls && (
                        <button
                            type="button"
                            disabled={isNonInteractive}
                            onClick={(event) => adjustValue(-1, event)}
                            tabIndex={isNonInteractive ? -1 : undefined}
                            className={cn(
                                "p-1 rounded-full transition-colors text-white/40 flex-shrink-0",
                                !isNonInteractive && "hover:bg-white/10 hover:text-white",
                                isNonInteractive && "opacity-50 cursor-not-allowed pointer-events-none",
                            )}
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
                            isNonInteractive && "cursor-default select-none",
                            inputClassName,
                        )}
                        value={localValue}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        min={min}
                        max={max}
                        disabled={disabled || readOnlyMode}
                        readOnly={readOnly || readOnlyMode}
                        tabIndex={isNonInteractive ? -1 : props.tabIndex}
                        {...props}
                    />

                    {showControls && (
                        <button
                            type="button"
                            disabled={isNonInteractive}
                            onClick={(event) => adjustValue(1, event)}
                            tabIndex={isNonInteractive ? -1 : undefined}
                            className={cn(
                                "p-1 rounded-full transition-colors text-white/40 flex-shrink-0",
                                !isNonInteractive && "hover:bg-white/10 hover:text-white",
                                isNonInteractive && "opacity-50 cursor-not-allowed pointer-events-none",
                            )}
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
                <div className={cn("w-full bg-white/10 transition-colors", !isNonInteractive && "group-focus-within:bg-white/40", compact ? "h-[1px]" : "h-0.5")} />
                {label && <label className={cn("font-black uppercase tracking-widest text-white/40 mt-1 ml-1 select-none", compact ? "text-[9px]" : "text-[10px]")}>{label}</label>}
            </div>
        )
    },
)
SheetInput.displayName = "SheetInput"
