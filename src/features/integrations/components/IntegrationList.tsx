"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { TableAction } from "@/components/list/TableAction"
import { Badge } from "@/components/ui/opex/badge"
import { IN_DEVELOPMENT_INTEGRATIONS, integrationPath, type IntegrationId } from "@/lib/integrations/catalog"
import { InDevelopmentBadge } from "./InDevelopmentBadge"
import { useIntegrations } from "../hooks/useIntegrations"
import { useIntegrationStatusLive } from "../hooks/useIntegrationStatusLive"
import { EnvironmentBadge, IntegrationStatusDot } from "./IntegrationBadges"
import { IntegrationDebugDialog } from "./IntegrationDebugDialog"
import { IntegrationTestDialog } from "./IntegrationTestDialog"

export const DEBUG_DISABLED_REASON = "Ative o modo debug na integração para acompanhar os logs"

/**
 * Lista das integrações. Cada linha é um card clicável (o próprio link navega para a página da
 * integração), com os botões "Testar conexão" e "Logs de debug" fora do link. Mesmo desenho do card
 * dos provedores de IA (`AiProvidersTab`).
 */
export function IntegrationList() {
    const { data: all = [], isLoading, isError } = useIntegrations()
    // Integrações-filhas (provedores de IA) aparecem só dentro da página da mãe.
    const integrations = all.filter((integration) => !integration.parent)
    // Integrações futuras: só a linha informativa, sem status, teste, debug nem edição.
    const inDevelopment = IN_DEVELOPMENT_INTEGRATIONS
    const [testing, setTesting] = useState<IntegrationId | null>(null)
    const [debugging, setDebugging] = useState<IntegrationId | null>(null)
    useIntegrationStatusLive(integrations.map((integration) => integration.id))

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader
                title="Integrações"
                description="Serviços usados pelo app: status da conexão, configuração e logs de debug"
            />

            <CadastroTableCard>
                {isLoading ? (
                    <CadastroTableSkeleton columns={4} rows={6} />
                ) : isError ? (
                    <p className="p-6 text-center text-sm text-destructive">Não foi possível carregar as integrações.</p>
                ) : (
                    <motion.ul
                        initial="hidden"
                        animate="visible"
                        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                        className="divide-y"
                    >
                        {integrations.map((integration) => (
                            <motion.li
                                key={integration.id}
                                variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
                            >
                                <IntegrationStatusDot health={integration.health} />
                                <Link href={integrationPath(integration.id)} className="group flex min-w-0 flex-1 items-center gap-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2 font-medium">
                                            {integration.name}
                                            <EnvironmentBadge environment={integration.environment} />
                                            {!integration.configured && (
                                                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                                    Não configurado
                                                </Badge>
                                            )}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground" title={integration.description}>
                                            {integration.description}
                                        </span>
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                                </Link>
                                <div className="flex shrink-0 items-center gap-1">
                                    <TableAction type="test" onClick={() => setTesting(integration.id)} />
                                    <TableAction
                                        type="debug"
                                        onClick={() => setDebugging(integration.id)}
                                        disabled={!integration.debugMode}
                                        disabledReason={DEBUG_DISABLED_REASON}
                                    />
                                </div>
                            </motion.li>
                        ))}
                        {inDevelopment.map((item) => (
                            <motion.li
                                key={item.id}
                                variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="flex items-center gap-3 py-3 opacity-70"
                                aria-disabled="true"
                            >
                                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-muted-foreground">{item.name}</p>
                                    <p className="truncate text-xs text-muted-foreground" title={item.description}>
                                        {item.description}
                                    </p>
                                </div>
                                <InDevelopmentBadge />
                            </motion.li>
                        ))}
                    </motion.ul>
                )}
            </CadastroTableCard>

            <IntegrationTestDialog integrationId={testing} onOpenChange={(open) => !open && setTesting(null)} />
            <IntegrationDebugDialog integrationId={debugging} onOpenChange={(open) => !open && setDebugging(null)} />
        </div>
    )
}
