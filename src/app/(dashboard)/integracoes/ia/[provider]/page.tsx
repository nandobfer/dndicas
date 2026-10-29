import { notFound } from "next/navigation"
import { getAiProvider, isAiProviderId } from "@/lib/ai/providers"
import { IntegrationDetailPage } from "@/features/integrations/components/IntegrationDetailPage"

/** Página de um provedor de IA (`/integracoes/ia/opencode`, `/integracoes/ia/gemini`, `/integracoes/ia/anthropic`...). */
export default async function ProvedorIaPage({ params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params
    if (!isAiProviderId(provider)) notFound()
    return <IntegrationDetailPage id={getAiProvider(provider).integrationId} />
}
