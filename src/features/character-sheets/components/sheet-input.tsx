"use client"

import * as React from "react"
import { cn } from "@/core/utils"
import { SearchInput } from "@/components/ui/search-input"

interface SheetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    compact?: boolean
    isLoading?: boolean
    debounceMs?: number
    onChangeValue?: (value: string) => void
    onActionClick?: (e: React.MouseEvent) => void
    icon?: React.ReactNode
}

export const SheetInput = React.forwardRef<HTMLInputElement, SheetInputProps>(
    ({ label, compact = false, className, isLoading, debounceMs = 500, onChangeValue, value, onActionClick, icon, ...props }, ref) => {
        const { onChange: _onChange, ...restProps } = props as any

        return (
            <div className={cn("w-full", compact ? "flex flex-col gap-0.5 items-center" : "space-y-1")}>
                {label && (
                    <label
                        className={cn(
                            "font-bold uppercase tracking-widest text-white/40",
                            compact ? "text-[9px] text-center" : "text-[10px] ml-1",
                        )}
                    >
                        {label}
                    </label>
                )}
                <SearchInput
                    ref={ref}
                    value={String(value || "")}
                    onChange={(val: string) => onChangeValue?.(val)}
                    isLoading={isLoading}
                    debounceMs={debounceMs}
                    showClearButton={false}
                    showSearchIcon={!compact}
                    className={cn(
                        "transition-all duration-150",
                        compact ? "text-center text-sm font-bold w-full h-9 px-1" : "h-10",
                        isLoading && "animate-pulse border-white/20",
                        className,
                    )}
                    rightElement={
                        onActionClick && !isLoading ? (
                            <button
                                type="button"
                                onClick={onActionClick}
                                className="p-1 transition-opacity bg-white/10 hover:bg-white/20 rounded text-white/60"
                            >
                                {icon || <span className="text-[10px]">...</span>}
                            </button>
                        ) : null
                    }
                    {...(restProps as any)}
                />
            </div>
        )
    }
)
SheetInput.displayName = "SheetInput"
