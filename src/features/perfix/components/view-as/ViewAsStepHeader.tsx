"use client"

import { ArrowLeft } from "lucide-react"

interface ViewAsStepHeaderProps {
    title: string
    subtitle?: string
    onBack(): void
}

/** Cabeçalho das etapas internas do menu, com "Voltar" para os perfis. */
export function ViewAsStepHeader({ title, subtitle, onBack }: ViewAsStepHeaderProps) {
    return (
        <div className="flex items-center gap-2 px-2 pb-2 pt-2">
            <button
                type="button"
                onClick={onBack}
                aria-label="Voltar aos perfis"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{title}</p>
                {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
        </div>
    )
}
