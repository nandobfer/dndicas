"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/opex/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { TableAction } from "@/components/list/TableAction"
import { integrationPath, type IntegrationId } from "@/lib/integrations/catalog"
import { IntegrationStatusDot } from "@/features/integrations/components/IntegrationBadges"
import { IntegrationTestDialog } from "@/features/integrations/components/IntegrationTestDialog"
import { useIntegrations } from "@/features/integrations/hooks/useIntegrations"
import { useIntegrationStatusLive } from "@/features/integrations/hooks/useIntegrationStatusLive"

/** Provedores de IA integrados: status, teste de conexão e acesso à página de cada um. */
export function AiProvidersTab() {
    const { data = [], isLoading, isError, refetch } = useIntegrations()
    const providers = data.filter((integration) => integration.parent === "ai")
    const [testing, setTesting] = useState<IntegrationId | null>(null)
    useIntegrationStatusLive(providers.map((provider) => provider.id))

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Provedores</CardTitle>
                <CardDescription>Configure cada provedor na própria página. As features escolhem entre os provedores conectados.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="space-y-2 p-4">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : isError ? (
                    <ErrorState title="Não foi possível carregar os provedores" description="Tente novamente." onRetry={() => void refetch()} />
                ) : (
                    <motion.ul initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }} className="divide-y border-t">
                        {providers.map((provider) => (
                            <motion.li key={provider.id} variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.2 }} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                                <IntegrationStatusDot health={provider.health} />
                                <Link href={integrationPath(provider.id)} className="group flex min-w-0 flex-1 items-center gap-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 font-medium">
                                            {provider.name}
                                            {!provider.configured && (
                                                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                                    Não configurado
                                                </Badge>
                                            )}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground" title={provider.description}>
                                            {provider.description}
                                        </span>
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                                </Link>
                                <TableAction type="test" onClick={() => setTesting(provider.id)} />
                            </motion.li>
                        ))}
                    </motion.ul>
                )}
            </CardContent>
            <IntegrationTestDialog integrationId={testing} onOpenChange={(open) => !open && setTesting(null)} />
        </Card>
    )
}
