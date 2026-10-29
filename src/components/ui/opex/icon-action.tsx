"use client"

import type { LucideIcon } from "lucide-react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"

interface IconActionProps {
    icon: LucideIcon
    label: string
    /** Explicação mostrada quando a ação está bloqueada. */
    disabledReason?: string | null
    onClick: () => void
    tone?: "default" | "danger"
    /** Ação em andamento: mostra o spinner e bloqueia novo clique. */
    busy?: boolean
    className?: string
}

/**
 * Botão de ícone com dica. Bloqueado, continua focável (`aria-disabled`) para a dica explicar o
 * motivo — botão `disabled` não recebe foco nem hover.
 */
export function IconAction({ icon: Icon, label, disabledReason, onClick, tone = "default", busy, className }: IconActionProps) {
    const blocked = Boolean(disabledReason) || Boolean(busy)
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={label}
                        aria-disabled={blocked || undefined}
                        aria-busy={busy || undefined}
                        onClick={(event) => {
                            event.stopPropagation()
                            if (!blocked) onClick()
                        }}
                        className={cn(
                            "h-8 w-8 text-muted-foreground hover:text-foreground",
                            Boolean(disabledReason) && "cursor-not-allowed opacity-40",
                            !disabledReason && tone === "danger" && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                            className,
                        )}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-xs">{disabledReason ?? label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
