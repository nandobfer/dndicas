"use client"

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface FieldTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
    placeholder: string
    value?: ReactNode
    invalid?: boolean
}

/** Gatilho com cara de campo (largura total) para os seletores com busca (`SearchPicker`). */
export const FieldTrigger = forwardRef<HTMLButtonElement, FieldTriggerProps>(function FieldTrigger({ placeholder, value, invalid, className, ...props }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            data-invalid={invalid || undefined}
            className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:border-destructive",
                className,
            )}
            {...props}
        >
            <span className="min-w-0 flex-1 truncate">{value ?? <span className="text-muted-foreground">{placeholder}</span>}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" aria-hidden />
        </button>
    )
})
