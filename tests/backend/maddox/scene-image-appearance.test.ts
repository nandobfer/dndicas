import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CampaignMemoryView } from "@/features/engramind/campaign-memory-format"

const search = { results: [] as CampaignMemoryView[], fail: false, hang: false }
const searchCampaignMemories = vi.fn(async (campaignId: string, input: { query: string; scope: string; reader: string; limit: number }) => {
    void campaignId
    void input
    if (search.hang) return new Promise<never>(() => undefined)
    if (search.fail) throw new Error("rede fora")
    return search.results
})

vi.mock("@/features/engramind/server/campaign-memories", () => ({ searchCampaignMemories }))
vi.mock("@/features/maddox/constants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/maddox/constants")>()),
    MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_TIMEOUT_MS: 50,
}))

const { appearanceBlock, appearanceMemoriesFor, appearanceRecap, characterAppearance, isAppearanceMemory, sheetText } = await import("@/features/maddox/server/scene-image-appearance")

const memory = (title: string, text: string, extra: Partial<CampaignMemoryView> = {}): CampaignMemoryView => ({
    id: `m_${title}`,
    campaignId: "c1",
    visibility: "players",
    kind: "fato",
    title,
    text,
    tags: [],
    status: null,
    turnNumber: null,
    archived: false,
    createdAt: "",
    updatedAt: "",
    ...extra,
})

beforeEach(() => {
    Object.assign(search, { results: [], fail: false, hang: false })
    vi.clearAllMocks()
})

describe("isAppearanceMemory", () => {
    it("cita o personagem (palavra inteira, sem acento e sem caixa) e fala da aparência", () => {
        expect(isAppearanceMemory(memory("Novo visual", "LYRA tingiu o cabelo de prata."), "Lyra")).toBe(true)
        expect(isAppearanceMemory(memory("Marca", "Uma cicatriz nova no rosto."), "Lyra")).toBe(false)
        expect(isAppearanceMemory(memory("Marca", "Uma cicatriz nova no rosto.", { tags: ["lyra"] }), "Lyra")).toBe(true)
        expect(isAppearanceMemory(memory("Herói", "Lyra salvou o ferreiro."), "Lyra")).toBe(false)
        expect(isAppearanceMemory(memory("Outra", "Lyrana tem cabelo azul."), "Lyra")).toBe(false)
        expect(isAppearanceMemory(memory("Élfica", "Ana Clara usa um manto rubro."), "Ana Clara")).toBe(true)
    })

    it("anotação do mestre ou arquivada não conta", () => {
        expect(isAppearanceMemory(memory("Disfarce", "Lyra usa peruca de cabelo preto.", { visibility: "master" }), "Lyra")).toBe(false)
        expect(isAppearanceMemory(memory("Antigo", "Lyra tinha cabelo curto.", { archived: true }), "Lyra")).toBe(false)
    })
})

describe("appearanceMemoriesFor", () => {
    it("busca só no canal dos jogadores, guarda até 3 por personagem e corta o texto", async () => {
        search.results = [1, 2, 3, 4].map((n) => memory(`Visual ${n}`, `Lyra usa uma capa ${n}. ${"x".repeat(500)}`))
        const notes = await appearanceMemoriesFor("c1", ["Lyra"])
        expect(searchCampaignMemories).toHaveBeenCalledWith("c1", expect.objectContaining({ query: "Lyra", scope: "players" }))
        expect(notes.get("Lyra")).toHaveLength(3)
        expect(notes.get("Lyra")![0]!.text.length).toBeLessThanOrEqual(400)
    })

    it("rede fora ou busca que não responde: vazio, sem lançar", async () => {
        search.fail = true
        expect((await appearanceMemoriesFor("c1", ["Lyra"])).size).toBe(0)
        search.fail = false
        search.hang = true
        const started = Date.now()
        expect((await appearanceMemoriesFor("c1", ["Lyra"])).size).toBe(0)
        expect(Date.now() - started).toBeLessThan(2_000)
    })
})

describe("bloco de aparência", () => {
    const lyra = { name: "Lyra", profile: { identidade: "Elfa alta.", origem: "Vila de pescadores." }, currentState: "Ferida no braço." }

    it("HTML da ficha vira texto", () => {
        expect(sheetText("<p>Capa <strong>azul</strong>&nbsp;e cicatriz.</p><p>Botas.</p>")).toBe("Capa azul e cicatriz. Botas.")
    })

    it("só os campos registrados, com as anotações depois da ficha e a conferência final", () => {
        const item = characterAppearance({ character: lyra as never, sheet: { _id: null as never, race: "Elfa", hair: "prateado", eyes: "", appearance: "<p>Capa azul.</p>" } }, [{ title: "Novo visual", text: "Tingiu o cabelo de prata." }])
        const block = appearanceBlock([item])
        expect(block).toBe(
            [
                "### Lyra",
                "- Raça: Elfa",
                "- Cabelo: prateado",
                "- Aparência (ficha): Capa azul.",
                "- Identidade e aparência (perfil): Elfa alta.",
                "- Condição atual: Ferida no braço.",
                "- Mudanças registradas na história (valem sobre a ficha quando a contradizem):",
                "  - Novo visual: Tingiu o cabelo de prata.",
            ].join("\n"),
        )
        expect(block).not.toContain("Olhos")
        expect(block).not.toContain("pescadores")
        expect(appearanceRecap([item])).toEqual(["Lyra — cabelo: prateado; raça: Elfa; com as mudanças registradas na história"])
    })

    it("personagem sem nenhum dado: marcado como não registrado e fora da conferência", () => {
        const item = characterAppearance({ character: { name: "Doran", profile: {}, currentState: "" } as never, sheet: null })
        expect(appearanceBlock([item])).toBe("### Doran\n- (aparência não registrada: não invente traços marcantes como fatos)")
        expect(appearanceRecap([item])).toEqual([])
    })
})
