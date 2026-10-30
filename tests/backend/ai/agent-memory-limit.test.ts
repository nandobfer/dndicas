import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

type Row = { _id: Types.ObjectId; agentId: string; texto: string; resumo: string; createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date }
const rows: Row[] = []
const limitCalls: number[] = []
const countDocuments = vi.fn(async () => rows.length)

const query = (filter: { agentId: string | { $in: string[] } }) => {
    const wanted = typeof filter.agentId === "string" ? [filter.agentId] : filter.agentId.$in
    let result = rows.filter((row) => wanted.includes(row.agentId))
    const chain = {
        sort: () => chain,
        select: () => chain,
        limit: (n: number) => {
            limitCalls.push(n)
            result = result.slice(0, n)
            return chain
        },
        lean: async () => result,
    }
    return chain
}

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/users/models/user", () => ({ User: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock("@/features/ai/server/memory-summary", () => ({ formatMemory: vi.fn(async (texto: string) => ({ texto, resumo: texto.slice(0, 20), formatadaPorIa: false })) }))
vi.mock("@/lib/db/models/AgentMemory", () => ({
    AgentMemory: {
        find: query,
        countDocuments,
        create: async (doc: Omit<Row, "_id">) => {
            const row = { _id: new Types.ObjectId(), ...doc }
            rows.push(row)
            return { toObject: () => row }
        },
    },
}))

const { agentMemoryTexts, createAgentMemory, listAgentMemories } = await import("@/features/ai/server/agent-memory-service")

function seed(agentId: string, total: number) {
    const now = Date.now()
    for (let i = 0; i < total; i++) rows.push({ _id: new Types.ObjectId(), agentId, texto: `Memória ${i + 1}`, resumo: "", createdBy: "a", updatedBy: "a", createdAt: new Date(now + i), updatedAt: new Date(now + i) })
}

describe("memórias dos agentes sem limite de quantidade", () => {
    beforeEach(() => {
        rows.length = 0
        limitCalls.length = 0
        countDocuments.mockClear()
    })

    it.each(["maddox", "opex-global", "image-generator"])("lista %s aceita a 51ª memória (antes era 409)", async (agentId) => {
        seed(agentId, 50)
        const result = await createAgentMemory(agentId, "Mais uma instrução permanente", "admin-1")
        expect(result.memoria.texto).toBe("Mais uma instrução permanente")
        expect(rows.filter((row) => row.agentId === agentId)).toHaveLength(51)
        expect(countDocuments).not.toHaveBeenCalled()
    })

    it("lista e injeta no prompt todas as memórias, sem corte", async () => {
        seed("maddox", 75)
        seed("opex-global", 60)
        expect(await listAgentMemories("maddox")).toHaveLength(75)
        expect(limitCalls).toEqual([])
        const texts = await agentMemoryTexts(["opex-global", "maddox"])
        expect(texts).toHaveLength(135)
        expect(texts[0]).toBe("Memória 1")
        expect(texts[60]).toBe("Memória 1")
    })
})
