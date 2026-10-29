"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Copy, ExternalLink, Server } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { McpServerOverviewDto } from "../../services/mcp-overview"
import { cardMotion } from "../detail/draft"

const MCP_OVERVIEW_KEY = ["integrations", "internal_api", "mcp"] as const

function useMcpOverview() {
    return useQuery({
        queryKey: MCP_OVERVIEW_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<McpServerOverviewDto>>("/integrations/internal_api/mcp")).data),
    })
}

/** Servidor MCP do DnDicas: endereço para os clientes MCP e os tokens permanentes ativos. */
export function McpServerCard() {
    const query = useMcpOverview()
    const endpointUrl = typeof window === "undefined" || !query.data ? "" : `${window.location.origin}${query.data.endpoint}`

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(endpointUrl)
            toast.success("Endereço do servidor MCP copiado")
        } catch {
            toast.error("Não foi possível copiar o endereço")
        }
    }

    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.05 }}>
            <Card>
                <CardHeader className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Server className="h-4 w-4 text-primary" aria-hidden /> Servidor MCP
                    </CardTitle>
                    <CardDescription>
                        Catálogo e central de feedback do DnDicas para agentes de IA (Streamable HTTP). Leituras são públicas; escritas exigem o token
                        permanente gerado em Perfil.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <AnimatePresence mode="wait" initial={false}>
                        {query.isLoading ? (
                            <motion.div key="loading" className="space-y-2">
                                <Skeleton className="h-9 w-full" />
                                <Skeleton className="h-5 w-1/2" />
                            </motion.div>
                        ) : query.isError || !query.data ? (
                            <motion.div key="error">
                                <ErrorState
                                    title="Não foi possível carregar o servidor MCP"
                                    description={apiErrorMessage(query.error, "Tente novamente.")}
                                    onRetry={() => void query.refetch()}
                                />
                            </motion.div>
                        ) : (
                            <motion.div key="data" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">{endpointUrl}</code>
                                    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label="Copiar endereço do servidor MCP">
                                        <Copy className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                </div>
                                <p className="text-muted-foreground">
                                    {query.data.activeTokens === 0
                                        ? "Nenhum usuário com token MCP ativo."
                                        : `${query.data.activeTokens} usuário(s) com token MCP ativo, ${query.data.adminTokens} administrador(es).`}{" "}
                                    {query.data.lastUsedAt
                                        ? `Último uso ${formatDistanceToNow(new Date(query.data.lastUsedAt), { addSuffix: true, locale: ptBR })}.`
                                        : "Nenhum uso registrado."}
                                </p>
                                <Button asChild variant="link" size="sm" className="h-auto px-0">
                                    <Link href="/profile">
                                        Gerenciar meu token MCP <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                                    </Link>
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </motion.div>
    )
}
