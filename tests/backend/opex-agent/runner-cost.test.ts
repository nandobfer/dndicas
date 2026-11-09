import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

/**
 * Turno do Agente Opex com o custo informado pelo provedor (OpenCode Go): o `finish-step` de cada passo traz o custo,
 * o runner soma e grava no consumo, e a chave de conversa da sessão chega ao `prepareModel` (x-opencode-session).
 */

const mocks = vi.hoisted(() => ({
    prepareModel: vi.fn(),
    streamText: vi.fn(),
    recordAiConsumption: vi.fn(async () => undefined),
    findOneAndUpdate: vi.fn(),
    messageCreate: vi.fn(),
}))

vi.mock("ai", () => ({ streamText: mocks.streamText, isLoopFinished: () => () => false }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: mocks.prepareModel,
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: mocks.recordAiConsumption }))
vi.mock("@/lib/db/models/Opex", () => ({
    OpexSession: { findOneAndUpdate: (...args: unknown[]) => ({ lean: async () => mocks.findOneAndUpdate(...args) }), updateOne: vi.fn(async () => undefined) },
    OpexMessage: {
        create: mocks.messageCreate,
        find: () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) }),
    },
}))
vi.mock("@/features/opex-agent/server/sessions", () => ({
    opexDb: vi.fn(async () => undefined),
    loadSession: vi.fn(async () => ({ summary: "" })),
    loadSessionRaw: vi.fn(),
    publishSessionUpdated: vi.fn(async () => undefined),
    toMessageDto: (doc: { _id: Types.ObjectId }) => ({ id: String(doc._id) }),
    anonymousExpiry: vi.fn(),
}))
vi.mock("@/features/opex-agent/server/settings", () => ({
    loadOpexSettings: vi.fn(async () => ({
        settings: {
            instructions: "",
            disabledTools: [],
            confirmationOverrides: {},
            files: {},
            anonymous: { enabled: false },
            main: { provider: "opencode-go", model: "deepseek-v4.1-flash", variant: null, temperature: null, maxOutputTokens: null },
        },
    })),
    opexAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/opex-agent/server/files", () => ({ claimOpexFiles: vi.fn(async () => []), fileMarkers: () => [], resolveFileMarkers: async (messages: unknown) => messages }))
vi.mock("@/features/opex-agent/server/titler", () => ({ refreshSessionTitle: vi.fn(async () => undefined) }))
vi.mock("@/features/opex-agent/server/confirmations", () => ({ refreshConfirmations: async (parts: unknown) => parts, requestConfirmation: vi.fn() }))
vi.mock("@/features/opex-agent/server/tool-runtime", () => ({
    buildToolRuntime: () => ({ tools: {}, confirmations: new Map(), durations: new Map() }),
    stringifyForDisplay: String,
}))
vi.mock("@/features/opex-agent/server/tools/registry", () => ({ enabledOpexTools: () => [], findOpexTool: () => undefined, toolPermittedFor: () => true }))
vi.mock("@/features/opex-agent/server/scope", () => ({
    actorIdOf: () => "admin-1",
    actorNameOf: () => "Admin",
    roleOf: () => "admin",
    loadActor: vi.fn(),
    sessionScopeOf: vi.fn(),
    userOpexScope: (actor: unknown) => ({ kind: "user", actor }),
}))
vi.mock("@/features/opex-agent/server/rate-limit", () => ({ assertAnonymousTurnAllowed: vi.fn() }))
vi.mock("@/features/opex-agent/app-docs", () => ({ appDocsInstructions: () => "" }))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))

import { sendMessage } from "@/features/opex-agent/server/runner"

const scope = { kind: "user" as const, actor: { id: "admin-1", name: "Admin", role: "admin" as const } }

describe("Agente Opex — custo do OpenCode Go no consumo", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.prepareModel.mockResolvedValue({ model: {}, dispose: async () => undefined })
        mocks.findOneAndUpdate.mockResolvedValue({ nextSeq: 1, status: "idle", lastError: null })
        mocks.messageCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, toObject: () => doc }))
        mocks.streamText.mockReturnValue({
            fullStream: (async function* () {
                yield { type: "text-delta", text: "Olá" }
                yield { type: "finish-step", providerMetadata: { "opencode-go": { cost: 0, allowance: 0.002, costUsd: 0.002 } } }
                yield { type: "finish-step", providerMetadata: { "opencode-go": { cost: 0.001, allowance: 0.002, costUsd: 0.003 } } }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
            })(),
            responseMessages: Promise.resolve([]),
        })
    })

    it("soma o custo dos passos no registro de consumo e usa a chave de conversa da sessão", async () => {
        const sessionId = new Types.ObjectId().toString()

        await sendMessage(sessionId, { text: "oi" }, "admin-1", scope)
        await vi.waitFor(() => expect(mocks.recordAiConsumption).toHaveBeenCalledTimes(1))

        expect(mocks.prepareModel).toHaveBeenCalledWith(expect.objectContaining({ provider: "opencode-go", model: "deepseek-v4.1-flash", sessionKey: `opex:${sessionId}` }))
        const record = (mocks.recordAiConsumption.mock.calls[0] as unknown as [{ costUsd: number }])[0]
        expect(record).toMatchObject({ provider: "opencode-go", origin: "opex-agent", subject: sessionId, totalTokens: 15 })
        expect(record.costUsd).toBeCloseTo(0.005, 10)
    })

    it("sem custo informado pelo provedor, o consumo fica sem custo (null, nunca 0)", async () => {
        mocks.streamText.mockReturnValue({
            fullStream: (async function* () {
                yield { type: "finish-step", providerMetadata: undefined }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
            })(),
            responseMessages: Promise.resolve([]),
        })

        await sendMessage(new Types.ObjectId().toString(), { text: "oi" }, "admin-1", scope)
        await vi.waitFor(() => expect(mocks.recordAiConsumption).toHaveBeenCalledTimes(1))

        expect(mocks.recordAiConsumption).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null }))
    })
})
