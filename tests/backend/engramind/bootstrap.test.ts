import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import { FAKE_APP_TOKEN } from "../../helpers/fake-engramind"

const recordAudit = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/audit/record", () => ({ recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { engramindConnection } = await import("@/features/engramind/server/client")
const { FIXED_CHANNELS, MEMORY_IDENTITIES, campaignChannels } = await import("@/features/engramind/constants")
const { MaddoxCampaignModel } = await import("@/features/maddox/models")

let mongo: MongoMemoryServer | undefined

beforeAll(async () => {
    mongo = await startDb("engramind_bootstrap_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
})

describe("configuração automática do Engramind", () => {
    it("cria os 5 agentes, os 7 canais, as assinaturas, os tokens, o webhook e as categorias; repetir não duplica", async () => {
        const fake = await configureEngramind()
        const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" })
        const first = await runBootstrap("admin-1")
        expect(first.ok).toBe(true)
        expect(first.steps.map((step) => step.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "ok"])

        expect([...fake.state.agents.keys()].sort()).toEqual(MEMORY_IDENTITIES.map((id) => `dndicas/${id}`).sort())
        for (const channel of FIXED_CHANNELS) expect(fake.state.channels.get(channel.slug)).toMatchObject({ name: channel.name, created_by: "dndicas" })
        const subs = fake.state.subscriptions.map((sub) => `${sub.agent}|${sub.target}|${sub.mode}`)
        expect(subs).toEqual(expect.arrayContaining(["dndicas/opex|dndicas/opex/*|inject", "dndicas/opex|dndicas/maddox|manage", "dndicas/opex|dndicas/image-generator|manage", "dndicas/maddox|dndicas/maddox/campanhas/*|search", "dndicas/maddox|dndicas/maddox|inject"]))
        for (const slug of campaignChannels(String(campaign._id))) expect(fake.state.channels.get(slug)?.name).toMatch(/^Brumas · /)
        expect(fake.state.categories.map((item) => item.key)).toEqual(expect.arrayContaining(["FATO", "EVENTO", "LOCAL", "MISSAO", "RELACAO", "OUTRO"]))
        expect(fake.state.apps.get("dndicas")?.webhook?.url).toBe("https://dndicas.test/api/engramind/webhook")

        const connection = await engramindConnection()
        expect(Object.keys(connection!.agentTokens).sort()).toEqual([...MEMORY_IDENTITIES].sort())
        expect(connection!.webhookSecret).toBe(fake.state.apps.get("dndicas")!.webhook!.secret)
        const agentTokens = [...fake.state.tokens.values()].filter((token) => token.kind === "agent")
        expect(agentTokens).toHaveLength(5)
        expect(agentTokens.every((token) => token.scopes.join(",") === "read,write,delete")).toBe(true)

        const counts = { agents: fake.state.agents.size, channels: fake.state.channels.size, subs: fake.state.subscriptions.length, tokens: fake.state.tokens.size, categories: fake.state.categories.length }
        const second = await runBootstrap("admin-1")
        expect(second.ok).toBe(true)
        expect(second.steps.find((step) => step.id === "webhook")?.status).toBe("skipped")
        expect({ agents: fake.state.agents.size, channels: fake.state.channels.size, subs: fake.state.subscriptions.length, tokens: fake.state.tokens.size, categories: fake.state.categories.length }).toEqual(counts)

        // Nenhum segredo vai para a auditoria.
        const audited = JSON.stringify(recordAudit.mock.calls)
        expect(audited).not.toContain(FAKE_APP_TOKEN)
        for (const token of agentTokens) expect(audited).not.toContain(token.secret)
        expect(audited).not.toContain(fake.state.apps.get("dndicas")!.webhook!.secret)
    })

    it("reativa agente desativado, restaura canal arquivado e reemite token revogado (revogando o anterior)", async () => {
        const fake = await configureEngramind()
        await runBootstrap("admin-1")
        fake.state.agents.get("dndicas/maddox")!.disabled_at = "2026-11-05T00:00:00Z"
        fake.state.channels.get("dndicas/entity-import")!.archived_at = "2026-11-05T00:00:00Z"
        const before = (await engramindConnection())!.agentTokens["image-generator"]!
        const beforeId = before.split(".")[1]!
        fake.state.tokens.get(beforeId)!.status = "revoked"
        const opexBefore = (await engramindConnection())!.agentTokens.opex!.split(".")[1]!
        fake.state.tokens.get(opexBefore)!.scopes = ["read"]

        const result = await runBootstrap("admin-1")
        expect(result.ok).toBe(true)
        expect(fake.state.agents.get("dndicas/maddox")!.disabled_at).toBeNull()
        expect(fake.state.channels.get("dndicas/entity-import")!.archived_at).toBeNull()
        const after = (await engramindConnection())!.agentTokens
        expect(after["image-generator"]).not.toBe(before)
        expect(after.opex!.split(".")[1]).not.toBe(opexBefore)
        expect(fake.state.tokens.get(opexBefore)!.status).toBe("revoked")
    })

    it("recusa token admin ou de agente com mensagem clara e não cria nada", async () => {
        const fake = await configureEngramind()
        const admin = fake.admin()
        await configureEngramind({ fake, appToken: admin.secret })
        const result = await runBootstrap("admin-1")
        expect(result.ok).toBe(false)
        expect(result.steps[0]).toMatchObject({ status: "error", message: expect.stringContaining("kind: app") })
        expect(result.steps.slice(1).every((step) => step.status === "pending")).toBe(true)
        expect(fake.state.agents.size).toBe(0)
    })

    it("token do app revogado → ENGRAMIND_AUTH_INVALID com aviso para reconfigurar", async () => {
        const fake = await configureEngramind()
        fake.state.tokens.get("tk_a0000001")!.status = "revoked"
        const result = await runBootstrap("admin-1")
        expect(result.steps[0]).toMatchObject({ status: "error", message: expect.stringMatching(/ENGRAMIND_AUTH_INVALID.*reconfigure/) })
    })

    it("o Engramind cai no meio: os passos anteriores ficam e repetir continua", async () => {
        const fake = await configureEngramind()
        const original = fake.fetch
        let calls = 0
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.includes("/v1/tokens") && calls++ === 0) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
            return original(input as string, init)
        }) as typeof fetch)
        const failed = await runBootstrap("admin-1")
        expect(failed.ok).toBe(false)
        expect(failed.steps.map((step) => step.status)).toEqual(["ok", "ok", "ok", "ok", "error", "pending", "pending"])
        expect(fake.state.agents.size).toBe(5)
        const retried = await runBootstrap("admin-1")
        expect(retried.ok).toBe(true)
        expect(fake.state.agents.size).toBe(5)
    })

    it("categoria em conflito ou lista cheia vira aviso (amarelo), sem falhar", async () => {
        const fake = await configureEngramind()
        fake.state.categories.push({ key: "LOCAL", label: "Lugar", priority: 3 })
        fake.state.categoryLimit = 4
        const result = await runBootstrap("admin-1")
        expect(result.ok).toBe(true)
        const step = result.steps.find((item) => item.id === "categories")!
        expect(step.status).toBe("warn")
        expect(step.message).toMatch(/cheia/)
    })

    it("sem URL pública (nem NEXT_PUBLIC_APP_URL) o webhook fica pendente com aviso", async () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
        const fake = await configureEngramind({ publicAppUrl: null })
        const result = await runBootstrap("admin-1")
        expect(result.steps.find((item) => item.id === "webhook")).toMatchObject({ status: "warn", message: expect.stringContaining("sem tempo real") })
        expect(fake.state.apps.get("dndicas")!.webhook).toBeNull()
    })
})
