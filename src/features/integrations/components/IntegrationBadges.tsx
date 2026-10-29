"use client"

import { motion } from "framer-motion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"
import { INTEGRATION_ENVIRONMENT_LABELS, type IntegrationEnvironment } from "@/lib/integrations/catalog"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import type { IntegrationHealthDto } from "../types"

const STATUS_STYLE = {
    ok: { dot: "bg-emerald-500", ring: "bg-emerald-500/40", label: "Conectado" },
    warn: { dot: "bg-amber-500", ring: "bg-amber-500/40", label: "Disponível com restrição" },
    error: { dot: "bg-red-500", ring: "bg-red-500/40", label: "Falha na conexão" },
    unknown: { dot: "bg-slate-400", ring: "bg-slate-400/30", label: "Ainda não verificado" },
} as const

export const CHECKING_LABEL = "Verificando conexão..."

export function IntegrationStatusDot({ health }: { health: IntegrationHealthDto }) {
    const style = STATUS_STYLE[health.status]
    if (health.checking) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <motion.span
                            key="checking"
                            className="relative inline-flex h-3 w-3"
                            aria-label={CHECKING_LABEL}
                            data-status="checking"
                            tabIndex={0}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        >
                            <span className="absolute inset-0 rounded-full bg-sky-500/25" />
                            <motion.span
                                className="absolute inset-0 rounded-full border-2 border-sky-500 border-t-transparent"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            />
                        </motion.span>
                    </TooltipTrigger>
                    <TooltipContent>{CHECKING_LABEL}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="relative inline-flex h-3 w-3" aria-label={style.label} data-status={health.status} tabIndex={0}>
                        {health.status !== "unknown" && (
                            <motion.span
                                className={cn("absolute inline-flex h-full w-full rounded-full", style.ring)}
                                initial={{ scale: 1, opacity: 0.7 }}
                                animate={{ scale: 2.2, opacity: 0 }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                            />
                        )}
                        {/* Nova chave a cada verificação: pulso de retorno mesmo quando a cor não muda. */}
                        <motion.span
                            key={`${health.status}:${health.checkedAt ?? ""}`}
                            className={cn("relative inline-flex h-3 w-3 rounded-full", style.dot)}
                            initial={{ scale: 0.4 }}
                            animate={{ scale: [0.4, 1.35, 1] }}
                            // Tween: spring não aceita mais de dois keyframes.
                            transition={{ duration: 0.45, ease: "easeOut", times: [0, 0.6, 1] }}
                        />
                    </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <p className="font-medium">{style.label}</p>
                    {health.message && <p className="text-xs opacity-80">{health.message}</p>}
                    {health.checkedAt && (
                        <p className="mt-1 text-xs opacity-70">
                            {health.source === "scheduler" ? "Verificação automática" : "Teste manual"} em{" "}
                            {formatLogTimestamp(health.checkedAt).slice(0, 19)}
                            {health.latencyMs !== undefined ? ` · ${health.latencyMs} ms` : ""}
                        </p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

export function EnvironmentBadge({ environment }: { environment: IntegrationEnvironment }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                environment === "interno"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
            )}
        >
            {INTEGRATION_ENVIRONMENT_LABELS[environment]}
        </span>
    )
}
