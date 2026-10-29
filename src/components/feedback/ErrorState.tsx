"use client"

import { motion } from "framer-motion"
import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { fadeUp } from "@/components/motion/presets"

interface ErrorStateProps {
    title?: string
    description?: string
    onRetry?: () => void
}

/** Estado de erro padrão, com "Tentar novamente". */
export function ErrorState({
    title = "Não foi possível carregar os dados",
    description = "Verifique sua conexão e tente novamente.",
    onRetry,
}: ErrorStateProps) {
    return (
        <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            role="alert"
            className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center"
        >
            <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <div className="max-w-sm space-y-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                    <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Tentar novamente
                </Button>
            )}
        </motion.div>
    )
}
