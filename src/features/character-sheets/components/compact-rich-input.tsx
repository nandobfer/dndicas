"use client"

import { useEffect, useState, useCallback } from "react"
import { cn } from "@/core/utils"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"


interface CompactRichInputProps {
    label?: string
    value: string
    onChange: (value: string) => void
    onBlur?: (value: string) => void
    placeholder?: string
    /** @deprecated No longer used — saves happen on blur for text inputs. */
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
    /** Block Enter key from creating new lines. Defaults to true for "simple" variant. */
    disableNewlines?: boolean
}

export function CompactRichInput({
    label,
    value,
    onChange,
    onBlur,
    placeholder,
    isLoading = false,
    className,
    excludeId,
    labelClassName,
    variant = "simple",
    editorClassName,
    minRows,
    disabled = false,
    disableNewlines,
}: CompactRichInputProps) {
    const blockNewlines = disableNewlines ?? variant === "simple"
    const [localValue, setLocalValue] = useState(value)

    useEffect(() => {
        setLocalValue(value)
    }, [value])

    const handleChange = useCallback(
        (html: string) => {
            if (disabled) return
            setLocalValue(html)
            onChange(html)
        },
        [onChange, disabled]
    )

    const handleBlur = useCallback(() => {
        onBlur?.(localValue)
    }, [onBlur, localValue])

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
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        variant="full"
                        excludeId={excludeId}
                        minRows={minRows ?? 5}
                        disabled={disabled}
                        disableNewlines={blockNewlines}
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
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    variant="simple"
                    excludeId={excludeId}
                    disabled={disabled}
                    disableNewlines={blockNewlines}
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
