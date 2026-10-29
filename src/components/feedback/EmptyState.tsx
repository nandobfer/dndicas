"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { fadeUp } from "@/components/motion/presets"

interface EmptyStateProps {
    icon?: LucideIcon
    title: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    children?: ReactNode
}

/** Estado vazio padrão: ícone + texto pt-BR + ação opcional. */
export function EmptyState({ icon: Icon = Inbox, title, description, actionLabel, onAction, children }: EmptyStateProps) {
    return (
        <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center"
        >
            <div className="rounded-full bg-muted p-3">
                <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="max-w-sm space-y-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {actionLabel && onAction && (
                <Button size="sm" variant="outline" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
            {children}
        </motion.div>
    )
}
