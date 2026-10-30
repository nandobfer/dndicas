import { notFound, redirect } from "next/navigation"
import { hasCustomIntegrationPath, integrationPath, isIntegrationId } from "@/lib/integrations/catalog"
import { IntegrationDetailPage } from "@/features/integrations/components/IntegrationDetailPage"
import { pageAccess } from "@/features/perfix/server/page-access"

export default async function IntegracaoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!isIntegrationId(id)) notFound()
    await pageAccess(`integrations.${id}.view`)
    // Provedores de IA têm rotas próprias (`/integracoes/ia[/provedor]`).
    if (hasCustomIntegrationPath(id)) redirect(integrationPath(id))
    return <IntegrationDetailPage id={id} />
}
