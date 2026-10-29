import { beforeEach, describe, expect, it, vi } from "vitest"
import type { StoredIntegration } from "@/lib/integrations/store"

const mocks = vi.hoisted(() => ({
    stored: null as unknown,
    updateOne: vi.fn(),
    save: vi.fn(),
    recordAudit: vi.fn(),
    invalidate: vi.fn(),
    rescheduleJobs: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(),
    recordAudit: mocks.recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR" },
    createAuditContext: vi.fn(() => ({})),
}))
vi.mock("@/lib/db/models/Integration", () => ({
    Integration: Object.assign(
        vi.fn(function () {
            return { set: vi.fn(), save: mocks.save }
        }),
        { updateOne: mocks.updateOne },
    ),
}))
vi.mock("@/lib/db/models/IntegrationStatus", () => ({ IntegrationStatus: { findOne: () => ({ lean: async () => null }) } }))
vi.mock("@/lib/db/models/CronJobState", () => ({ CronJobState: { find: () => ({ lean: async () => [] }) } }))
vi.mock("@/lib/db/models/IntegrationLog", () => ({ IntegrationLog: {} }))
vi.mock("@/lib/integrations/store", () => ({ loadStoredIntegration: vi.fn(async () => mocks.stored), invalidateStoredIntegrations: mocks.invalidate }))
vi.mock("@/features/integrations/services/enable-hooks", () => ({ runIntegrationEnableHook: vi.fn() }))
vi.mock("@/features/integrations/scheduler/cron-scheduler", () => ({ rescheduleJobs: mocks.rescheduleJobs }))

import { IntegrationUpdateError, updateIntegration } from "@/features/integrations/services/integration-service"
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox"

const KEY = Buffer.alloc(32, 5).toString("base64")
const smtpStored = (values: Partial<StoredIntegration> = {}): StoredIntegration => ({
    integrationId: "smtp",
    environment: "interno",
    debugMode: false,
    publicValues: { host: "smtp.antigo" },
    secretValues: {},
    ...values,
})

describe("gravação de uma integração (PATCH)", () => {
    beforeEach(() => {
        mocks.stored = smtpStored()
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY)
        vi.stubEnv("SMTP_PASS", "")
    })

    it("criptografa o segredo novo e audita só o fato, nunca o valor", async () => {
        await updateIntegration("smtp", { secrets: { password: { action: "set", value: "senha-forte" } } }, "admin-1")
        const [filter, update] = mocks.updateOne.mock.calls[0]!
        expect(filter).toEqual({ integrationId: "smtp" })
        const box = update.$set["secretValues.password"]
        expect(JSON.stringify(box)).not.toContain("senha-forte")
        expect(decryptSecret(box)).toBe("senha-forte")
        const audit = mocks.recordAudit.mock.calls[0]![0]
        expect(audit).toMatchObject({ userId: "admin-1", entidade: "Integracao", entidadeId: "smtp", acao: "ATUALIZAR", depois: { password: "(alterado)" } })
        expect(JSON.stringify(audit)).not.toContain("senha-forte")
        expect(mocks.invalidate).toHaveBeenCalled()
    })

    it("limpar grava null (não volta a ler o .env) e segredo ausente fica como está", async () => {
        mocks.stored = smtpStored({ secretValues: { password: encryptSecret("velha") } })
        await updateIntegration("smtp", { secrets: { password: { action: "clear" } } }, "admin-1")
        expect(mocks.updateOne.mock.calls[0]![1].$set).toEqual({ "secretValues.password": null })
        expect(mocks.recordAudit.mock.calls[0]![0]).toMatchObject({ antes: { password: "(configurado)" }, depois: { password: "(removido)" } })

        mocks.updateOne.mockClear()
        await updateIntegration("smtp", { publicValues: { host: "smtp.novo" } }, "admin-1")
        const $set = mocks.updateOne.mock.calls[0]![1].$set
        expect($set).toEqual({ "publicValues.host": "smtp.novo" })
    })

    it("sem INTEGRATIONS_ENCRYPTION_KEY recusa gravar segredo (409) e não grava nada", async () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "")
        const error = await updateIntegration("smtp", { secrets: { password: { action: "set", value: "x" } } }, "admin-1").catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(IntegrationUpdateError)
        expect((error as IntegrationUpdateError).status).toBe(409)
        expect(mocks.updateOne).not.toHaveBeenCalled()
        expect(mocks.recordAudit).not.toHaveBeenCalled()
    })

    it("sem mudanças não grava nem audita", async () => {
        await updateIntegration("smtp", { publicValues: { host: "smtp.antigo" } }, "admin-1")
        expect(mocks.updateOne).not.toHaveBeenCalled()
        expect(mocks.recordAudit).not.toHaveBeenCalled()
    })

    it("primeiro salvamento cria o documento e audita como criação", async () => {
        mocks.stored = null
        await updateIntegration("smtp", { publicValues: { host: "smtp.primeiro" } }, "admin-1")
        expect(mocks.save).toHaveBeenCalled()
        expect(mocks.recordAudit.mock.calls[0]![0].acao).toBe("CRIAR")
    })
})
