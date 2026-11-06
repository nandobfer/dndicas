import { createWebhookHandler, isConsumedEvent, type DedupeStore, type WebhookEvent } from "@engramind/client/server"
import { dbConnect } from "@/lib/db"
import { CAMPAIGN_CHANNEL_PREFIX } from "../constants"
import { invalidateCategoryCache } from "./categories"
import { engramindConnection } from "./client"
import { engramindBus } from "./live"
import { EngramindWebhookEvent } from "./models"
import { engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Webhook do Engramind (`POST /api/engramind/webhook`): público, autenticado só pela assinatura
 * (`Engramind-Signature`, HMAC-SHA256 de `t + "." + corpo`, janela de 300 s; sem assinatura válida → `401`
 * sem corpo). Evento repetido (mesmo `id`, guardado 24 h em `engramind_webhook_events`) é descartado.
 * Um evento válido:
 * - marca o contexto em cache do canal como sujo (menos `memory.consumed`);
 * - vai para o SSE da rede (só ids, slugs e tipos);
 * - `memory.*` do canal dos jogadores de uma campanha avisa os membros (o Diário recarrega; o Engramind é a
 *   única fonte das memórias das campanhas, então não há nada a aplicar no banco);
 * - `settings.updated` relê as categorias.
 */

const mongoDedupe: DedupeStore = {
    async seen(id) {
        try {
            await dbConnect()
            await EngramindWebhookEvent.create({ _id: id, type: "webhook", receivedAt: new Date() })
            return false
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                engramindLog.info({ id }, "[engramind] evento do webhook repetido: descartado")
                return true
            }
            engramindLog.warn({ err: messageOf(error) }, "[engramind] registro do evento do webhook falhou")
            return false
        }
    },
}

export async function onWebhookEvent(event: WebhookEvent): Promise<void> {
    if (event.type === "settings.updated") invalidateCategoryCache()
    if (isConsumedEvent(event.type)) return
    if (event.type.startsWith("memory.") && event.channel) {
        const { markContextDirty } = await import("./memory-context")
        await markContextDirty(event.channel).catch((error: unknown) => engramindLog.warn({ err: messageOf(error) }, "[engramind] contexto não marcado como sujo"))
    }
    if (event.type.startsWith("memory.") && event.channel?.startsWith(CAMPAIGN_CHANNEL_PREFIX)) {
        void import("./campaign-memories")
            .then(async ({ campaignOfPlayersChannel, notifyJournalChanged }) => {
                const campaignId = campaignOfPlayersChannel(event.channel)
                if (campaignId) await notifyJournalChanged(campaignId)
            })
            .catch((error: unknown) => engramindLog.warn({ err: messageOf(error) }, "[engramind] aviso do Diário não disparado"))
    }
    if (!event.type.startsWith("memory.")) await publishEngramind({ type: event.type })
}

const handler = createWebhookHandler({
    secret: async () => (await engramindConnection())?.webhookSecret ?? null,
    bus: engramindBus(),
    dedupe: mongoDedupe,
    onEvent: onWebhookEvent,
    onError: (error) => engramindLog.warn({ err: messageOf(error) }, "[engramind] evento do webhook não processado"),
})

export function handleWebhook(request: Request): Promise<Response> {
    return handler(request)
}
