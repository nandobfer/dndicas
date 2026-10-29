import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
    action: null as Record<string, unknown> | null,
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    queueFollowUp: vi.fn(),
    recordAudit: vi.fn(),
    execute: vi.fn(),
    loadActor: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: "EXECUTAR", ABORTAR: "ABORTAR" } }))
vi.mock("@/lib/db/models/Opex", () => ({
    OpexPendingAction: {
        create: mocks.create,
        findById: () => ({ lean: async () => mocks.action }),
        findOneAndUpdate: (...args: unknown[]) => ({ lean: async () => mocks.findOneAndUpdate(...args) }),
        findByIdAndUpdate: (...args: unknown[]) => ({ lean: async () => mocks.findByIdAndUpdate(...args) }),
        updateOne: mocks.updateOne,
        find: () => ({ lean: async () => [] }),
    },
    OpexMessage: { findById: () => ({ select: () => ({ lean: async () => null }) }), updateOne: vi.fn() },
}))
vi.mock("@/features/opex-agent/server/sessions", () => ({ loadSession: vi.fn(), opexDb: vi.fn(), publishSessionUpdated: vi.fn() }))
vi.mock("@/features/opex-agent/server/runner", () => ({ queueFollowUp: mocks.queueFollowUp }))
vi.mock("@/features/opex-agent/server/scope", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/opex-agent/server/scope")>()),
    loadActor: mocks.loadActor,
}))

const adminTool = { name: "update_integration", group: "integrations", label: "Gravar integração", risk: "destructive", minRole: "admin", description: "", input: z.object({ id: z.string(), secrets: z.array(z.object({ key: z.string(), value: z.string() })).optional() }), execute: mocks.execute, redact: (input: { id: string; secrets?: { key: string; value: string }[] }) => ({ ...input, secrets: input.secrets?.map((secret) => ({ key: secret.key, value: "••••" })) }) }
vi.mock("@/features/opex-agent/server/tools/registry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/opex-agent/server/tools/registry")>()),
    findOpexTool: (name: string) => (name === adminTool.name ? adminTool : undefined),
}))

import { decideAction, requestConfirmation } from "@/features/opex-agent/server/confirmations"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"

const KEY = Buffer.alloc(32, 4).toString("base64")
const adminScope = { kind: "user" as const, actor: { id: "admin-1", name: "Admin", role: "admin" as const } }
const actionId = new Types.ObjectId().toString()
const pending = (extra: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(actionId),
    sessionId: new Types.ObjectId(),
    messageId: null,
    toolName: "update_integration",
    summary: "Gravar integração smtp",
    status: "pending",
    error: null,
    expiresAt: new Date(Date.now() + 60_000),
    input: { plain: JSON.stringify({ id: "smtp" }) },
    ...extra,
})

describe("confirmações do Agente Opex", () => {
    beforeEach(() => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY)
        mocks.action = pending()
        mocks.create.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc }))
        mocks.findOneAndUpdate.mockImplementation(async () => ({ ...mocks.action, status: "confirmed" }))
        mocks.findByIdAndUpdate.mockImplementation(async (_id: unknown, update: { $set: Record<string, unknown> }) => ({ ...mocks.action, status: "confirmed", ...update.$set }))
        mocks.execute.mockResolvedValue({ ok: true })
        mocks.loadActor.mockResolvedValue(adminScope.actor)
    })

    it("guarda a entrada cifrada quando há chave", async () => {
        await requestConfirmation(new Types.ObjectId().toString(), new Types.ObjectId().toString(), adminTool as unknown as OpexTool, { id: "smtp", secrets: [{ key: "password", value: "segredo" }] }, "call-1")
        const doc = mocks.create.mock.calls[0]![0]
        expect(doc.input.sealed).toBeDefined()
        expect(JSON.stringify(doc.input)).not.toContain("segredo")
    })

    it("sem chave recusa guardar entrada com segredo (fail-closed) e aceita a sem segredo", async () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "")
        const tool = adminTool as unknown as OpexTool
        await expect(requestConfirmation(new Types.ObjectId().toString(), new Types.ObjectId().toString(), tool, { id: "smtp", secrets: [{ key: "password", value: "segredo" }] }, "c")).rejects.toThrow(/INTEGRATIONS_ENCRYPTION_KEY/)
        expect(mocks.create).not.toHaveBeenCalled()
        await requestConfirmation(new Types.ObjectId().toString(), new Types.ObjectId().toString(), tool, { id: "smtp" }, "c")
        expect(mocks.create.mock.calls[0]![0].input).toEqual({ plain: JSON.stringify({ id: "smtp" }) })
    })

    it("confirmar executa a ferramenta, apaga a entrada e devolve o resultado ao agente", async () => {
        const dto = await decideAction(actionId, "confirm", "admin-1", adminScope)
        expect(mocks.execute).toHaveBeenCalledWith({ id: "smtp" }, expect.objectContaining({ actorId: "admin-1" }))
        expect(mocks.findByIdAndUpdate.mock.calls[0]![1].$set).toMatchObject({ input: null })
        expect(dto.status).toBe("confirmed")
        expect(mocks.queueFollowUp.mock.calls[0]![1].text).toMatch(/CONFIRMOU/)
        expect(mocks.recordAudit.mock.calls[0]![0]).toMatchObject({ acao: "EXECUTAR" })
    })

    it("cancelar não executa e apaga a entrada", async () => {
        mocks.findOneAndUpdate.mockImplementation(async () => ({ ...mocks.action, status: "cancelled" }))
        await decideAction(actionId, "cancel", "admin-1", adminScope)
        expect(mocks.execute).not.toHaveBeenCalled()
        expect(mocks.updateOne).toHaveBeenCalledWith({ _id: expect.anything() }, { $set: { input: null } })
        expect(mocks.queueFollowUp.mock.calls[0]![1].text).toMatch(/CANCELOU/)
    })

    it("ação expirada responde 409 sem executar", async () => {
        mocks.action = pending({ expiresAt: new Date(Date.now() - 1000) })
        await expect(decideAction(actionId, "confirm", "admin-1", adminScope)).rejects.toMatchObject({ status: 409, code: "OPEX_ACTION_EXPIRED" })
        expect(mocks.execute).not.toHaveBeenCalled()
    })

    it("segunda decisão perde a trava e responde 409", async () => {
        mocks.findOneAndUpdate.mockResolvedValue(null)
        await expect(decideAction(actionId, "confirm", "admin-1", adminScope)).rejects.toMatchObject({ status: 409, code: "OPEX_ACTION_DECIDED" })
        expect(mocks.execute).not.toHaveBeenCalled()
    })

    it("revalida o papel: rebaixado depois do card, a execução falha sem rodar a ferramenta", async () => {
        mocks.loadActor.mockResolvedValue({ ...adminScope.actor, role: "user" })
        mocks.findByIdAndUpdate.mockImplementation(async (_id: unknown, update: { $set: Record<string, unknown> }) => ({ ...mocks.action, ...update.$set }))
        const dto = await decideAction(actionId, "confirm", "admin-1", adminScope)
        expect(mocks.execute).not.toHaveBeenCalled()
        expect(dto.status).toBe("failed")
    })

    it("id inválido responde 404", async () => {
        await expect(decideAction("x", "confirm", "admin-1", adminScope)).rejects.toMatchObject({ status: 404 })
    })
})
