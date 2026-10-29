import { logger } from "@/lib/logger"
import { getIntegrationConfig } from "./config"

export interface AnalyticsScriptConfig {
    scriptUrl: string
    websiteId: string
}

/**
 * Script do Umami (Integrações › Analytics). `null` com a integração desativada ou incompleta.
 * Nunca lança: sem banco, vale o padrão do catálogo. SOMENTE servidor.
 */
export async function getAnalyticsConfig(): Promise<AnalyticsScriptConfig | null> {
    try {
        const config = await getIntegrationConfig("analytics_umami")
        if (!config.active || !config.scriptUrl?.trim() || !config.websiteId?.trim()) return null
        return { scriptUrl: config.scriptUrl.trim(), websiteId: config.websiteId.trim() }
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error }, "[analytics] Configuração indisponível")
        return null
    }
}
