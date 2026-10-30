import { describe, expect, it } from "vitest"
import {
    DEFAULT_CRON_JOBS,
    MADDOX_SESSIONS_CLEANUP_JOB_ID,
    HEALTH_CHECK_JOB_ID,
    INTEGRATION_IDS,
    INTEGRATIONS,
    OPEX_FILES_CLEANUP_JOB_ID,
    UMAMI_DEFAULT_WEBSITE_ID,
    getIntegrationDef,
    integrationPath,
    isIntegrationInDevelopment,
} from "@/lib/integrations/catalog"

describe("catálogo das integrações do DnDicas", () => {
    it("tem uma definição por id, sem repetição, e só os ids do DnDicas", () => {
        expect(INTEGRATIONS.map((def) => def.id)).toEqual([...INTEGRATION_IDS])
        expect(new Set(INTEGRATION_IDS).size).toBe(INTEGRATION_IDS.length)
        expect(INTEGRATION_IDS).toEqual(
            expect.arrayContaining(["google_auth", "pusher", "internal_api", "crons", "ai", "smtp", "storage_s3", "analytics_umami", "translation"]),
        )
        for (const removed of ["github", "orcamentos", "builder_machine"]) expect(INTEGRATION_IDS).not.toContain(removed)
    })

    it("oferece a integração Tarefas Opex configurável sem variáveis legadas", () => {
        expect(isIntegrationInDevelopment("opex")).toBe(false)
        expect(isIntegrationInDevelopment("pusher")).toBe(false)
        const def = getIntegrationDef("opex")
        expect(def.name).toBe("Tarefas Opex")
        expect(def.secretFields).toEqual(expect.arrayContaining([expect.objectContaining({ key: "clientToken", required: true })]))
        expect([...def.publicFields, ...def.secretFields].flatMap((field) => field.env ?? [])).toEqual([])
    })

    it("a integração Perfix é interna, sem campos e com página própria", () => {
        const perfix = getIntegrationDef("perfix")
        expect(perfix.name).toBe("Perfix")
        expect(perfix.publicFields).toEqual([])
        expect(perfix.secretFields).toEqual([])
        expect(integrationPath("perfix")).toBe("/integracoes/perfix")
    })

    it("os provedores de IA ficam dentro do hub e têm a página própria", () => {
        for (const id of ["ai_opencode", "ai_gemini", "ai_anthropic", "ai_openai", "ai_deepseek", "ai_jev"] as const) {
            expect(getIntegrationDef(id).parent).toBe("ai")
        }
        expect(integrationPath("ai_gemini")).toBe("/integracoes/ia/gemini")
        expect(integrationPath("pusher")).toBe("/integracoes/pusher")
    })

    it("só as integrações que viviam no .env declaram variáveis legadas para a migração", () => {
        const envOf = (id: (typeof INTEGRATION_IDS)[number]) => {
            const def = getIntegrationDef(id)
            return [...def.publicFields, ...def.secretFields].flatMap((field) => field.env ?? [])
        }
        expect(envOf("google_auth")).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
        expect(envOf("ai_gemini")).toEqual(["GOOGLE_API_KEY"])
        expect(envOf("ai_anthropic")).toEqual([])
        expect(envOf("analytics_umami")).toEqual([])
        expect(envOf("storage_s3")).toEqual(expect.arrayContaining(["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"]))
        expect(envOf("smtp")).toEqual(expect.arrayContaining(["SMTP_HOST", "SMTP_PASS"]))
    })

    it("o Umami nasce com o script e o website que estavam fixos no layout", () => {
        const umami = getIntegrationDef("analytics_umami")
        expect(umami.publicFields.find((field) => field.key === "websiteId")?.defaultValue).toBe(UMAMI_DEFAULT_WEBSITE_ID)
        expect(umami.publicFields.find((field) => field.key === "active")?.defaultValue).toBe(true)
    })

    it("as rotinas padrão são a verificação de status (5 min), a limpeza do Agente Opex e a das sessões do Maddox (60 min)", () => {
        expect(DEFAULT_CRON_JOBS.map((job) => [job.id, job.schedule])).toEqual([
            [HEALTH_CHECK_JOB_ID, { type: "interval", minutes: 5 }],
            [OPEX_FILES_CLEANUP_JOB_ID, { type: "interval", minutes: 60 }],
            [MADDOX_SESSIONS_CLEANUP_JOB_ID, { type: "interval", minutes: 60 }],
        ])
    })
})
