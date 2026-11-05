import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Maddox 10 — imagens nas cenas: situações ativas, chave da campanha, frequência (intervalo, uma por turno, teto diário),
 * referências de aparência (dados + imagens cadastradas), JEV como filtro, fim de batalha automático, pedido manual do dono
 * e retrato de NPC. O Gerador de imagens, o JEV, o storage, o catálogo e o narrador são mockados.
 */

const env = {
    enabled: true,
    situations: {} as Record<string, boolean>,
    custom: [] as { id: string; label: string; description: string; active: boolean }[],
    gap: 3,
    maxPerDay: 10,
    jevSceneImage: false,
    generatorAvailable: true,
    model: "gemini-2.5-flash-image",
}
const gen = { fail: false, hang: false }
const jev = { score: 0.9 as number | null, fail: false, hang: false }
const describer = { text: "", fail: false, hang: false }
/** Dependência que nunca responde (os tetos de tempo, reduzidos abaixo, precisam liberar a geração). */
const never = () => new Promise<never>(() => undefined)

const publishToChannels = vi.fn(async (...args: unknown[]) => void args)
const generateAndStoreDndImage = vi.fn(async (input: { storageKey?: string; referenceImages?: unknown[]; prompt?: string; consumptionOrigin?: string; preferredAspectRatio?: string }) => {
    if (gen.hang) return never()
    if (gen.fail) throw new Error("o provedor recusou a imagem")
    const key = `${input.storageKey}.png`
    return { key, url: `/api/upload?key=${encodeURIComponent(key)}`, mimeType: "image/png", referencesUsed: input.referenceImages?.length ?? 0 }
})
const askJevSystemOne = vi.fn(async (input: unknown) => {
    void input
    if (jev.hang) return never()
    if (jev.fail) throw new Error("JEV fora do ar")
    return { answers: { imagem: { type: "noul", noul: jev.score } } }
})
const getFile = vi.fn(async (key: string) => ({
    Body: new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(`img:${key}`))
            controller.close()
        },
    }),
    ContentType: "image/png",
}))
const generateAiText = vi.fn(async (input: unknown) => {
    void input
    if (describer.hang) return never()
    if (describer.fail) throw new Error("narrador indisponível")
    return { text: describer.text, usage: null, durationMs: 1 }
})

// Tetos de tempo curtos: gerador, descrição e JEV que nunca respondem precisam ser abandonados sem travar.
vi.mock("@/features/maddox/constants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/maddox/constants")>()),
    MADDOX_SCENE_IMAGE_TIMEOUT_MS: 150,
    MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS: 150,
    MADDOX_SCENE_IMAGE_JEV_TIMEOUT_MS: 150,
}))
vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: {
            enabled: true,
            main: { provider: "gemini", model: "gemini-test", agent: null, variant: null, temperature: null, maxOutputTokens: null },
            instructions: "Você é Maddox.",
            avatar: { url: null },
            opencode: { deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            jev: { "scene-image": env.jevSceneImage },
            sceneImages: { enabled: env.enabled, situations: env.situations, custom: env.custom, minNarrationsBetween: env.gap, maxPerDay: env.maxPerDay, aspectRatio: "16:9", style: "pintura a óleo" },
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({
    availability: vi.fn(async () => ({ available: true, reason: null })),
    loadImageGeneratorSettings: vi.fn(async () => ({ settings: { enabled: true, provider: "gemini", model: env.model, instructions: "Arte de D&D.", defaultAspectRatio: "1:1" }, isDefault: false, updatedAt: null })),
    availabilityOfImageGenerator: vi.fn(async () => (env.generatorAvailable ? { available: true, reason: null } : { available: false, reason: 'O "Gerador de imagens" está desativado.' })),
}))
vi.mock("@/features/ai/server/image-generator", () => ({ generateAndStoreDndImage }))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne }))
vi.mock("@/lib/ai/stream", () => ({ generateAiText }))
vi.mock("@/core/storage/s3", () => ({ getFile }))
vi.mock("@/features/mcp/server/catalog-entity-service", () => ({
    getCatalogEntity: vi.fn(async ({ id }: { id: string }) => (id === "goblin" ? { _id: "goblin", name: "Goblin", image: "/api/upload?key=catalogo%2Fgoblin.png", description: "<p>Pequeno e verde.</p>" } : null)),
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxNpcModel, MaddoxSceneImageModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const images = await import("@/features/maddox/server/scene-images")
const { enqueueMaddoxJob, jobDraftSceneImage, takeDraftImages, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { MADDOX_SCENE_IMAGE_CAPTION_GUIDE, MADDOX_SCENE_IMAGE_CAPTION_MAX } = await import("@/features/maddox/constants")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const { onCombatEnded } = await import("@/features/maddox/server/combat-image")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")

let mongo: MongoMemoryServer
const oid = () => new mongoose.Types.ObjectId()

async function seedUser(username: string) {
    const _id = oid()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function table() {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas do Norte", rigor: "narrativo" }, owner)
    const player = await seedUser("jogadora")
    await campaigns.joinByInvite((await campaigns.getInviteLink(created.id, owner)).token, player)
    const campaignId = new mongoose.Types.ObjectId(created.id)
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { status: "active", setting: "Um porto envolto em névoa.", "turn.number": 5, "turn.phase": "players", state: { scene: "", location: "Cais", situation: "", pendingDecision: "" } } })
    const sheetId = oid()
    await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `lyra-${String(sheetId)}`, userId: owner, name: "Lyra", race: "Elfa", class: "Ladina", hair: "prateado", eyes: "verdes", appearance: "Capa azul e cicatriz no queixo.", photo: "/api/upload?key=fichas%2Flyra.png" })
    const ownerMember = await MaddoxCampaignMemberModel.findOne({ campaignId, userId: owner }).lean()
    const playerMember = await MaddoxCampaignMemberModel.findOne({ campaignId, userId: player }).lean()
    const lyra = await MaddoxCharacterModel.create({ campaignId, memberId: ownerMember!._id, userId: owner, name: "Lyra", portraitUrl: null, profile: { identidade: "Elfa alta de olhar atento." }, interview: { status: "done", scriptVersion: 0 }, sheetId })
    const doran = await MaddoxCharacterModel.create({ campaignId, memberId: playerMember!._id, userId: player, name: "Doran", portraitUrl: "https://cdn.example.com/doran.png", profile: { identidade: "Anão ruivo de barba trançada." }, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: ownerMember!._id }, { $set: { characterId: lyra._id } })
    await MaddoxCampaignMemberModel.updateOne({ _id: playerMember!._id }, { $set: { characterId: doran._id } })
    await MaddoxNpcModel.create({ campaignId, name: "Varn", nameKey: "varn", publicDescription: "Contrabandista de casaco de couro.", masterNotes: "SEGREDO: trabalha para o duque.", visibility: "players" })
    await MaddoxNpcModel.create({ campaignId, name: "Sombra", nameKey: "sombra", publicDescription: "Vulto encapuzado.", visibility: "master" })
    const narration = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 5, phase: "master", kind: "narration", content: "Vocês chegam ao farol apagado, sob a chuva." })
    return { campaignId, id: created.id, owner, player, narrationId: narration._id }
}

/** Roda a ferramenta dentro de um job de narração (como o narrador faria). */
async function inNarration<T>(campaignId: mongoose.Types.ObjectId, turnNumber: number, run: (jobId: string) => Promise<T>, kind: "narration" | "answer" = "narration"): Promise<T> {
    let result: { value?: T; error?: unknown } = {}
    await enqueueMaddoxJob(
        String(campaignId),
        "teste",
        async ({ jobId }) => {
            try {
                result = { value: await run(jobId) }
            } catch (error) {
                result = { error }
            }
        },
        { kind, turnNumber, round: 0 },
    )
    if ("error" in result && result.error) throw result.error
    return result.value as T
}

const tool = (name: string) => findMaddoxTool(name)!
const sceneTool = (campaignId: mongoose.Types.ObjectId, turnNumber: number, jobId: string, input: Record<string, unknown>) => runMaddoxTool(tool("request_scene_image"), { campaignId, turnNumber, jobId }, input)
const settle = async (id: string) => {
    await waitForCampaignIdle(id)
    await images.waitForSceneImages()
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_scene_images_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxCombatModel.init(), MaddoxSceneImageModel.init()])
    // Carrega os módulos mockados uma vez antes dos pedidos concorrentes dos testes.
    await images.loadSceneImageEnvironment()
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([
        mongoose.connection.collection("users").deleteMany({}),
        MaddoxCampaignModel.deleteMany({}),
        MaddoxCampaignMemberModel.deleteMany({}),
        MaddoxCharacterModel.deleteMany({}),
        MaddoxCampaignMessageModel.deleteMany({}),
        MaddoxNpcModel.deleteMany({}),
        MaddoxCombatModel.deleteMany({}),
        MaddoxSceneImageModel.deleteMany({}),
        CharacterSheet.collection.deleteMany({}),
    ])
    Object.assign(env, { enabled: true, situations: { "new-location": true, climax: false, "combat-end": true, "npc-portrait": true }, custom: [], gap: 3, maxPerDay: 10, jevSceneImage: false, generatorAvailable: true, model: "gemini-2.5-flash-image" })
    Object.assign(gen, { fail: false, hang: false })
    Object.assign(jev, { score: 0.9, fail: false, hang: false })
    Object.assign(describer, { text: "", fail: false, hang: false })
    vi.clearAllMocks()
})

describe("ferramenta request_scene_image", () => {
    it("situação inativa ou inexistente: recusa listando as ativas e não guarda nada", async () => {
        const { campaignId } = await table()
        env.custom = [{ id: "ritual", label: "Ritual", description: "Um ritual grandioso.", active: true }]
        await inNarration(campaignId, 5, async (jobId) => {
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "climax", descricaoVisual: "Duelo no farol." })).rejects.toThrow(/não está ativa.*new-location \(Novo local ou cenário\).*ritual \(Ritual\)/)
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "voo-de-dragao", descricaoVisual: "Um dragão." })).rejects.toThrow(/"voo-de-dragao" não está ativa/)
            expect(jobDraftSceneImage(String(campaignId), jobId)).toBeNull()
        })
        expect(await MaddoxSceneImageModel.countDocuments()).toBe(0)
    })

    it("geração desligada, campanha com a chave desligada ou Gerador indisponível: recusa com o motivo", async () => {
        const { campaignId } = await table()
        const input = { situacao: "new-location", descricaoVisual: "O farol." }
        env.enabled = false
        await inNarration(campaignId, 5, (jobId) => expect(sceneTool(campaignId, 5, jobId, input)).rejects.toThrow(/desligadas na configuração/))
        env.enabled = true
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { sceneImages: false } })
        await inNarration(campaignId, 5, (jobId) => expect(sceneTool(campaignId, 5, jobId, input)).rejects.toThrow(/desligou as imagens automáticas/))
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { sceneImages: true } })
        env.generatorAvailable = false
        await inNarration(campaignId, 5, (jobId) => expect(sceneTool(campaignId, 5, jobId, input)).rejects.toThrow(/Gerador de imagens/))
    })

    it("quem aparece precisa existir: personagem, NPC conhecido e entidade do catálogo desconhecidos são recusados com as opções", async () => {
        const { campaignId } = await table()
        await inNarration(campaignId, 5, async (jobId) => {
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "x", personagens: ["Gandalf"] })).rejects.toThrow(/Personagem desconhecido: Gandalf. Personagens: Lyra, Doran|Personagens: Doran, Lyra/)
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "x", npcs: ["Sombra"] })).rejects.toThrow(/NPC desconhecido dos jogadores: Sombra. NPCs conhecidos: Varn/)
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "x", catalogo: [{ tipo: "Monstro", id: "dragao" }] })).rejects.toThrow(/não está no catálogo/)
            expect(jobDraftSceneImage(String(campaignId), jobId)).toBeNull()
        })
    })

    it("pedido válido fica no job com os nomes canônicos; o segundo na mesma narração é recusado", async () => {
        const { campaignId } = await table()
        await inNarration(campaignId, 5, async (jobId) => {
            const output = await sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "O farol apagado sob a chuva.", legenda: "O farol", personagens: ["lyra"], npcs: ["VARN"], catalogo: [{ tipo: "Monstro", id: "goblin" }] })
            expect(output).toMatchObject({ requested: true })
            expect(jobDraftSceneImage(String(campaignId), jobId)).toMatchObject({ situation: "new-location", characters: ["Lyra"], npcs: ["Varn"], catalog: [{ type: "Monstro", id: "goblin" }], caption: "O farol" })
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "De novo." })).rejects.toThrow(/uma por narração/)
            takeDraftImages(String(campaignId), jobId)
        })
    })

    it("fora da narração (resposta a pergunta) e para fim de batalha ou retrato: recusa", async () => {
        const { campaignId } = await table()
        await inNarration(campaignId, 5, (jobId) => expect(sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "x" })).rejects.toThrow(/só são pedidas na narração/), "answer")
        await inNarration(campaignId, 5, async (jobId) => {
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "combat-end", descricaoVisual: "x" })).rejects.toThrow(/cenaFinal/)
            await expect(sceneTool(campaignId, 5, jobId, { situacao: "npc-portrait", descricaoVisual: "x" })).rejects.toThrow(/gerarRetrato/)
        })
    })
})

describe("frequência", () => {
    const scene = () => ({ enabled: true, situations: env.situations as never, custom: [], minNarrationsBetween: env.gap, maxPerDay: env.maxPerDay, aspectRatio: "16:9" as const, style: "" })

    it("intervalo em turnos do mestre entre as automáticas; manual e retrato não contam no intervalo", async () => {
        const { campaignId } = await table()
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 3, source: "tool", slot: "auto", situation: "new-location", status: "done", counts: true })
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 5, source: "manual", slot: "manual", status: "done", counts: true })
        const at5 = await images.sceneImageQuota(campaignId, 5, scene(), "auto")
        expect(at5).toMatchObject({ allowed: false, nextTurn: 6 })
        expect(at5.reason).toContain("a partir do turno 6")
        expect(await images.sceneImageQuota(campaignId, 6, scene(), "auto")).toMatchObject({ allowed: true, remainingToday: 8 })
        expect(await images.sceneImageQuota(campaignId, 4, scene(), "manual")).toMatchObject({ allowed: true })
    })

    it("teto diário soma todas as origens; falhas e descartadas liberam a vaga", async () => {
        const { campaignId } = await table()
        env.maxPerDay = 2
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 1, source: "manual", slot: "manual", status: "done", counts: true })
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 1, source: "npc-portrait", slot: "portrait", status: "generating", counts: true })
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 2, source: "tool", slot: "auto", status: "failed", counts: false })
        const full = await images.sceneImageQuota(campaignId, 9, scene(), "auto")
        expect(full).toMatchObject({ allowed: false, remainingToday: 0 })
        expect(full.reason).toBe("Limite de 2 imagens por dia desta campanha atingido.")
        // Imagens de mais de 24 h atrás não contam.
        await MaddoxSceneImageModel.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 25 * 3600_000) } })
        expect(await images.sceneImageQuota(campaignId, 9, scene(), "auto")).toMatchObject({ allowed: true, remainingToday: 2 })
    })

    it("uma automática por turno: a ferramenta e o fim de combate no mesmo turno → só uma ocupa a vaga", async () => {
        const { campaignId, narrationId } = await table()
        const base = { campaignId, turnNumber: 5, messageId: narrationId, description: "cena", caption: "" }
        // Reserva concorrente: o índice único parcial decide.
        const [first, second] = await Promise.all([
            images.reserveSceneImage({ ...base, source: "tool", situation: "new-location" }, scene()),
            images.reserveSceneImage({ ...base, source: "combat-end", situation: "combat-end" }, scene()),
        ])
        expect([first, second].filter(Boolean)).toHaveLength(1)
        expect(await MaddoxSceneImageModel.countDocuments({ counts: true })).toBe(1)
        expect(await MaddoxSceneImageModel.countDocuments({ status: "skipped", skipReason: "duplicate-turn" })).toBe(1)
        // Em sequência, o segundo pedido já é recusado pela cota, com o motivo.
        const later = await images.scheduleSceneImage({ ...base, source: "combat-end", situation: "combat-end" })
        expect(later).toEqual({ image: null, reason: "Já há uma imagem nesta narração: uma por turno." })
    })

    it("pedidos simultâneos não passam do teto diário", async () => {
        const { campaignId } = await table()
        env.maxPerDay = 1
        const request = (turnNumber: number) => images.reserveSceneImage({ campaignId, source: "manual", turnNumber, situation: null, description: "x", caption: "", byOwner: true }, scene())
        const results = await Promise.all([request(1), request(2), request(3)])
        expect(results.filter(Boolean)).toHaveLength(1)
        expect(await MaddoxSceneImageModel.countDocuments({ counts: true })).toBe(1)
        expect(await MaddoxSceneImageModel.countDocuments({ status: "skipped", skipReason: "daily-limit" })).toBe(2)
    })
})

describe("geração", () => {
    it("gera com os dados de aparência e as imagens cadastradas como referência e avisa a mesa", async () => {
        const { campaignId, narrationId } = await table()
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([9, 9]), { headers: { "content-type": "image/png" } }))
        const { image } = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "O farol apagado sob a chuva.", caption: "O farol", characters: ["Lyra", "Doran"], npcs: ["Varn"], catalog: [{ type: "Monstro", id: "goblin" }] })
        expect(image).toBeTruthy()
        await images.waitForSceneImages()
        expect(fetchSpy).toHaveBeenCalledWith("https://cdn.example.com/doran.png", expect.anything())
        fetchSpy.mockRestore()
        const stored = await MaddoxSceneImageModel.findById(image!._id).lean()
        expect(stored).toMatchObject({ status: "done", counts: true, referencesUsed: 3, key: `maddox/campaigns/${String(campaignId)}/scenes/${String(image!._id)}.png` })
        const call = generateAndStoreDndImage.mock.calls[0]![0] as { prompt: string; referenceImages: unknown[]; consumptionOrigin: string; preferredAspectRatio: string }
        expect(call.consumptionOrigin).toBe("maddox-scene-image")
        expect(call.preferredAspectRatio).toBe("16:9")
        expect(call.referenceImages).toHaveLength(3)
        // Lyra sem retrato usa a foto da ficha; Doran, o retrato; Varn não tem retrato; o Goblin, a imagem do catálogo.
        expect(getFile).toHaveBeenCalledWith("fichas/lyra.png")
        expect(getFile).toHaveBeenCalledWith("catalogo/goblin.png")
        expect(call.prompt).toContain("aparência de: Lyra (personagem); Doran (personagem); Goblin (Monstro)")
        expect(call.prompt).toContain("Capa azul e cicatriz no queixo.")
        expect(call.prompt).toContain("Anão ruivo de barba trançada.")
        expect(call.prompt).toContain("Contrabandista de casaco de couro.")
        expect(call.prompt).toContain("pintura a óleo")
        expect(call.prompt).not.toContain("SEGREDO")
        expect(publishToChannels).toHaveBeenCalled()
        const [dto] = (await images.sceneImagesByMessage([narrationId])).get(String(narrationId))!
        expect(dto).toEqual({ id: String(image!._id), status: "done", url: expect.stringContaining("/api/upload?key="), caption: "O farol", situationLabel: "Novo local ou cenário", source: "tool", error: null })
        expect(dto).not.toHaveProperty("description")
    })

    it("modelo sem imagens de entrada: gera só com os dados", async () => {
        const { campaignId, narrationId } = await table()
        env.model = "imagen-4.0-generate-001"
        await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "O farol.", caption: "", characters: ["Lyra"] })
        await images.waitForSceneImages()
        const call = generateAndStoreDndImage.mock.calls[0]![0] as { prompt: string; referenceImages: unknown[] }
        expect(call.referenceImages).toEqual([])
        expect(call.prompt).not.toContain("imagens anexadas")
        expect(call.prompt).toContain("Capa azul e cicatriz no queixo.")
    })

    it("falha do gerador: imagem falha, libera a vaga e a mesa mostra o aviso", async () => {
        const { campaignId, narrationId } = await table()
        gen.fail = true
        const { image } = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "x", caption: "" })
        await images.waitForSceneImages()
        expect(await MaddoxSceneImageModel.findById(image!._id).lean()).toMatchObject({ status: "failed", counts: false, error: "Não foi possível gerar a imagem desta cena." })
        expect((await images.sceneImagesByMessage([narrationId])).get(String(narrationId))).toEqual([expect.objectContaining({ status: "failed", url: null })])
    })

    it("JEV ligado filtra a imagem do narrador; falha do JEV não impede; não roda nas demais origens", async () => {
        const { campaignId, narrationId } = await table()
        env.jevSceneImage = true
        env.gap = 0
        jev.score = 0.2
        const low = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "x", caption: "" })
        await images.waitForSceneImages()
        expect(await MaddoxSceneImageModel.findById(low.image!._id).lean()).toMatchObject({ status: "skipped", counts: false, skipReason: "jev", jevScore: 0.2 })
        expect(generateAndStoreDndImage).not.toHaveBeenCalled()
        expect((await images.sceneImagesByMessage([narrationId])).size).toBe(0)

        jev.score = 0.8
        const high = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 6, messageId: narrationId, situation: "new-location", description: "x", caption: "" })
        await images.waitForSceneImages()
        expect(await MaddoxSceneImageModel.findById(high.image!._id).lean()).toMatchObject({ status: "done", jevScore: 0.8 })

        jev.fail = true
        const failing = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 7, messageId: narrationId, situation: "new-location", description: "x", caption: "" })
        await images.waitForSceneImages()
        expect(await MaddoxSceneImageModel.findById(failing.image!._id).lean()).toMatchObject({ status: "done" })

        askJevSystemOne.mockClear()
        await images.scheduleSceneImage({ campaignId, source: "combat-end", turnNumber: 8, messageId: narrationId, situation: "combat-end", description: "x", caption: "" })
        await images.waitForSceneImages()
        expect(askJevSystemOne).not.toHaveBeenCalled()
    })

    it("imagens presas (processo reiniciado) viram falha na leitura", async () => {
        const { campaignId } = await table()
        const stuck = await MaddoxSceneImageModel.create({ campaignId, turnNumber: 5, source: "tool", slot: "auto", status: "generating", counts: true })
        await MaddoxSceneImageModel.collection.updateOne({ _id: stuck._id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } })
        expect(await images.expireStaleSceneImages(campaignId)).toBe(1)
        expect(await MaddoxSceneImageModel.findById(stuck._id).lean()).toMatchObject({ status: "failed", counts: false })
    })
})

describe("fim de batalha", () => {
    async function endedCombat(campaignId: mongoose.Types.ObjectId, finalScene: string) {
        const npc = await MaddoxNpcModel.findOne({ campaignId, name: "Varn" }).lean()
        const combat = await MaddoxCombatModel.create({ campaignId, title: "Emboscada no cais", status: "ended", startedTurn: 4, endedTurn: 5, finalScene, combatants: [{ name: "Varn", nameKey: "varn", side: "inimigo", quantity: 1, description: "", condition: "", npcId: npc!._id, outcome: "fugiu" }] })
        const card = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 5, phase: "master", kind: "combat", combat: { event: "end", combatId: combat._id } })
        return { combat: combat.toObject(), card }
    }

    it("com a situação ativa, a cena final vira imagem ligada ao card de fim, com o grupo e os NPCs do combate", async () => {
        const { campaignId } = await table()
        const { combat, card } = await endedCombat(campaignId, "O cais vazio, Varn fugindo num bote.")
        await onCombatEnded(combat)
        await images.waitForSceneImages()
        const image = await MaddoxSceneImageModel.findOne({ source: "combat-end" }).lean()
        expect(image).toMatchObject({ messageId: card._id, situation: "combat-end", status: "done", description: "O cais vazio, Varn fugindo num bote.", caption: "Emboscada no cais" })
        expect(image!.references.characters.sort()).toEqual(["Doran", "Lyra"])
        expect(image!.references.npcs).toEqual(["Varn"])
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.image).toMatchObject({ status: "requested" })
    })

    it("situação inativa ou sem cena final: nada é gerado", async () => {
        const { campaignId } = await table()
        env.situations = { ...env.situations, "combat-end": false }
        const inactive = await endedCombat(campaignId, "O cais vazio.")
        await onCombatEnded(inactive.combat)
        expect((await MaddoxCombatModel.findById(inactive.combat._id).lean())!.image).toMatchObject({ status: "skipped" })
        env.situations = { ...env.situations, "combat-end": true }
        const empty = await endedCombat(campaignId, "")
        await onCombatEnded(empty.combat)
        expect((await MaddoxCombatModel.findById(empty.combat._id).lean())!.image).toMatchObject({ status: "skipped" })
        expect(await MaddoxSceneImageModel.countDocuments()).toBe(0)
    })
})

describe("pedidos do dono", () => {
    it("imagem manual: só o dono; o Maddox descreve a cena atual e a imagem fica na última narração", async () => {
        const { id, owner, player, narrationId, campaignId } = await table()
        env.enabled = false // o pedido manual ignora a chave geral e as situações
        await expect(images.requestManualSceneImage(id, player)).rejects.toMatchObject({ status: 403 })
        describer.text = JSON.stringify({ descricaoVisual: "Lyra ergue a lanterna no topo do farol.", legenda: "No topo do farol", personagens: ["Lyra", "Gandalf"], npcs: ["Varn"] })
        const dto = await images.requestManualSceneImage(id, owner)
        expect(dto).toMatchObject({ status: "pending", source: "manual" })
        await expect(images.requestManualSceneImage(id, owner)).rejects.toMatchObject({ status: 409, code: "SCENE_IMAGE_BUSY" })
        await settle(id)
        const image = await MaddoxSceneImageModel.findOne({ source: "manual" }).lean()
        expect(image).toMatchObject({ messageId: narrationId, status: "done", description: "Lyra ergue a lanterna no topo do farol.", caption: "No topo do farol", requestedBy: owner })
        expect(image!.references.characters).toEqual(["Lyra"])
        expect(image!.references.npcs).toEqual(["Varn"])
        const control = await images.sceneImageControl((await MaddoxCampaignModel.findById(campaignId).lean())!, owner)
        expect(control).toMatchObject({ owner: true, canRequest: true, remainingToday: 9 })
        expect(await images.sceneImageControl((await MaddoxCampaignModel.findById(campaignId).lean())!, player)).toMatchObject({ owner: false, canRequest: false })
    })

    it("descrição do Maddox indisponível: a última narração vira a descrição, com todos os personagens", async () => {
        const { id, owner } = await table()
        describer.fail = true
        await images.requestManualSceneImage(id, owner)
        await settle(id)
        const image = await MaddoxSceneImageModel.findOne({ source: "manual" }).lean()
        expect(image).toMatchObject({ status: "done", description: "Vocês chegam ao farol apagado, sob a chuva." })
        expect(image!.references.characters.sort()).toEqual(["Doran", "Lyra"])
    })

    it("no teto do dia ou sem Gerador: 409 com o motivo, nada gravado", async () => {
        const { id, owner, campaignId } = await table()
        env.maxPerDay = 1
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 1, source: "tool", slot: "auto", status: "done", counts: true })
        await expect(images.requestManualSceneImage(id, owner)).rejects.toMatchObject({ status: 409, code: "SCENE_IMAGE_LIMIT" })
        env.maxPerDay = 10
        env.generatorAvailable = false
        await expect(images.requestManualSceneImage(id, owner)).rejects.toMatchObject({ status: 409, code: "AI_IMAGE_UNAVAILABLE" })
        expect(await MaddoxSceneImageModel.countDocuments({ source: "manual" })).toBe(0)
    })

    it("retrato pelo dono: NPC conhecido ganha retrato 1:1; NPC só do mestre não existe para o pedido", async () => {
        const { id, owner, campaignId } = await table()
        const varn = await MaddoxNpcModel.findOne({ campaignId, name: "Varn" }).lean()
        const sombra = await MaddoxNpcModel.findOne({ campaignId, name: "Sombra" }).lean()
        await expect(images.requestNpcPortrait(id, String(sombra!._id), owner)).rejects.toMatchObject({ status: 404 })
        await images.requestNpcPortrait(id, String(varn!._id), owner)
        await images.waitForSceneImages()
        expect((await MaddoxNpcModel.findById(varn!._id).lean())!.portraitUrl).toContain(encodeURIComponent(`maddox/campaigns/${String(campaignId)}/npcs/`))
        const call = generateAndStoreDndImage.mock.calls[0]![0] as { preferredAspectRatio: string; prompt: string }
        expect(call.preferredAspectRatio).toBe("1:1")
        expect(call.prompt).toContain("Retrato de um personagem não jogador")
        expect(call.prompt).not.toContain("SEGREDO")
    })

    it("save_npc { gerarRetrato }: com a situação ativa o retrato é pedido depois da narração; inativa, o NPC é salvo e o retorno explica", async () => {
        const { campaignId } = await table()
        const result = await inNarration(campaignId, 5, async (jobId) => {
            const output = await runMaddoxTool(tool("save_npc"), { campaignId, turnNumber: 5, jobId }, { name: "Mira", publicDescription: "Faroleira de cabelos brancos.", visibility: "players", gerarRetrato: true })
            return { output, drafts: takeDraftImages(String(campaignId), jobId) }
        })
        expect(result.output).toMatchObject({ saved: true, retrato: expect.stringContaining("pedido") })
        expect(result.drafts.npcPortraits).toHaveLength(1)
        await images.scheduleNpcPortraits(campaignId, result.drafts.npcPortraits)
        await images.waitForSceneImages()
        expect((await MaddoxNpcModel.findOne({ campaignId, name: "Mira" }).lean())!.portraitUrl).toBeTruthy()

        env.situations = { ...env.situations, "npc-portrait": false }
        const off = await inNarration(campaignId, 5, (jobId) => runMaddoxTool(tool("save_npc"), { campaignId, turnNumber: 5, jobId }, { name: "Tobias", publicDescription: "Pescador.", visibility: "players", gerarRetrato: true }))
        expect(off).toMatchObject({ saved: true, retrato: expect.stringContaining("não pedido") })
        expect(await MaddoxNpcModel.exists({ campaignId, name: "Tobias" })).toBeTruthy()
    })
})

describe("revisão: várias imagens na mesma narração, legenda, tetos de tempo e fila (Maddox 10)", () => {
    const scene = () => ({ enabled: true, situations: env.situations as never, custom: [], minNarrationsBetween: env.gap, maxPerDay: env.maxPerDay, aspectRatio: "16:9" as const, style: "" })
    const manual = async (campaignId: mongoose.Types.ObjectId, messageId: mongoose.Types.ObjectId, turnNumber = 5) => {
        const image = await images.reserveSceneImage({ campaignId, source: "manual", turnNumber, messageId, situation: null, description: "Cena pedida pelo dono.", caption: "Pedido do dono", byOwner: true }, scene())
        return image!
    }

    it("a imagem do Maddox pronta continua na narração quando o dono pede outra; a falha da manual não a esconde", async () => {
        const { campaignId, narrationId } = await table()
        const tool = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "O farol.", caption: "O farol" })
        await images.waitForSceneImages()

        gen.fail = true
        const failed = await manual(campaignId, narrationId)
        await images.startSceneImage(String(failed._id))
        expect(await MaddoxSceneImageModel.findById(failed._id).lean()).toMatchObject({ status: "failed" })
        expect((await images.sceneImagesByMessage([narrationId])).get(String(narrationId))).toEqual([expect.objectContaining({ id: String(tool.image!._id), status: "done", caption: "O farol" })])

        // Com a manual pintando, as duas aparecem; quando ela fica pronta, as duas ficam.
        gen.fail = false
        gen.hang = true
        const second = await manual(campaignId, narrationId)
        void images.startSceneImage(String(second._id))
        await vi.waitFor(async () => expect((await MaddoxSceneImageModel.findById(second._id).lean())!.status).toBe("generating"))
        expect((await images.sceneImagesByMessage([narrationId])).get(String(narrationId))!.map((item) => item.status)).toEqual(["done", "generating"])
        await images.waitForSceneImages()
        gen.hang = false
        const third = await manual(campaignId, narrationId)
        await images.startSceneImage(String(third._id))
        expect((await images.sceneImagesByMessage([narrationId])).get(String(narrationId))!.map((item) => [item.source, item.status])).toEqual([
            ["tool", "done"],
            ["manual", "done"],
        ])
        // Sem nenhuma pronta, a falha aparece (o dono sabe que não saiu).
        expect(images.visibleSceneImages([{ id: "a", status: "failed", url: null, caption: "", situationLabel: null, source: "manual", error: "x" }])).toHaveLength(1)
    })

    it("legenda acima da orientação e abaixo do teto de proteção é gravada inteira; só passa do teto é cortada", async () => {
        const { campaignId, narrationId } = await table()
        expect(MADDOX_SCENE_IMAGE_CAPTION_MAX).toBeGreaterThan(MADDOX_SCENE_IMAGE_CAPTION_GUIDE)
        const long = "Lyra ergue a lanterna no alto do farol enquanto a tempestade rasga o céu e as ondas quebram contra as pedras do cais, iluminando por um instante o bote de Varn ao longe."
        expect(long.length).toBeGreaterThan(MADDOX_SCENE_IMAGE_CAPTION_GUIDE)
        await inNarration(campaignId, 5, async (jobId) => {
            const output = await sceneTool(campaignId, 5, jobId, { situacao: "new-location", descricaoVisual: "O farol.", legenda: long })
            expect(output).not.toHaveProperty("truncated")
            expect(jobDraftSceneImage(String(campaignId), jobId)!.caption).toBe(long)
            takeDraftImages(String(campaignId), jobId)
        })
        const stored = await images.reserveSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "x", caption: long }, scene())
        expect(stored!.caption).toBe(long)
        const huge = await images.reserveSceneImage({ campaignId, source: "manual", turnNumber: 5, messageId: narrationId, situation: null, description: "x", caption: "a".repeat(MADDOX_SCENE_IMAGE_CAPTION_MAX + 50), byOwner: true }, scene())
        expect(huge!.caption.length).toBe(MADDOX_SCENE_IMAGE_CAPTION_MAX)
    })

    it("gerador que nunca responde: as imagens falham pelo teto, liberam a vaga e as vagas de geração, e a próxima sai", async () => {
        const { campaignId, narrationId } = await table()
        env.maxPerDay = 3
        gen.hang = true
        // Duas presas ocupam as duas vagas de geração do processo.
        const first = await manual(campaignId, narrationId, 1)
        const second = await manual(campaignId, narrationId, 2)
        await Promise.all([images.startSceneImage(String(first._id)), images.startSceneImage(String(second._id))])
        for (const id of [first._id, second._id]) expect(await MaddoxSceneImageModel.findById(id).lean()).toMatchObject({ status: "failed", counts: false, error: "Não foi possível gerar a imagem desta cena." })
        expect(await images.sceneImageQuota(campaignId, 9, scene(), "manual")).toMatchObject({ allowed: true, remainingToday: 3 })

        gen.hang = false
        const next = await manual(campaignId, narrationId, 3)
        await images.startSceneImage(String(next._id))
        expect(await MaddoxSceneImageModel.findById(next._id).lean()).toMatchObject({ status: "done" })
    })

    it("descrição do Maddox e JEV que nunca respondem não travam: a imagem sai mesmo assim", async () => {
        const { id, owner, campaignId, narrationId } = await table()
        describer.hang = true
        await images.requestManualSceneImage(id, owner)
        await settle(id)
        expect(await MaddoxSceneImageModel.findOne({ source: "manual" }).lean()).toMatchObject({ status: "done", description: "Vocês chegam ao farol apagado, sob a chuva." })

        env.jevSceneImage = true
        jev.hang = true
        const { image } = await images.scheduleSceneImage({ campaignId, source: "tool", turnNumber: 5, messageId: narrationId, situation: "new-location", description: "O farol.", caption: "" })
        await images.waitForSceneImages()
        expect(await MaddoxSceneImageModel.findById(image!._id).lean()).toMatchObject({ status: "done", jevScore: null })
    })

    it("imagem manual esperando a vez na fila da campanha não é expirada como presa", async () => {
        const { id, owner, campaignId } = await table()
        let release: () => void = () => undefined
        // Uma narração longa ocupa a fila da campanha.
        void enqueueMaddoxJob(id, "narração longa", () => new Promise<void>((resolve) => (release = resolve)))
        await images.requestManualSceneImage(id, owner)
        const waiting = await MaddoxSceneImageModel.findOne({ source: "manual" }).lean()
        await MaddoxSceneImageModel.collection.updateOne({ _id: waiting!._id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } })
        expect(await images.expireStaleSceneImages(campaignId)).toBe(0)
        expect(await MaddoxSceneImageModel.findById(waiting!._id).lean()).toMatchObject({ status: "pending" })
        release()
        await settle(id)
        expect(await MaddoxSceneImageModel.findById(waiting!._id).lean()).toMatchObject({ status: "done" })
    })
})
