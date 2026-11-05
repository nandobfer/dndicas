import { createHash, createHmac } from "node:crypto"

/**
 * Engramind falso no nível do HTTP (DND-21): substitui o `fetch` global e responde só as rotas do contrato
 * publicado (`~/code/engramind/docs/openapi.json`, v0.13.0) que o dndicas usa. Rota fora da lista responde
 * `405 METHOD_NOT_ALLOWED`, como o serviço real: rota nova aqui exige conferir método e caminho no
 * contrato antes. Simula o token de app (só o próprio app; não muta memória a memória), os tokens de
 * agente (só os canais assinados), a criação de canal por assinatura exata, `key`/`upsert`, versões,
 * categorias e importação idempotente. Nunca há rede.
 */

export const CONTRACT_ROUTES: readonly (readonly [string, string])[] = [
    ["GET", "/health/ready"],
    ["GET", "/v1/whoami"],
    ["GET", "/v1/consumer-settings"],
    ["GET", "/v1/categories"],
    ["POST", "/v1/categories"],
    ["POST", "/v1/agents"],
    ["GET", "/v1/agents/{agent}"],
    ["PATCH", "/v1/agents/{agent}"],
    ["GET", "/v1/subscriptions"],
    ["POST", "/v1/subscriptions"],
    ["PATCH", "/v1/subscriptions/{subscription}"],
    ["GET", "/v1/channels"],
    ["GET", "/v1/channels/{channel}"],
    ["PATCH", "/v1/channels/{channel}"],
    ["POST", "/v1/channels/{channel}/archive"],
    ["POST", "/v1/channels/{channel}/restore"],
    ["PUT", "/v1/channels/{channel}/settings"],
    ["GET", "/v1/tokens"],
    ["POST", "/v1/tokens"],
    ["POST", "/v1/tokens/{token}/revoke"],
    ["GET", "/v1/apps/{app}"],
    ["PUT", "/v1/apps/{app}/webhook"],
    ["GET", "/v1/context"],
    ["GET", "/v1/memories"],
    ["POST", "/v1/memories"],
    ["POST", "/v1/memories/import"],
    ["POST", "/v1/memories/search"],
    ["GET", "/v1/memories/{memory}"],
    ["PATCH", "/v1/memories/{memory}"],
    ["DELETE", "/v1/memories/{memory}"],
    ["POST", "/v1/memories/{memory}/archive"],
    ["POST", "/v1/memories/{memory}/restore"],
    ["POST", "/v1/memories/{memory}/move"],
]

const PATTERNS = CONTRACT_ROUTES.map(([method, template]) => ({ method, template, pattern: new RegExp(`^${template.replace(/\{[^}]+\}/g, "([^/]+)")}$`) }))

export const FAKE_BASE_URL = "https://engramind.test"
export const FAKE_APP_TOKEN = "eng.tk_a0000001.app-secret-dndicas-0000000000000000"

export interface FakeMemory {
    id: string
    channel: string
    title: string | null
    title_state: "pending" | "ready" | "fallback"
    text: string
    category: string
    status: "active" | "permanent" | "archived"
    version: number
    key: string | null
    tags: string[]
    author: { app: string | null; app_id: string | null; agent: string | null; agent_id: string | null }
    origin: { source: string; label?: string | null } | null
    created_at: string
    updated_at: string
    archived_at: string | null
}

interface FakeToken {
    id: string
    secret: string
    kind: "agent" | "app" | "admin"
    app: string
    agent: string | null
    scopes: string[]
    status: "active" | "expired" | "revoked"
    expires_at: string | null
}

interface FakeSubscription {
    id: string
    agent: string
    target: string
    mode: "inject" | "search" | "manage"
}

export interface FakeEvent {
    id: string
    type: string
    channel: string | null
    memory_ids?: string[]
}

class FakeHttpError extends Error {
    constructor(readonly status: number, readonly code: string, readonly details?: unknown) {
        super(code)
    }
}

const fail = (status: number, code: string, details?: unknown): never => {
    throw new FakeHttpError(status, code, details)
}

export function createFakeEngramind() {
    const state = {
        seq: 0,
        clock: Date.parse("2026-11-05T10:00:00Z"),
        down: false,
        categories: [
            { key: "PROJECT_RULES", label: "Regras", priority: 10 },
            { key: "NAMING", label: "Nomes", priority: 5 },
        ] as { key: string; label: string; priority: number }[],
        categoryLimit: 20,
        textMax: 4000,
        maxBatch: 100,
        budgetTokens: 4000,
        agents: new Map<string, { slug: string; name: string; description: string | null; disabled_at: string | null }>(),
        channels: new Map<string, { slug: string; name: string; description: string | null; archived_at: string | null; created_by: string | null; version: number; settings: Record<string, unknown> }>(),
        subscriptions: [] as FakeSubscription[],
        tokens: new Map<string, FakeToken>(),
        memories: new Map<string, FakeMemory>(),
        apps: new Map<string, { slug: string; webhook: { url: string; secret: string } | null }>([["dndicas", { slug: "dndicas", webhook: null }]]),
        imports: new Map<string, unknown>(),
        events: [] as FakeEvent[],
        calls: [] as { method: string; path: string; token: string | null; body?: unknown; query: Record<string, string> }[],
        /** Aceita `PUT /v1/channels/{channel}/settings` do token de app (versão futura do Engramind). */
        appChannelSettings: false,
    }
    const tick = () => new Date((state.clock += 1000)).toISOString()
    const nextId = (prefix: string) => `${prefix}_${(++state.seq).toString(16).padStart(8, "0")}`
    const emit = (type: string, channel: string | null, memoryIds?: string[]) => state.events.push({ id: nextId("ev"), type, channel, ...(memoryIds ? { memory_ids: memoryIds } : {}) })

    function addToken(input: Omit<FakeToken, "id" | "secret" | "status" | "expires_at"> & { id?: string; secret?: string; status?: FakeToken["status"]; expires_at?: string | null }): FakeToken {
        const id = input.id ?? `tk_${(++state.seq).toString(16).padStart(8, "0")}`
        const token: FakeToken = { status: "active", expires_at: null, ...input, id, secret: input.secret ?? `eng.${id}.${createHash("sha256").update(id).digest("hex").slice(0, 40)}` }
        state.tokens.set(id, token)
        return token
    }
    addToken({ id: "tk_a0000001", secret: FAKE_APP_TOKEN, kind: "app", app: "dndicas", agent: null, scopes: ["read", "write", "delete"] })

    const qualified = (agent: string) => (agent.includes("/") ? agent : `dndicas/${agent}`)
    const targetMatches = (target: string, channel: string) => (target.endsWith("*") ? channel.startsWith(target.slice(0, -1)) : target === channel)

    /** Melhor assinatura do agente no canal (exata vence prefixo; prefixo mais longo vence). */
    function subscriptionOf(agent: string, channel: string): FakeSubscription | null {
        const candidates = state.subscriptions.filter((item) => item.agent === agent && targetMatches(item.target, channel))
        return candidates.sort((a, b) => Number(b.target === channel) - Number(a.target === channel) || b.target.length - a.target.length)[0] ?? null
    }

    function reachOf(token: FakeToken, channel: string): FakeSubscription | null {
        if (token.kind === "admin") return { id: "admin", agent: "admin", target: channel, mode: "inject" }
        if (token.kind === "agent") return subscriptionOf(token.agent!, channel)
        const agents = [...state.agents.values()].filter((agent) => !agent.disabled_at).map((agent) => agent.slug)
        return agents.map((agent) => subscriptionOf(agent, channel)).find(Boolean) ?? null
    }

    function auth(header: string | null): FakeToken {
        const secret = header?.replace(/^Bearer\s+/i, "") ?? ""
        const token = [...state.tokens.values()].find((item) => item.secret === secret)
        if (!token || token.status !== "active") fail(401, "AUTH_INVALID")
        return token!
    }

    const channelOrFail = (slug: string) => state.channels.get(slug) ?? fail(404, "CHANNEL_NOT_FOUND", { channel: slug })
    const memoryOrFail = (id: string) => state.memories.get(id) ?? fail(404, "MEMORY_NOT_FOUND")

    function assertWrite(token: FakeToken, channel: string) {
        if (token.kind === "app") fail(403, "SCOPE_REQUIRED", { required_kind: "agent" })
        if (!reachOf(token, channel)) fail(403, "CHANNEL_NOT_SUBSCRIBED", { channel })
        if (!token.scopes.includes("write")) fail(403, "SCOPE_REQUIRED", { required_scope: "write" })
    }

    function assertRead(token: FakeToken, channel: string) {
        if (!reachOf(token, channel)) fail(403, "CHANNEL_NOT_SUBSCRIBED", { channel })
    }

    function writeMemory(token: FakeToken, input: { channel: string; text: string; category?: string; title?: string; key?: string; upsert?: boolean; status?: string; created_at?: string; origin?: FakeMemory["origin"]; tags?: string[] }, author?: FakeMemory["author"]): { memory: FakeMemory; duplicate: boolean; created: boolean } {
        const channel = channelOrFail(input.channel)
        if (channel.archived_at) fail(409, "CHANNEL_ARCHIVED")
        if (input.text.length > state.textMax) fail(400, "VALIDATION_ERROR", { field: "text" })
        const category = input.category ?? state.categories[0]!.key
        if (!state.categories.some((item) => item.key === category)) fail(400, "CATEGORY_NOT_FOUND", { valid: state.categories.map((item) => item.key) })
        const now = tick()
        if (input.key) {
            const existing = [...state.memories.values()].find((item) => item.channel === input.channel && item.key === input.key)
            if (existing) {
                if (!input.upsert) fail(409, "MEMORY_KEY_EXISTS", { existing_id: existing.id })
                const status = (input.status as FakeMemory["status"]) ?? "active"
                Object.assign(existing, { text: input.text, category, ...(input.title ? { title: input.title, title_state: "ready" } : {}), status, archived_at: status === "archived" ? (existing.archived_at ?? now) : null, version: existing.version + 1, updated_at: now })
                emit("memory.updated", existing.channel, [existing.id])
                return { memory: existing, duplicate: false, created: false }
            }
        } else {
            const duplicate = [...state.memories.values()].find((item) => item.channel === input.channel && item.text.trim().toLowerCase() === input.text.trim().toLowerCase())
            if (duplicate) return { memory: duplicate, duplicate: true, created: false }
        }
        const status = (input.status as FakeMemory["status"]) ?? "active"
        const memory: FakeMemory = {
            id: nextId("m"),
            channel: input.channel,
            title: input.title ?? input.text.split("\n")[0]!.slice(0, 100),
            title_state: input.title ? "ready" : "pending",
            text: input.text,
            category,
            status,
            version: 1,
            key: input.key ?? null,
            tags: input.tags ?? [],
            author: author ?? { app: token.app, app_id: `app_${token.app}`, agent: token.agent, agent_id: token.agent ? `ag_${token.agent}` : null },
            origin: input.origin ?? null,
            created_at: input.created_at ?? now,
            updated_at: now,
            archived_at: status === "archived" ? now : null,
        }
        state.memories.set(memory.id, memory)
        return { memory, duplicate: false, created: true }
    }

    function contextOf(token: FakeToken, channels: string[]) {
        for (const channel of channels) assertRead(token, channel)
        const lines = [...state.memories.values()]
            .filter((memory) => channels.includes(memory.channel) && memory.status !== "archived")
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((memory) => `- [${memory.category}] ${memory.text}`)
        const content = lines.length ? `## Memórias\n${lines.join("\n")}` : ""
        return { content, version: `cv_${createHash("sha256").update(content).digest("hex").slice(0, 12)}`, counts: { full: lines.length, titles: 0, overflow: 0 }, rendered_tokens: Math.ceil(content.length / 4), format: "markdown" }
    }

    const tokenView = (token: FakeToken) => ({ id: token.id, prefix: `eng.${token.id}`, kind: token.kind, scopes: token.scopes, app: { id: `app_${token.app}`, slug: token.app }, agent: token.agent ? { id: `ag_${token.agent}`, slug: token.agent.split("/")[1] } : null, label: null, status: token.status, created_at: "2026-11-01T00:00:00Z", expires_at: token.expires_at, revoked_at: null, last_used_at: null })
    const agentView = (agent: { slug: string; name: string; description: string | null; disabled_at: string | null }) => ({ id: `ag_${agent.slug}`, slug: agent.slug.split("/")[1], qualified_slug: agent.slug, name: agent.name, description: agent.description, app: { id: "app_dndicas", slug: "dndicas" }, created_at: "2026-11-01T00:00:00Z", disabled_at: agent.disabled_at })
    const channelView = (channel: ReturnType<typeof channelOrFail>) => ({ id: `ch_${channel.slug}`, slug: channel.slug, name: channel.name, description: channel.description, priority: 0, version: channel.version, created_at: "2026-11-01T00:00:00Z", archived_at: channel.archived_at, created_by: channel.created_by })
    const subView = (sub: FakeSubscription) => ({ id: sub.id, agent: { id: `ag_${sub.agent}`, slug: sub.agent.split("/")[1], qualified_slug: sub.agent }, target: sub.target, is_prefix: sub.target.endsWith("*"), mode: sub.mode, access: null, priority: null, reaches: [...state.channels.keys()].filter((slug) => targetMatches(sub.target, slug)), created_at: "2026-11-01T00:00:00Z" })

    function handle(method: string, template: string, params: string[], token: FakeToken, query: URLSearchParams, body: Record<string, unknown>, idempotencyKey: string | null): { status: number; body?: unknown } {
        const isApp = token.kind === "app"
        switch (`${method} ${template}`) {
            case "GET /v1/whoami":
                return { status: 200, body: { token_id: token.id, kind: token.kind, scopes: token.scopes, app: { id: `app_${token.app}`, slug: token.app }, agent: token.agent ? { id: `ag_${token.agent}`, slug: token.agent } : null, operations: [] } }
            case "GET /v1/consumer-settings":
                return { status: 200, body: { memory: { text_min: 3, text_max: state.textMax }, limits: { max_batch: state.maxBatch }, context: { budget_tokens: state.budgetTokens, titles_budget_tokens: 800, default_format: "markdown", text_max_chars: 0 }, channels: [], consolidation: { stale_after_days: 90 }, search: { vector_weight: 1, text_weight: 1, rrf_k: 60 } } }
            case "GET /v1/categories":
                return { status: 200, body: { categories: state.categories } }
            case "POST /v1/categories": {
                if (!token.scopes.includes("write")) fail(403, "SCOPE_REQUIRED")
                const key = String(body.key)
                if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(key)) fail(400, "VALIDATION_ERROR", { field: "key" })
                const existing = state.categories.find((item) => item.key === key)
                if (existing) {
                    if (existing.label !== body.label || existing.priority !== (body.priority ?? 0)) fail(409, "CATEGORY_CONFLICT")
                    return { status: 200, body: { ...existing, created: false } }
                }
                if (state.categories.length >= state.categoryLimit) fail(409, "CATEGORY_LIMIT_REACHED")
                const category = { key, label: String(body.label), priority: Number(body.priority ?? 0) }
                state.categories.push(category)
                emit("settings.updated", null)
                return { status: 201, body: { ...category, created: true } }
            }
            case "POST /v1/agents": {
                if (token.kind === "agent") fail(403, "SCOPE_REQUIRED")
                if (isApp && body.app && body.app !== token.app) fail(403, "FOREIGN_APP")
                const slug = `${token.app}/${String(body.slug)}`
                const existing = state.agents.get(slug)
                if (existing) {
                    if (existing.name !== body.name || existing.description !== (body.description ?? null)) fail(409, "SLUG_ALREADY_EXISTS", { existing: agentView(existing) })
                    return { status: 200, body: { ...agentView(existing), created: false } }
                }
                const agent = { slug, name: String(body.name), description: (body.description as string | null) ?? null, disabled_at: null }
                state.agents.set(slug, agent)
                return { status: 201, body: { ...agentView(agent), created: true } }
            }
            case "GET /v1/agents/{agent}":
                return { status: 200, body: agentView(state.agents.get(qualified(params[0]!)) ?? fail(404, "AGENT_NOT_FOUND")) }
            case "PATCH /v1/agents/{agent}": {
                const agent = state.agents.get(qualified(params[0]!)) ?? fail(404, "AGENT_NOT_FOUND")
                if (body.name !== undefined) agent.name = String(body.name)
                if (body.description !== undefined) agent.description = (body.description as string | null) ?? null
                if (body.disabled !== undefined) agent.disabled_at = body.disabled ? tick() : null
                return { status: 200, body: agentView(agent) }
            }
            case "GET /v1/subscriptions": {
                const agent = query.get("agent")
                return { status: 200, body: { subscriptions: state.subscriptions.filter((item) => !agent || item.agent === qualified(agent)).map(subView), next_cursor: null } }
            }
            case "POST /v1/subscriptions": {
                if (token.kind === "agent") fail(403, "SCOPE_REQUIRED")
                const agent = qualified(String(body.agent))
                if (!state.agents.has(agent)) fail(404, "AGENT_NOT_FOUND")
                const target = String(body.target)
                const mode = body.mode as FakeSubscription["mode"]
                const existing = state.subscriptions.find((item) => item.agent === agent && item.target === target)
                if (existing) {
                    if (existing.mode !== mode) fail(409, "SUBSCRIPTION_EXISTS", { existing: subView(existing) })
                    return { status: 200, body: { ...subView(existing), created: false, channel_created: false } }
                }
                let channelCreated = false
                if (!target.endsWith("*") && !state.channels.has(target)) {
                    state.channels.set(target, { slug: target, name: target, description: null, archived_at: null, created_by: isApp ? token.app : null, version: 1, settings: {} })
                    channelCreated = true
                    emit("channel.updated", target)
                }
                const sub = { id: nextId("sub"), agent, target, mode }
                state.subscriptions.push(sub)
                return { status: 201, body: { ...subView(sub), created: true, channel_created: channelCreated } }
            }
            case "PATCH /v1/subscriptions/{subscription}": {
                const sub = state.subscriptions.find((item) => item.id === params[0]) ?? fail(404, "SUBSCRIPTION_NOT_FOUND")
                if (body.mode) sub.mode = body.mode as FakeSubscription["mode"]
                return { status: 200, body: subView(sub) }
            }
            case "GET /v1/channels":
                return { status: 200, body: { channels: [...state.channels.values()].filter((channel) => reachOf(token, channel.slug)).map(channelView), next_cursor: null } }
            case "GET /v1/channels/{channel}":
                return { status: 200, body: channelView(channelOrFail(params[0]!)) }
            case "PATCH /v1/channels/{channel}": {
                const channel = channelOrFail(params[0]!)
                if (isApp && channel.created_by !== token.app) fail(403, "FOREIGN_APP")
                if (body.name !== undefined) channel.name = String(body.name)
                if (body.description !== undefined) channel.description = (body.description as string | null) ?? null
                channel.version++
                return { status: 200, body: channelView(channel) }
            }
            case "POST /v1/channels/{channel}/archive":
            case "POST /v1/channels/{channel}/restore": {
                const channel = channelOrFail(params[0]!)
                if (isApp && channel.created_by !== token.app) fail(403, "FOREIGN_APP")
                channel.archived_at = template.endsWith("archive") ? (channel.archived_at ?? tick()) : null
                emit("channel.updated", channel.slug)
                return { status: 200, body: channelView(channel) }
            }
            case "PUT /v1/channels/{channel}/settings": {
                if (token.kind !== "admin" && !(isApp && state.appChannelSettings)) fail(403, "SCOPE_REQUIRED", { required_kind: "admin" })
                const channel = channelOrFail(params[0]!)
                Object.assign(channel.settings, body)
                return { status: 200, body: { channel: channel.slug, settings: channel.settings } }
            }
            case "GET /v1/tokens": {
                if (token.kind === "agent") fail(403, "SCOPE_REQUIRED")
                const agent = query.get("agent")
                return { status: 200, body: { tokens: [...state.tokens.values()].filter((item) => item.app === token.app && (!agent || item.agent === qualified(agent))).map(tokenView), next_cursor: null } }
            }
            case "POST /v1/tokens": {
                if (token.kind === "agent") fail(403, "SCOPE_REQUIRED")
                if (isApp && body.kind !== "agent") fail(403, "SCOPE_REQUIRED", { required_kind: "admin" })
                const agent = qualified(String(body.agent))
                if (!state.agents.has(agent)) fail(404, "AGENT_NOT_FOUND")
                const issued = addToken({ kind: "agent", app: token.app, agent, scopes: (body.scopes as string[]) ?? ["read"] })
                return { status: 201, body: { token: tokenView(issued), secret: issued.secret } }
            }
            case "POST /v1/tokens/{token}/revoke": {
                const target = state.tokens.get(params[0]!) ?? fail(404, "TOKEN_NOT_FOUND")
                target.status = "revoked"
                return { status: 200, body: tokenView(target) }
            }
            case "GET /v1/apps/{app}": {
                if (isApp && params[0] !== token.app) fail(403, "FOREIGN_APP")
                const app = state.apps.get(params[0]!) ?? fail(404, "APP_NOT_FOUND")
                return { status: 200, body: { id: `app_${app.slug}`, slug: app.slug, name: app.slug, description: null, created_at: "2026-11-01T00:00:00Z", disabled_at: null, webhook: app.webhook ? { url: app.webhook.url, secret: { configured: true, updated_at: "2026-11-05T00:00:00Z" } } : null } }
            }
            case "PUT /v1/apps/{app}/webhook": {
                if (isApp && params[0] !== token.app) fail(403, "FOREIGN_APP")
                const app = state.apps.get(params[0]!) ?? fail(404, "APP_NOT_FOUND")
                app.webhook = body.url ? { url: String(body.url), secret: String(body.secret) } : null
                return { status: 200, body: { slug: app.slug } }
            }
            case "GET /v1/context": {
                const channels = (query.get("channels") ?? "").split(",").filter(Boolean)
                const view = contextOf(token, channels)
                return { status: 200, body: view }
            }
            case "GET /v1/memories": {
                const filters = (query.get("channels") ?? "").split(",").filter(Boolean)
                const statuses = (query.get("status") ?? "active,permanent").split(",")
                const since = query.get("since")
                const key = query.get("key")
                const list = [...state.memories.values()]
                    .filter((memory) => reachOf(token, memory.channel) && (!filters.length || filters.some((target) => targetMatches(target, memory.channel))) && statuses.includes(memory.status) && (!since || memory.updated_at >= since) && (!key || memory.key === key))
                    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                return { status: 200, body: { memories: query.get("fields") === "title" ? list.map(({ id, title, channel, category, status, tags }) => ({ id, title, channel, category, status, tags })) : list, next_cursor: null } }
            }
            case "POST /v1/memories": {
                const channel = String(body.channel)
                assertWrite(token, channel)
                const written = writeMemory(token, body as never)
                if (written.created) emit("memory.created", channel, [written.memory.id])
                return { status: written.created ? 201 : 200, body: { memory: written.memory, duplicate: written.duplicate, created: written.created, similar: [] } }
            }
            case "POST /v1/memories/import": {
                if (!idempotencyKey) fail(400, "IDEMPOTENCY_KEY_REQUIRED")
                const replay = state.imports.get(idempotencyKey!)
                if (replay) return { status: 200, body: replay }
                const channel = String(body.channel)
                if (token.kind === "app" && !reachOf(token, channel)) fail(403, "CHANNEL_NOT_SUBSCRIBED", { channel })
                const items = (body.memories as Record<string, unknown>[]) ?? []
                if (items.length > state.maxBatch) fail(413, "BATCH_TOO_LARGE", { max: state.maxBatch, received: items.length })
                const created: { index: number; id: string }[] = []
                const duplicates: { index: number; existing_id: string }[] = []
                items.forEach((item, index) => {
                    if (item.key) {
                        const existing = [...state.memories.values()].find((memory) => memory.channel === channel && memory.key === item.key)
                        if (existing) return duplicates.push({ index, existing_id: existing.id })
                    }
                    const written = writeMemory(token, { ...(item as never), channel })
                    if (written.duplicate) duplicates.push({ index, existing_id: written.memory.id })
                    else created.push({ index, id: written.memory.id })
                })
                if (created.length) emit("memory.created", channel, created.map((item) => item.id))
                const result = { created, duplicates }
                state.imports.set(idempotencyKey!, result)
                return { status: 200, body: result }
            }
            case "POST /v1/memories/search": {
                const terms = String(body.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
                const channels = (body.channels as string[] | undefined) ?? [...state.channels.keys()]
                for (const channel of channels) assertRead(token, channel)
                const results = [...state.memories.values()]
                    .filter((memory) => channels.includes(memory.channel) && (body.include_archived || memory.status !== "archived") && terms.some((term) => `${memory.title ?? ""} ${memory.text}`.toLowerCase().includes(term)))
                    .slice(0, Number(body.limit ?? 10))
                    .map((memory, rank) => ({ memory, rank: rank + 1, score: 1 / (rank + 1) }))
                return { status: 200, body: { mode: "text", results } }
            }
            case "GET /v1/memories/{memory}": {
                const memory = memoryOrFail(params[0]!)
                assertRead(token, memory.channel)
                return { status: 200, body: memory }
            }
            case "PATCH /v1/memories/{memory}": {
                const memory = memoryOrFail(params[0]!)
                assertWrite(token, memory.channel)
                if (body.expected_version !== undefined && body.expected_version !== memory.version) fail(409, "MEMORY_VERSION_CONFLICT", { current_version: memory.version })
                if (body.category !== undefined && !state.categories.some((item) => item.key === body.category)) fail(400, "CATEGORY_NOT_FOUND")
                Object.assign(memory, {
                    ...(body.text !== undefined ? { text: String(body.text) } : {}),
                    ...(body.category !== undefined ? { category: String(body.category) } : {}),
                    ...(body.title !== undefined ? { title: String(body.title), title_state: "ready" } : {}),
                    version: memory.version + 1,
                    updated_at: tick(),
                })
                emit("memory.updated", memory.channel, [memory.id])
                return { status: 200, body: { memory, duplicate: false, similar: [] } }
            }
            case "DELETE /v1/memories/{memory}": {
                const memory = memoryOrFail(params[0]!)
                assertWrite(token, memory.channel)
                state.memories.delete(memory.id)
                emit("memory.deleted", memory.channel, [memory.id])
                return { status: 204 }
            }
            case "POST /v1/memories/{memory}/archive":
            case "POST /v1/memories/{memory}/restore": {
                const memory = memoryOrFail(params[0]!)
                assertWrite(token, memory.channel)
                const archive = template.endsWith("archive")
                Object.assign(memory, { status: archive ? "archived" : "active", archived_at: archive ? tick() : null, version: memory.version + 1, updated_at: tick() })
                emit(archive ? "memory.archived" : "memory.updated", memory.channel, [memory.id])
                return { status: 200, body: memory }
            }
            case "POST /v1/memories/{memory}/move": {
                const memory = memoryOrFail(params[0]!)
                const to = String(body.channel)
                assertWrite(token, memory.channel)
                assertWrite(token, to)
                channelOrFail(to)
                const from = memory.channel
                Object.assign(memory, { channel: to, version: memory.version + 1, updated_at: tick() })
                emit("memory.updated", from, [memory.id])
                emit("memory.updated", to, [memory.id])
                return { status: 200, body: memory }
            }
        }
        return fail(405, "METHOD_NOT_ALLOWED")
    }

    async function fetchImpl(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
        if (!url.href.startsWith(FAKE_BASE_URL)) throw new TypeError(`fetch fora do Engramind falso: ${url.href}`)
        if (state.down) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
        const method = (init.method ?? "GET").toUpperCase()
        const headers = new Headers(init.headers)
        const rawBody = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
        state.calls.push({ method, path: url.pathname, token: headers.get("authorization"), body: rawBody, query: Object.fromEntries(url.searchParams.entries()) })
        const route = PATTERNS.find((item) => item.method === method && item.pattern.test(url.pathname))
        const json = (status: number, body?: unknown, extra: Record<string, string> = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } })
        if (!route) return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido" } })
        if (route.template === "/health/ready") return json(200, { status: "ready" })
        try {
            const token = auth(headers.get("authorization"))
            const params = (url.pathname.match(route.pattern) ?? []).slice(1).map((value) => decodeURIComponent(value))
            const result = handle(method, route.template, params, token, url.searchParams, rawBody, headers.get("idempotency-key"))
            if (route.template === "/v1/context" && result.body) {
                const version = (result.body as { version: string }).version
                if (headers.get("if-none-match")?.replace(/"/g, "") === version) return new Response(null, { status: 304 })
            }
            return result.status === 204 ? new Response(null, { status: 204 }) : json(result.status, result.body)
        } catch (error) {
            if (error instanceof FakeHttpError) return json(error.status, { error: { code: error.code, message: error.code, details: error.details ?? null } })
            throw error
        }
    }

    return {
        state,
        fetch: fetchImpl as typeof fetch,
        addToken,
        /** Escreve como um usuário do Opex (token admin), gerando os mesmos eventos do serviço. */
        admin() {
            return addToken({ kind: "admin", app: "opex", agent: null, scopes: ["read", "write", "delete"] })
        },
        takeEvents(): FakeEvent[] {
            return state.events.splice(0, state.events.length)
        },
    }
}

export type FakeEngramind = ReturnType<typeof createFakeEngramind>

/** Assinatura do webhook no formato do Engramind (`t=<unix>,v1=<hmac>` de `t + "." + corpo`). */
export function signWebhookBody(body: string, secret: string, at = Math.floor(Date.now() / 1000)): string {
    return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`
}
