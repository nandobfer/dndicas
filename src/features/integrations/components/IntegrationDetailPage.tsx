"use client"

import { Loader2 } from "lucide-react"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { useIntegration } from "../hooks/useIntegrations"
import { useIntegrationStatusLive } from "../hooks/useIntegrationStatusLive"
import { IntegrationEditor } from "./detail/IntegrationEditor"

export { buildIntegrationPatch, FIELD_GRID } from "./detail/draft"

export function IntegrationDetailPage({ id }: { id: IntegrationId }) {
    const { data, isLoading, isError } = useIntegration(id)
    useIntegrationStatusLive([id])

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center" role="status">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="sr-only">Carregando integração...</span>
            </div>
        )
    }
    if (isError || !data) {
        return <p className="rounded-lg border border-destructive p-6 text-destructive">Integração não encontrada ou sem acesso.</p>
    }
    return <IntegrationEditor id={id} data={data} />
}
