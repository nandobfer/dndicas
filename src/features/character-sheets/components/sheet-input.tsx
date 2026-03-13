"use client"

import * as React from "react"
import { cn } from "@/core/utils"
import { SearchInput } from "@/components/ui/search-input"

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
    ({ label, compact = false, className, inputClassName, isLoading, debounceMs = 0, onChangeValue, value, onActionClick, icon, showControls = false, ...props }, ref) => {
        const [localValue, setLocalValue] = React.useState(String(value || ""))
        const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

        React.useEffect(() => {
            setLocalValue(String(value || ""))
        }, [value])

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
            triggerChange(val)
        }

        const adjustValue = (amount: number) => {
            const currentNum = parseInt(localValue) || 0
            const newVal = String(currentNum + amount)
            setLocalValue(newVal)
            triggerChange(newVal)
        }

        return (
            <div className={cn("flex flex-col group w-full relative", className)}>
                <div className="flex items-center w-full min-h-[2.5rem]">
                    {showControls && (
                        <button 
                            type="button"
                            onClick={() => adjustValue(-1)}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                        >
                            <Minus size={14} />
                        </button>
                    )}
                    
                    <input
                        ref={ref}
                        className={cn(
                            "w-full bg-transparent px-2 py-1 outline-none placeholder:text-white/10 tracking-tight transition-all text-white",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            compact ? "text-sm font-semibold" : "text-lg font-bold",
                            isLoading && "animate-pulse opacity-50",
                            inputClassName,
                        )}
                        value={localValue}
                        onChange={handleChange}
                        {...props}
                    />

                    {showControls && (
                        <button 
                            type="button"
                            onClick={() => adjustValue(1)}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
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
