import { randomBytes } from "node:crypto"
import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { dbConnect } from "@/lib/db"
import {
    AGENT_TOKEN_FIELDS,
    AGENT_TOKEN_SCOPES,
    CAMPAIGN_CATEGORY_LIST,
    ENGRAMIND_APP,
    FIXED_CHANNELS,
    IDENTITY_LABELS,
    MEMORY_IDENTITIES,
    agentSlug,
    subscriptionsFor,
    type MemoryIdentity,
    type SubscriptionMode,
} from "../constants"
import type { BootstrapStepDto, BootstrapDto } from "../types"
import { clientFor, engramindConnection, webhookUrlOf, writeEngramindSecrets, type EngramindConnection } from "./client"
import { ensureCategories } from "./categories"
import { ENGRAMIND_STATE_ID, EngramindState, type BootstrapStepRecord } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Configuração automática da rede do dndicas no Engramind (idempotente; "Repetir configuração
 * automática"). Tudo com o token de app:
 * 1. `whoami` (exige `kind: app` do app `dndicas`);
 * 2. os 5 agentes (existente é reaproveitado, desativado é reativado);
 * 3. os 7 canais fixos, criados por assinatura exata `inject` (o token de app não tem `create_channel`),
 *    com nome pt-BR; arquivado é restaurado;
 * 4. as demais assinaturas (`dndicas/opex/*`, os canais fixos em `manage` para o Agente Opex e as
 *    campanhas em `search` para o Maddox);
 * 5. um token `agent` `read+write+delete` por agente, cifrado na integração (reemitido quando falta, foi
 *    revogado, expirou ou tem outros escopos; o anterior é revogado);
 * 6. o webhook `<URL pública>/api/engramind/webhook` com segredo novo (pulado se já está igual);
 * 7. as categorias das campanhas (cria as que faltam) e a rede das campanhas existentes.
 * Cada passo é auditado e logado, sem segredos. Uma falha para no passo e mantém os anteriores.
 */

type StepResult = { status: BootstrapStepRecord["status"]; message: string }

export const BOOTSTRAP_STEPS = [
    { id: "whoami", label: "Validar o token do app" },
    { id: "agents", label: "Agentes" },
    { id: "channels", label: "Canais fixos" },
    { id: "subscriptions", label: "Assinaturas" },
    { id: "tokens", label: "Tokens dos agentes" },
    { id: "webhook", label: "Webhook" },
    { id: "categories", label: "Categorias e canais das campanhas" },
] as const

type StepId = (typeof BOOTSTRAP_STEPS)[number]["id"]

export class BootstrapTokenError extends Error {}

/** Valida o token configurado: precisa ser `kind: app` do app `dndicas`. */
export async function assertAppToken(client: EngramindClient): Promise<void> {
    const me = await client.whoami()
    if (me.kind !== "app") throw new BootstrapTokenError(`O token configurado é do tipo "${me.kind}": use um token de app (kind: app) do app ${ENGRAMIND_APP}, emitido no Opex.`)
    if (me.app?.slug !== ENGRAMIND_APP) throw new BootstrapTokenError(`O token é do app "${me.app?.slug ?? "?"}": use um token de app do app ${ENGRAMIND_APP}, emitido no Opex.`)
}

async function ensureAgents(client: EngramindClient): Promise<StepResult> {
    let created = 0
    let reactivated = 0
    for (const identity of MEMORY_IDENTITIES) {
        const labels = IDENTITY_LABELS[identity]
        try {
            const agent = await client.agents.create({ app: ENGRAMIND_APP, slug: identity, name: labels.name, description: labels.description })
            if (agent.created !== false) created++
            if (agent.disabled_at) {
                await client.agents.update(agentSlug(identity), { disabled: false })
                reactivated++
            }
        } catch (error) {
            if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
            const current = await client.agents.get(agentSlug(identity))
            await client.agents.update(agentSlug(identity), { name: labels.name, description: labels.description, ...(current.disabled_at ? { disabled: false } : {}) })
            if (current.disabled_at) reactivated++
        }
    }
    return { status: "ok", message: `${MEMORY_IDENTITIES.length} agentes (${created} criados, ${reactivated} reativados)` }
}

/** Assinatura idempotente: repetida igual é reaproveitada; com outro modo, é atualizada. */
export async function ensureSubscription(client: EngramindClient, identity: MemoryIdentity, target: string, mode: SubscriptionMode): Promise<{ created: boolean; channelCreated: boolean }> {
    try {
        const result = (await client.subscriptions.create({ agent: agentSlug(identity), target, mode })) as { created?: boolean; channel_created?: boolean }
        return { created: result.created !== false, channelCreated: result.channel_created === true }
    } catch (error) {
        if (engramindCodeOf(error) !== "SUBSCRIPTION_EXISTS") throw error
        const details = (error as { details?: { existing?: { id?: string } } }).details
        let id = details?.existing?.id
        if (!id) {
            const { subscriptions } = await client.subscriptions.list({ agent: agentSlug(identity), limit: 200 })
            id = subscriptions.find((item) => item.target === target)?.id
        }
        if (!id) throw error
        await client.subscriptions.update(id, { mode, access: null, priority: null })
        return { created: false, channelCreated: false }
    }
}

/** Canal que o app criou ao assinar: nome pt-BR e restaurado se estiver arquivado. */
export async function tidyChannel(client: EngramindClient, slug: string, name: string, description: string | null, channelCreated: boolean): Promise<"created" | "restored" | "exists"> {
    if (channelCreated) {
        await client.call("PATCH", `/v1/channels/${encodeURIComponent(slug)}`, { body: { name, description } }).catch((error: unknown) => {
            engramindLog.warn({ channel: slug, err: messageOf(error) }, "[engramind] nome do canal não atualizado")
        })
        return "created"
    }
    const channel = await client.channels.get(slug)
    if (channel.archived_at) {
        await client.channels.restore(slug)
        return "restored"
    }
    return "exists"
}

async function ensureFixedChannels(client: EngramindClient): Promise<StepResult> {
    const counts = { created: 0, restored: 0, exists: 0 }
    for (const channel of FIXED_CHANNELS) {
        const { channelCreated } = await ensureSubscription(client, channel.owner, channel.slug, "inject")
        counts[await tidyChannel(client, channel.slug, channel.name, channel.description, channelCreated)]++
    }
    return { status: "ok", message: `${FIXED_CHANNELS.length} canais (${counts.created} criados, ${counts.restored} restaurados)` }
}

async function ensureOtherSubscriptions(client: EngramindClient): Promise<StepResult> {
    const fixed = new Set(FIXED_CHANNELS.map((channel) => `${channel.owner}|${channel.slug}`))
    const rest = subscriptionsFor().filter((item) => !fixed.has(`${item.agent}|${item.target}`))
    let created = 0
    for (const item of rest) if ((await ensureSubscription(client, item.agent, item.target, item.mode)).created) created++
    return { status: "ok", message: `${rest.length + FIXED_CHANNELS.length} assinaturas (${created} novas nesta execução)` }
}

const tokenIdOf = (secret: string | undefined) => secret?.split(".")[1] ?? null
const sameScopes = (scopes: readonly string[]) => scopes.length === AGENT_TOKEN_SCOPES.length && AGENT_TOKEN_SCOPES.every((scope) => scopes.includes(scope))

async function listAgentTokens(client: EngramindClient, identity: MemoryIdentity) {
    const tokens: Awaited<ReturnType<EngramindClient["tokens"]["list"]>>["tokens"] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
        const result: Awaited<ReturnType<EngramindClient["tokens"]["list"]>> = await client.tokens.list({ agent: agentSlug(identity), limit: 100, cursor })
        tokens.push(...result.tokens)
        cursor = result.next_cursor
        if (!cursor) break
    }
    return tokens
}

async function ensureAgentTokens(client: EngramindClient, connection: EngramindConnection, actorId: string): Promise<StepResult> {
    let issued = 0
    const ids: Record<string, string> = {}
    for (const identity of MEMORY_IDENTITIES) {
        const stored = connection.agentTokens[identity]
        const storedId = tokenIdOf(stored)
        const tokens = await listAgentTokens(client, identity)
        const current = storedId ? tokens.find((token) => token.id === storedId) : undefined
        const expired = current?.expires_at ? new Date(current.expires_at).getTime() <= Date.now() : false
        if (current && current.status === "active" && !expired && sameScopes(current.scopes)) {
            ids[identity] = current.id
            continue
        }
        const result = await client.tokens.issue({ kind: "agent", agent: agentSlug(identity), scopes: [...AGENT_TOKEN_SCOPES], label: `dndicas ${identity}` })
        if (!result.secret) throw new Error(`O Engramind não devolveu o segredo do token de ${agentSlug(identity)}`)
        await writeEngramindSecrets({ [AGENT_TOKEN_FIELDS[identity]]: result.secret }, actorId)
        ids[identity] = result.token.id
        issued++
        if (current && current.status === "active") {
            await client.tokens.revoke(current.id).catch((error: unknown) => engramindLog.warn({ agent: agentSlug(identity), err: messageOf(error) }, "[engramind] token anterior do agente não revogado"))
        }
        await auditEngramind(actorId, "issue_token", AcaoAuditoria.CRIAR, { agente: agentSlug(identity), token: result.token.id, anterior: current?.id ?? null, escopos: [...AGENT_TOKEN_SCOPES] })
    }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { agentTokenIds: ids } }, { upsert: true }).catch(() => undefined)
    return { status: "ok", message: issued ? `${issued} token(s) emitido(s); ${MEMORY_IDENTITIES.length - issued} em uso` : `${MEMORY_IDENTITIES.length} tokens em uso` }
}

async function ensureWebhook(client: EngramindClient, connection: EngramindConnection, actorId: string): Promise<StepResult> {
    if (!connection.publicAppUrl) return { status: "warn", message: "Sem URL pública do dndicas (nem NEXT_PUBLIC_APP_URL): sem tempo real; o cron reconcilia as campanhas." }
    const url = webhookUrlOf(connection.publicAppUrl)
    const app = await client.apps.get(ENGRAMIND_APP)
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ webhookPending: 1 }).lean()
    if (!state?.webhookPending && app.webhook?.url === url && app.webhook.secret.configured && connection.webhookSecret) return { status: "skipped", message: `Já registrado em ${url}` }
    const secret = randomBytes(48).toString("base64url")
    // Marcador antes de mexer: se o registro remoto ou a gravação local falhar no meio, a próxima execução
    // não pula o passo (o segredo do Engramind e o local podem estar diferentes).
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { webhookPending: true } }, { upsert: true })
    await client.apps.updateWebhook(ENGRAMIND_APP, { url, secret })
    await writeEngramindSecrets({ webhookSecret: secret }, actorId)
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { webhookPending: false } })
    await auditEngramind(actorId, "update_app_webhook", AcaoAuditoria.ATUALIZAR, { url })
    return { status: "ok", message: `Registrado em ${url}` }
}

async function ensureCampaignSide(client: EngramindClient, actorId: string): Promise<StepResult> {
    const outcomes = await ensureCategories(CAMPAIGN_CATEGORY_LIST, client)
    const problems = outcomes.filter((item) => item.status !== "exists" && item.status !== "created")
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { categoryWarnings: problems.map((item) => item.message) } }, { upsert: true })
    const created = outcomes.filter((item) => item.status === "created").length
    const { provisionAllCampaignNetworks } = await import("./campaign-channels")
    const campaigns = await provisionAllCampaignNetworks(actorId)
    const message = `${outcomes.length - problems.length}/${outcomes.length} categorias (${created} criadas); ${campaigns.ok}/${campaigns.total} campanhas com canais`
    if (problems.length || campaigns.failed) return { status: "warn", message: [message, ...problems.map((item) => item.message), ...(campaigns.failed ? [`${campaigns.failed} campanha(s) sem canais: o cron tenta de novo`] : [])].join(" · ") }
    return { status: "ok", message }
}

const running = globalThis as typeof globalThis & { __engramindBootstrap?: Promise<BootstrapDto> | null }

/** Roda a configuração automática (uma por vez; uma chamada concorrente espera a que está rodando). */
export function runBootstrap(actorId: string): Promise<BootstrapDto> {
    if (running.__engramindBootstrap) return running.__engramindBootstrap
    const job = execute(actorId).finally(() => {
        running.__engramindBootstrap = null
    })
    running.__engramindBootstrap = job
    return job
}

async function execute(actorId: string): Promise<BootstrapDto> {
    await dbConnect()
    const connection = await engramindConnection()
    const steps: BootstrapStepRecord[] = BOOTSTRAP_STEPS.map((step) => ({ ...step, status: "pending", message: "", at: new Date() }))
    const save = async (ok: boolean) => {
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { bootstrap: { ranAt: new Date(), ok, steps } } }, { upsert: true })
        await publishEngramind({ type: "bootstrap.updated" })
    }
    if (!connection) {
        steps[0] = { ...steps[0]!, status: "error", message: "Configure a URL base do Engramind e o token do app antes", at: new Date() }
        await save(false)
        return toDto(steps, false)
    }
    const client = clientFor(connection.baseUrl, connection.appToken)
    const work: Record<StepId, () => Promise<StepResult>> = {
        whoami: async () => {
            await assertAppToken(client)
            return { status: "ok", message: `Token de app do app ${ENGRAMIND_APP}` }
        },
        agents: () => ensureAgents(client),
        channels: () => ensureFixedChannels(client),
        subscriptions: () => ensureOtherSubscriptions(client),
        tokens: () => ensureAgentTokens(client, connection, actorId),
        webhook: () => ensureWebhook(client, connection, actorId),
        categories: () => ensureCampaignSide(client, actorId),
    }
    let ok = true
    for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!
        try {
            const result = await work[step.id as StepId]()
            steps[index] = { ...step, ...result, at: new Date() }
            engramindLog.info({ step: step.id, status: result.status }, `[engramind] bootstrap: ${step.label}`)
        } catch (error) {
            ok = false
            const message = engramindCodeOf(error) === "AUTH_INVALID" ? "O Engramind recusou o token do app (ENGRAMIND_AUTH_INVALID): emita outro no Opex e reconfigure a integração." : messageOf(error)
            steps[index] = { ...step, status: "error", message, at: new Date() }
            engramindLog.warn({ step: step.id, err: message }, `[engramind] bootstrap parou em: ${step.label}`)
            await auditEngramind(actorId, `bootstrap.${step.id}`, AcaoAuditoria.EXECUTAR, { status: "error", mensagem: message }).catch(() => undefined)
            break
        }
        await auditEngramind(actorId, `bootstrap.${step.id}`, AcaoAuditoria.EXECUTAR, { status: steps[index]!.status, mensagem: steps[index]!.message })
        await save(false)
    }
    await save(ok && steps.every((step) => step.status !== "error" && step.status !== "pending"))
    return toDto(steps, ok)
}

function toDto(steps: readonly BootstrapStepRecord[], ok: boolean): BootstrapDto {
    return { ok, ranAt: new Date().toISOString(), steps: steps.map((step): BootstrapStepDto => ({ id: step.id, label: step.label, status: step.status, message: step.message, at: new Date(step.at).toISOString() })) }
}
