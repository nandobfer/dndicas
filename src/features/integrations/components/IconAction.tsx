"use client"

import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/opex/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"

interface IconActionProps extends Omit<ComponentProps<typeof Button>, "children" | "size"> {
    /** Texto do tooltip e do `aria-label`. */
    label: string
    icon: ReactNode
}

/** Botão somente-ícone com tooltip e rótulo acessível. */
export function IconAction({ label, icon, className, variant = "ghost", ...props }: IconActionProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button type="button" variant={variant} size="icon" className={cn("h-8 w-8", className)} aria-label={label} {...props}>
                        {icon}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
