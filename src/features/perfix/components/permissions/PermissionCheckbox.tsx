"use client"

import { Check, Minus } from "lucide-react"
import type { PermissionNodeState } from "@nandobfer/perfix"
import { cn } from "@/lib/utils"

interface PermissionCheckboxProps {
    id?: string
    state: PermissionNodeState
    onChange: (next: boolean) => void
    disabled?: boolean
    className?: string
    "aria-label": string
}

const ARIA_CHECKED: Record<PermissionNodeState, "true" | "false" | "mixed"> = {
    checked: "true",
    indeterminate: "mixed",
    unchecked: "false",
}

/**
 * Checkbox tri-state 100% controlado (copiado do Smart Desk). `role="checkbox"` +
 * `aria-checked` deixa os 3 estados acessíveis e testáveis. A cor é a primária da empresa.
 */
export function PermissionCheckbox({ id, state, onChange, disabled = false, className, "aria-label": ariaLabel }: PermissionCheckboxProps) {
    // De `mixed` o clique MARCA tudo; só de `checked` é que desmarca.
    const next = state !== "checked"

    return (
        <button
            id={id}
            type="button"
            role="checkbox"
            aria-checked={ARIA_CHECKED[state]}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={(event) => {
                event.stopPropagation()
                onChange(next)
            }}
            className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                state !== "unchecked" && "bg-primary text-primary-foreground",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                className,
            )}
        >
            {state === "checked" && <Check className="h-3 w-3" />}
            {state === "indeterminate" && <Minus className="h-3 w-3" />}
        </button>
    )
}
