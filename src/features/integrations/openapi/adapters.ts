import {
    EXPLORER_INTERNAL_BASE_URL,
    getIntegrationDef,
    type IntegrationId,
} from "@/lib/integrations/catalog"
import { getInternalBaseUrl, type IntegrationConfigMap } from "@/lib/integrations/config"

/**
 * Adaptadores do explorador: URL base das chamadas e cabeçalhos de autenticação
 * montados SEMPRE no servidor, com as credenciais da integração. O navegador nunca recebe
 * nenhum valor — só o resumo `authLabel` do catálogo.
 *
 * API interna: chama a própria aplicação, SEM injetar credencial — os tokens de sistema ficam só
 * como hash no banco, então quem explora informa `Authorization: Bearer <token>` no cabeçalho.
 * As demais integrações exploram a especificação sem autenticação automática.
 */

type Values<Id extends IntegrationId> = IntegrationConfigMap[Id]

interface AdapterImpl<Id extends IntegrationId> {
    /** Cabeçalhos de autenticação, ou `null` se faltar credencial. */
    authorize(values: Values<Id>): Record<string, string> | null | Promise<Record<string, string> | null>
    /** Aceita o `Authorization` informado no explorador (só para a origem do adaptador). */
    clientAuthorization?: boolean
}

const ADAPTERS: { [Id in IntegrationId]?: AdapterImpl<Id> } = {
    internal_api: { authorize: () => null, clientAuthorization: true },
}

export interface ResolvedExplorerTarget {
    /** URL base das execuções (sem barra final), ou `null` para seguir a especificação. */
    baseUrl: string | null
    /** Cabeçalhos a injetar; vazio sem adaptador ou sem credencial. */
    authHeaders: Record<string, string>
    /** Há adaptador declarado. */
    hasAdapter: boolean
    /** Adaptador com todas as credenciais. */
    authReady: boolean
    /** O `Authorization` do explorador é repassado (adaptador sem credencial própria). */
    clientAuthorization: boolean
}

function trimSlash(url: string): string {
    return url.replace(/\/+$/, "")
}

export async function resolveExplorerTarget<Id extends IntegrationId>(
    id: Id,
    values: Values<Id>,
): Promise<ResolvedExplorerTarget> {
    const def = getIntegrationDef(id)
    const adapter = ADAPTERS[id] as AdapterImpl<Id> | undefined
    if (!def.explorer || !adapter) return { baseUrl: null, authHeaders: {}, hasAdapter: false, authReady: false, clientAuthorization: false }

    let baseUrl: string | null
    if (def.explorer.baseUrlField === EXPLORER_INTERNAL_BASE_URL) {
        baseUrl = await getInternalBaseUrl()
    } else {
        const raw = (values as unknown as Record<string, unknown>)[def.explorer.baseUrlField]
        baseUrl = typeof raw === "string" && raw.trim() ? trimSlash(raw.trim()) : null
        if (baseUrl && def.explorer.originOnly) {
            try {
                baseUrl = new URL(baseUrl).origin
            } catch {
                baseUrl = null
            }
        }
    }
    const authHeaders = (await adapter.authorize(values)) ?? {}
    return { baseUrl, authHeaders, hasAdapter: true, authReady: Object.keys(authHeaders).length > 0, clientAuthorization: adapter.clientAuthorization === true }
}

/** Integrações com adaptador implementado (para testes e documentação). */
export const EXPLORER_ADAPTER_IDS = Object.keys(ADAPTERS) as IntegrationId[]
