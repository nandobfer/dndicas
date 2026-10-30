import { opexConnection, opexAdminSession } from "./config"
import type { IntegrationTester } from "@/features/integrations/testers/types"

export const testOpex: IntegrationTester = async ({ emit }) => {
    emit("step", "Validando a sessão do cliente no Opex")
    const connection = await opexConnection()
    const { session, cookie } = await opexAdminSession(connection)
    await connection.client.users(cookie)
    emit("success", `Cliente ${session.clientName}: acesso administrativo a usuários confirmado`)
    return "Conexão com o Opex validada"
}
