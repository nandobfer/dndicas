import { getIntegrationConfig } from "@/lib/integrations/config"
import { DomainError } from "@/lib/api/route"
import { normalizeOpexUrl, OpexClient } from "./opex-client"

export async function opexConnection() {
    const config = await getIntegrationConfig("opex")
    if (!config.baseUrl || !config.clientToken) throw new DomainError(409, "A integração Tarefas Opex ainda não foi configurada. Peça ao administrador para configurá-la em Integrações.", "OPEX_NOT_CONFIGURED")
    if (!config.clientToken.startsWith("cli_")) throw new DomainError(409, "Configure um token de cliente (cli_…) na integração Opex.", "OPEX_CLIENT_TOKEN_NOT_ADMIN")
    return { baseUrl: normalizeOpexUrl(config.baseUrl), clientToken: config.clientToken, client: new OpexClient(config.internalUrl || config.baseUrl) }
}

export async function opexAdminSession(connection: Awaited<ReturnType<typeof opexConnection>>) {
    const cookie = await connection.client.login(connection.clientToken)
    const session = await connection.client.session(cookie)
    if (!session.isAdmin) throw new DomainError(409, "O token configurado precisa permitir administrar os usuários do cliente no Opex.", "OPEX_CLIENT_TOKEN_NOT_ADMIN")
    return { cookie, session }
}
