"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/opex/dialog"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { formatLogLine } from "@/lib/integrations/log-format"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { useIntegrationTestStream } from "../hooks/useIntegrationTestStream"
import type { IntegrationTestEvent } from "../types"
import { IntegrationConsole, type IntegrationConsoleHandle } from "./IntegrationConsole"

interface IntegrationTestDialogProps {
    integrationId: IntegrationId | null
    onOpenChange: (open: boolean) => void
}

/** Linha de terminal para um evento do stream do teste. */
export function formatTestEvent(integrationId: IntegrationId, event: IntegrationTestEvent): string {
    const tag = getIntegrationDef(integrationId).name.toUpperCase()
    if (event.type === "log") {
        return formatLogLine({ integrationId, level: event.level, message: event.message, ts: event.ts }, { tag })
    }
    return formatLogLine(
        {
            integrationId,
            level: event.ok ? "success" : "error",
            message: event.ok ? `✔ ${event.message}` : `✖ ${event.message}`,
            ts: event.ts,
        },
        { tag },
    )
}

export function IntegrationTestDialog({ integrationId, onOpenChange }: IntegrationTestDialogProps) {
    return (
        <Dialog open={integrationId !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl overflow-hidden p-0">
                <AnimatePresence mode="wait">
                    {integrationId && <TestPanel key={integrationId} integrationId={integrationId} />}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}

function TestPanel({ integrationId }: { integrationId: IntegrationId }) {
    const def = getIntegrationDef(integrationId)
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const [result, setResult] = useState<Extract<IntegrationTestEvent, { type: "result" }> | null>(null)

    const onEvent = useCallback(
        (event: IntegrationTestEvent) => {
            consoleRef.current?.writeLines([formatTestEvent(integrationId, event)])
            if (event.type === "result") setResult(event)
        },
        [integrationId],
    )
    const { state, start, cancel } = useIntegrationTestStream(integrationId, onEvent)

    const run = useCallback(() => {
        consoleRef.current?.clear()
        setResult(null)
        void start()
    }, [start])

    // O teste começa ao abrir o modal; agendado para fora do corpo do efeito.
    useEffect(() => {
        const timer = setTimeout(run, 0)
        return () => {
            clearTimeout(timer)
            cancel()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <motion.div {...dialogPanelMotion} className="flex flex-col gap-4 p-6">
            <DialogHeader>
                <DialogTitle>Testar conexão — {def.name}</DialogTitle>
                <DialogDescription>Cada etapa do teste aparece abaixo assim que acontece.</DialogDescription>
            </DialogHeader>

            <IntegrationConsole ref={consoleRef} className="h-[360px]" placeholder="Iniciando teste..." />

            <div className="flex min-h-10 items-center justify-between gap-4">
                <AnimatePresence mode="wait" initial={false}>
                    {state === "running" ? (
                        <motion.p
                            key="running"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                            <Loader2 className="h-4 w-4 animate-spin" /> Testando conexão...
                        </motion.p>
                    ) : result ? (
                        <motion.p
                            key={result.ok ? "ok" : "error"}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 22 }}
                            className={
                                result.ok
                                    ? "flex items-center gap-2 text-sm font-medium text-emerald-600"
                                    : "flex items-center gap-2 text-sm font-medium text-destructive"
                            }
                        >
                            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                            {result.ok ? "Conexão OK" : "Falha na conexão"}
                            {result.latencyMs > 0 && <span className="font-normal text-muted-foreground">· {result.latencyMs} ms</span>}
                        </motion.p>
                    ) : (
                        <span key="empty" />
                    )}
                </AnimatePresence>
                <Button variant="outline" onClick={run} disabled={state === "running"}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Testar novamente
                </Button>
            </div>
        </motion.div>
    )
}
