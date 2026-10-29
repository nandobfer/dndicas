import { loggerFor } from "@/lib/logger"
import type { IntegrationId } from "@/lib/integrations/catalog"

/**
 * Ações de uma integração ao ser **ativada** (campo público `active` passando de desligado para
 * ligado, depois de gravado e auditado). Import dinâmico: o código da feature só carrega aqui, como
 * ponto de montagem. Falha no gancho não desfaz a ativação.
 */
export const INTEGRATION_ENABLE_HOOKS: Partial<Record<IntegrationId, (actorId: string) => Promise<void>>> = {}

export async function runIntegrationEnableHook(id: IntegrationId, actorId: string): Promise<void> {
    const hook = INTEGRATION_ENABLE_HOOKS[id]
    if (!hook) return
    try {
        await hook(actorId)
    } catch (error) {
        loggerFor({ userId: actorId }).error({ err: error, integrationId: id }, "Falha na ação de ativação da integração")
    }
}
