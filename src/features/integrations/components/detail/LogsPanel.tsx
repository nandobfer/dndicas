"use client"

import type { RefObject } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bug } from "lucide-react"
import { Card, CardContent } from "@/components/ui/opex/card"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { IntegrationDebugConsole } from "../IntegrationDebugConsole"

interface LogsPanelProps {
    id: IntegrationId
    visible: boolean
    debugHeight: number | null | undefined
    logsCardRef: RefObject<HTMLDivElement | null>
    maximized: boolean
    onMaximizedChange: (maximized: boolean) => void
}

/** Painel lateral de logs (modo debug), fixo na área visível e maximizável. */
export function LogsPanel({ id, visible, debugHeight, logsCardRef, maximized, onMaximizedChange }: LogsPanelProps) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.aside
                    key="debug"
                    initial={{ opacity: 0, x: 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 32 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    className="sticky top-0 min-w-0"
                    style={{ height: debugHeight ? Math.max(debugHeight, 360) : undefined }}
                    data-testid="integration-debug-panel"
                >
                    {/* O `aside` fica na grade como placeholder; maximizar redimensiona só o Card. */}
                    <Card ref={logsCardRef} className="flex h-full min-h-[360px] flex-col">
                        <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                            <IntegrationDebugConsole
                                integrationId={id}
                                className="flex-1"
                                consoleClassName="min-h-0 flex-1"
                                maximized={maximized}
                                onMaximizedChange={onMaximizedChange}
                                title={
                                    <h2 className="flex items-center gap-2 text-base font-semibold">
                                        <Bug className="h-4 w-4 text-amber-600" /> Logs
                                    </h2>
                                }
                            />
                        </CardContent>
                    </Card>
                </motion.aside>
            )}
        </AnimatePresence>
    )
}
