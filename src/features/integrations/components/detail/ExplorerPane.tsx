"use client"

import { motion } from "framer-motion"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { IntegrationExplorer } from "../explorer/IntegrationExplorer"

interface ExplorerPaneProps {
    id: IntegrationId
    integrationName: string
    swaggerUrl: string
    onBack: () => void
}

/** Explorador da API, que substitui o formulário na coluna da esquerda. */
export function ExplorerPane({ id, integrationName, swaggerUrl, onBack }: ExplorerPaneProps) {
    return (
        <motion.div
            key="explorer"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="min-w-0"
        >
            <IntegrationExplorer id={id} integrationName={integrationName} swaggerUrl={swaggerUrl} onBack={onBack} />
        </motion.div>
    )
}
