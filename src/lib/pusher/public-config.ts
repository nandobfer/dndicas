import { logger } from "@/lib/logger"
import { getIntegrationConfig } from "@/lib/integrations/config"
import type { PusherClientConfig } from "./client"

/**
 * Configuração pública do cliente (key, modo e cluster ou URL), com fallback para os valores do
 * servidor quando os campos "do cliente" estão vazios. Só envia o que vale para o modo ativo.
 * Nunca lança.
 */
export async function getPusherPublicConfig(): Promise<PusherClientConfig> {
    try {
        const values = await getIntegrationConfig("pusher")
        const key = values.clientKey || values.key
        if (values.mode === "host") return { key, mode: "host", url: values.clientUrl || values.url }
        return { key, mode: "cluster", cluster: values.clientCluster || values.cluster }
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error }, "[pusher] Configuração pública indisponível")
        return {}
    }
}
