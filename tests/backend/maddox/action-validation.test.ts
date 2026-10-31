import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

const jev = { on: false }
const askJevSystemOne = vi.fn<(input: unknown) => Promise<{ answers: { valid: { type: string; noul: number } } }>>(async () => ({ answers: { valid: { type: "noul", noul: 0.1 } } }))
const generateAiText = vi.fn<(input: Record<string, unknown>) => Promise<{ text: string; usage: null; durationMs: number }>>(async () => ({ text: '{"valid": false, "reason": "Lyra não conhece magia; ela pode tentar o arco."}', usage: null, durationMs: 1 }))

vi.mock("@/features/maddox/server/settings", () => ({ loadMaddoxSettings: vi.fn(async () => ({ settings: { jev: { "free-action-validity": jev.on } } })) }))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne }))
vi.mock("@/lib/ai/stream", () => ({ generateAiText }))
vi.mock("@/features/maddox/server/narrator", () => ({ loadNarrator: vi.fn(async () => ({ model: { provider: "gemini", model: "g", agent: null, variant: null } })) }))

const { validateDeclaration } = await import("@/features/maddox/server/action-validation")

const input = {
    campaign: { _id: new Types.ObjectId(), name: "Brumas", rigor: "fiel-dnd" as const, setting: "Reinos.", state: { scene: "", location: "", situation: "Emboscada.", pendingDecision: "", updatedTurn: null, updatedAt: null } },
    character: { name: "Lyra", profile: { capacidades: "Arqueira, sem magia." }, currentState: "" },
    content: "Lanço uma bola de fogo.",
}

beforeEach(() => {
    jev.on = false
    askJevSystemOne.mockClear()
    generateAiText.mockClear()
})

describe("validação da ação livre ao declarar", () => {
    it("sem o JEV: o narrador decide e o motivo dele volta ao jogador", async () => {
        expect(await validateDeclaration(input)).toEqual({ valid: false, reason: "Lyra não conhece magia; ela pode tentar o arco." })
        const request = generateAiText.mock.calls[0]![0]
        expect(String(request.instructions)).toContain("Arqueira, sem magia.")
        expect(String(request.prompt)).toContain("Lanço uma bola de fogo.")
        expect(request).toMatchObject({ consumption: { origin: "maddox-validation" } })
        expect(askJevSystemOne).not.toHaveBeenCalled()
    })

    it("ação válida passa", async () => {
        generateAiText.mockResolvedValueOnce({ text: '```json\n{"valid": true}\n```', usage: null, durationMs: 1 })
        expect(await validateDeclaration(input)).toEqual({ valid: true, reason: "" })
    })

    it('com a chave JEV "Validade de ação livre": o JEV decide, com motivo padrão em pt-BR', async () => {
        jev.on = true
        const verdict = await validateDeclaration(input)
        expect(verdict.valid).toBe(false)
        expect(verdict.reason).toContain("Lyra")
        expect(verdict.reason).toContain("Fiel ao D&D")
        expect(generateAiText).not.toHaveBeenCalled()
        askJevSystemOne.mockResolvedValueOnce({ answers: { valid: { type: "noul", noul: 0.9 } } })
        expect((await validateDeclaration(input)).valid).toBe(true)
    })

    it("falha do validador (JSON inválido, provedor fora) aceita a declaração", async () => {
        generateAiText.mockResolvedValueOnce({ text: "não sei", usage: null, durationMs: 1 })
        expect(await validateDeclaration(input)).toEqual({ valid: true, reason: "" })
        generateAiText.mockRejectedValueOnce(new Error("fora do ar"))
        expect(await validateDeclaration(input)).toEqual({ valid: true, reason: "" })
    })
})
