"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { cn } from "@/core/utils"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"

interface CompactRichInputProps {
    label?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    debounceMs?: number
    isLoading?: boolean
    className?: string
    excludeId?: string
    labelClassName?: string
    /** "simple" = bottom-border only, no toolbar (default). "full" = full toolbar + glass container. */
    variant?: "simple" | "full"
    /** Extra className forwarded to the RichTextEditor (only used in simple variant). */
    editorClassName?: string
    minRows?: number
    disabled?: boolean
}

export function CompactRichInput({
    label,
    value,
    onChange,
    placeholder,
    debounceMs = 1000,
    isLoading = false,
    className,
    excludeId,
    labelClassName,
    variant = "simple",
    editorClassName,
    minRows,
    disabled = false,
}: CompactRichInputProps) {
    const [localValue, setLocalValue] = useState(value)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    useEffect(() => {
        setLocalValue(value)
    }, [value])

    const handleChange = useCallback(
        (html: string) => {
            if (disabled) return
            setLocalValue(html)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            if (debounceMs > 0) {
                timeoutRef.current = setTimeout(() => {
                    if (isMountedRef.current) onChange(html)
                }, debounceMs)
            } else {
                onChange(html)
            }
        },
        [onChange, debounceMs]
    )

    if (variant === "full") {
        return (
            <div className={cn("flex flex-col w-full", className)}>
                {label && (
                    <label
                        className={cn(
                            "font-black uppercase tracking-widest text-white/40 mb-1 ml-1 select-none text-[9px]",
                            labelClassName
                        )}
                    >
                        {label}
                    </label>
                )}
                <div className={cn(isLoading && "opacity-50 animate-pulse pointer-events-none")}>
                    <RichTextEditor
                        value={localValue}
                        onChange={handleChange}
                        placeholder={placeholder}
                        variant="full"
                        excludeId={excludeId}
                        minRows={minRows ?? 5}
                        disabled={disabled}
                    />
                </div>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col group w-full", className)}>
            <div
                className={cn(
                    "transition-all",
                    isLoading && "opacity-50 animate-pulse pointer-events-none"
                )}
            >
                <RichTextEditor
                    value={localValue}
                    onChange={handleChange}
                    placeholder={placeholder}
                    variant="simple"
                    excludeId={excludeId}
                    disabled={disabled}
                    className={cn(
                        // Strip glass container for simple variant so our bottom border is the only affordance
                        "!bg-transparent !border-0 !shadow-none !backdrop-blur-none !rounded-none",
                        disabled && "!opacity-100 !cursor-default pointer-events-none",
                        editorClassName,
                    )}
                />
            </div>
            <div className={cn("w-full h-[1px] bg-white/10 transition-colors", !disabled && "group-focus-within:bg-white/40")} />
            {label && (
                <label
                    className={cn(
                        "font-black uppercase tracking-widest text-white/40 mt-1 ml-1 select-none text-[9px]",
                        labelClassName
                    )}
                >
                    {label}
                </label>
            )}
        </div>
    )
}
