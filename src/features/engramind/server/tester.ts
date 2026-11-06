import { CAMPAIGN_CATEGORY_LIST } from "../constants"
import { fail, warnResult, type TesterContext, type TesterResult } from "@/features/integrations/testers/types"
import { assertAppToken } from "./bootstrap"
import { clientFor, engramindConnection, webhookUrlOf } from "./client"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { messageOf } from "./shared"

/**
 * Teste de conexão da integração Engramind:
 * - vermelho: sem configuração, `GET /health/ready` fora do ar, token recusado ou que não é `kind: app`
 *   do app `dndicas`;
 * - amarelo: configuração automática pendente (ou com passo pendente), categorias das campanhas
 *   faltando ou webhook não registrado.
 */
export async function testEngramind({ emit, signal }: TesterContext): Promise<TesterResult> {
    const connection = await engramindConnection()
    if (!connection) fail("Configure a URL base do Engramind e o token do app")
    const client = clientFor(connection.baseUrl, connection.appToken)
    emit("step", `GET ${connection.baseUrl}/health/ready`)
    const ready = await client.ready(signal)
    if (!ready.ready) fail(`Engramind fora do ar (${ready.detail})`)
    emit("success", "Engramind no ar")
    emit("step", "whoami")
    try {
        await assertAppToken(client)
    } catch (error) {
        fail(messageOf(error))
    }
    emit("success", "Token de app do app dndicas")
    const problems: string[] = []
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).lean().catch(() => null)
    const steps = state?.bootstrap?.steps ?? []
    if (!steps.length) problems.push("configuração automática ainda não rodou")
    else if (steps.some((step) => step.status === "error" || step.status === "pending")) problems.push("configuração automática com passo pendente (use \"Repetir configuração automática\")")
    try {
        const { categories } = await client.categories.list()
        const missing = CAMPAIGN_CATEGORY_LIST.filter((def) => !categories.some((item) => item.key === def.key)).map((def) => def.key)
        if (missing.length) problems.push(`categorias das campanhas faltando: ${missing.join(", ")}`)
    } catch (error) {
        problems.push(`categorias indisponíveis (${messageOf(error)})`)
    }
    try {
        const app = await client.apps.get("dndicas")
        const expected = connection.publicAppUrl ? webhookUrlOf(connection.publicAppUrl) : null
        if (!app.webhook?.url || !app.webhook.secret.configured || !connection.webhookSecret) problems.push("webhook não registrado")
        else if (expected && app.webhook.url !== expected) problems.push(`webhook aponta para ${app.webhook.url} (esperado ${expected})`)
    } catch (error) {
        problems.push(`estado do webhook indisponível (${messageOf(error)})`)
    }
    for (const problem of problems) emit("warn", problem)
    if (problems.length) return warnResult(`Disponível com restrição: ${problems.join("; ")}`)
    return "Engramind disponível; rede do dndicas configurada"
}
