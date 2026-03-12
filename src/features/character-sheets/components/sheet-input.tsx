"use client"

import * as React from "react"
import { cn } from "@/core/utils"

interface SheetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    compact?: boolean
}

export const SheetInput = React.forwardRef<HTMLInputElement, SheetInputProps>(
    ({ label, compact = false, className, ...props }, ref) => {
        return (
            <div className={cn("flex flex-col gap-0.5", compact && "items-center")}>
                {label && (
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 text-center">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={cn(
                        "bg-white/5 border border-white/10 rounded-md text-white placeholder:text-white/20",
                        "focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10",
                        "transition-colors duration-150",
                        compact
                            ? "text-center text-sm font-bold w-full h-9 px-1"
                            : "text-sm px-3 py-2 w-full",
                        className,
                    )}
                    {...props}
                />
            </div>
        )
    },
)
SheetInput.displayName = "SheetInput"
