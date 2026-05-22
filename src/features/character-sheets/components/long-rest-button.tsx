"use client"

import { Moon, Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import { useLongRest } from "../hooks/use-long-rest"

interface LongRestButtonProps {
    sheetId: string
    className?: string
    disabled?: boolean
}

export function LongRestButton({ sheetId, className, disabled = false }: LongRestButtonProps) {
    const { applyLongRest, isPending } = useLongRest(sheetId)

    return (
        <button
            onClick={() => !disabled && applyLongRest()}
            disabled={isPending || disabled}
            className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold",
                "bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20",
                "text-indigo-300 hover:text-indigo-200 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className,
            )}
            title="Descanso Longo — restaura HP e espaços de magia"
        >
            {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <Moon className="w-3.5 h-3.5" />
            )}
            Descanso Longo
        </button>
    )
}
