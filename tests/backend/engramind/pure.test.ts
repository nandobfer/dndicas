import { describe, expect, it } from "vitest"
import { CAMPAIGN_CHANNEL_PREFIX, campaignChannel, normalizeCategoryKey, parseCampaignChannel, subscriptionsFor } from "@/features/engramind/constants"
import { combatMemoryKey, kindOfCategory, memoryKeyOf, readTags, resolveCategory, tagsOf, viewOf } from "@/features/engramind/campaign-memory-format"
import { applyCuratorRules, estimateBudgets, budgetCombinations, parseCuratorAnswer } from "@/features/engramind/memory-curator"

const ID = "6650f1a2b3c4d5e6f7a8b9c0"

describe("canais e assinaturas", () => {
    it("canal da campanha ↔ campanha e visibilidade", () => {
        expect(campaignChannel(ID, "players")).toBe(`${CAMPAIGN_CHANNEL_PREFIX}${ID}/jogadores`)
        expect(parseCampaignChannel(campaignChannel(ID, "master"))).toEqual({ campaignId: ID, visibility: "master" })
        for (const slug of ["dndicas/maddox", `${CAMPAIGN_CHANNEL_PREFIX}${ID}/outro`, `${CAMPAIGN_CHANNEL_PREFIX}xyz/jogadores`, `${CAMPAIGN_CHANNEL_PREFIX}${ID}/jogadores/extra`, null]) expect(parseCampaignChannel(slug)).toBeNull()
    })

    it("o Maddox assina as campanhas em search e o Opex alcança os demais canais fixos em manage", () => {
        const subs = subscriptionsFor()
        expect(subs).toContainEqual({ agent: "maddox", target: `${CAMPAIGN_CHANNEL_PREFIX}*`, mode: "search" })
        expect(subs).toContainEqual({ agent: "opex", target: "dndicas/maddox", mode: "manage" })
        expect(subs.filter((item) => item.agent === "opex" && item.target.startsWith("dndicas/opex/"))).toEqual(expect.arrayContaining([expect.objectContaining({ mode: "inject" })]))
    })

    it("chave de categoria normalizada para o formato do contrato", () => {
        expect(normalizeCategoryKey("Glossário de termos")).toBe("GLOSSARIO_DE_TERMOS")
        expect(normalizeCategoryKey("missão")).toBe("MISSAO")
        expect(normalizeCategoryKey("123")).toBeNull()
        expect(normalizeCategoryKey("x".repeat(60))).toHaveLength(40)
    })
})

describe("formato das memórias das campanhas", () => {
    it("chave por tipo + título normalizado, limite de 80 com hash, e a do combate", () => {
        expect(memoryKeyOf("missao", "O Mapá do Farol!")).toBe("mx:missao:o-mapa-do-farol")
        expect(memoryKeyOf("fato", "o mapa do farol")).toBe(memoryKeyOf("fato", "O  MAPA do Farol"))
        const long = memoryKeyOf("relacao", "Uma relação ".repeat(20))
        expect(long.length).toBeLessThanOrEqual(80)
        expect(long).toMatch(/^mx:relacao:uma-relacao.*-[a-f0-9]{8}$/)
        expect(memoryKeyOf("fato", "!!!")).toMatch(/^mx:fato:-?[a-f0-9]{8}$/)
        expect(memoryKeyOf("fato", "x")).toMatch(/^[A-Za-z0-9:_-]{1,80}$/)
        expect(combatMemoryKey(ID)).toBe(`mx:combate:${ID}`)
    })

    it("tags reservadas de situação (só missão) e turno, nos dois sentidos", () => {
        expect(tagsOf({ kind: "missao", tags: ["pista", "status:falsa", " pista "], turnNumber: 3 })).toEqual(["pista", "status:ativa", "turno:3"])
        expect(tagsOf({ kind: "fato", tags: ["x".repeat(60)], status: "concluida" })).toEqual(["x".repeat(40)])
        expect(readTags(["pista", "status:concluida", "turno:3"], "missao")).toEqual({ tags: ["pista"], status: "concluida", turnNumber: 3 })
        expect(readTags(["status:talvez"], "missao")).toMatchObject({ status: "ativa" })
        expect(readTags(["status:ativa"], "fato")).toMatchObject({ status: null, tags: [] })
    })

    it("tipo ↔ categoria com fallback para OUTRO", () => {
        expect(kindOfCategory("RELACAO")).toBe("relacao")
        expect(kindOfCategory("PROJECT_RULES")).toBe("outro")
        expect(resolveCategory("local", ["LOCAL", "OUTRO"])).toBe("LOCAL")
        expect(resolveCategory("local", ["OUTRO", "X"])).toBe("OUTRO")
        expect(resolveCategory("local", ["X"])).toBe("X")
        expect(resolveCategory("local", null)).toBe("LOCAL")
    })

    it("memória da rede → forma do jogo; fora dos canais de campanha → null", () => {
        const base = { id: "m_1", title: "Farol", text: "Ao norte.", category: "LOCAL", status: "archived" as const, version: 2, tags: ["turno:2"], updated_at: "2026-11-06T00:00:00Z" }
        expect(viewOf({ ...base, channel: campaignChannel(ID, "master") })).toMatchObject({ campaignId: ID, visibility: "master", kind: "local", turnNumber: 2, archived: true, tags: [] })
        expect(viewOf({ ...base, channel: "dndicas/maddox" })).toBeNull()
    })
})

describe("curador da migração", () => {
    const items = [{ id: "a", list: "maddox", texto: "Curta.", resumo: "", createdAt: "2026-01-01T00:00:00Z" }, { id: "b", list: "maddox", texto: "x".repeat(50), resumo: "", createdAt: "2026-01-01T00:00:00Z" }]
    const rules = { categories: [{ key: "PROJECT_RULES" }, { key: "NAMING" }], textMax: 40 }

    it("sem resposta → revisão; acima do limite → revisão; destino sempre o canal da lista; categoria nova normalizada", () => {
        const answers = parseCuratorAnswer(`Aqui: [{"id":"a","decisao":"migrar","motivo":"ok","canalDestino":"dndicas/opex/global","novaCategoria":{"key":"Táticas","label":"Táticas"}},{"id":"b","decisao":"migrar","motivo":"ok"},{"id":"z","decisao":"inválida"}] fim`)
        expect(answers).toHaveLength(2)
        const result = applyCuratorRules(items, answers, rules)
        expect(result.get("a")).toMatchObject({ decisao: "migrar", canalDestino: "dndicas/maddox", categoriaProposta: "TATICAS", novaCategoria: { key: "TATICAS", label: "Táticas" }, motivo: expect.stringContaining("fica na lista de origem") })
        expect(result.get("b")).toMatchObject({ decisao: "revisar_dono", motivo: expect.stringContaining("Acima de 40") })
        expect(applyCuratorRules(items, [], rules).get("a")).toMatchObject({ decisao: "revisar_dono", motivo: "Sem classificação válida do curador", categoriaProposta: "PROJECT_RULES" })
    })

    it("a reescrita que cabe resolve o texto longo; a que não cabe vai para revisão", () => {
        const fits = applyCuratorRules(items, [{ id: "b", decisao: "migrar_reescrevendo", motivo: "curto", textoProposto: "Bem menor." }], rules)
        expect(fits.get("b")).toMatchObject({ decisao: "migrar_reescrevendo" })
        const long = applyCuratorRules(items, [{ id: "b", decisao: "migrar_reescrevendo", motivo: "curto", textoProposto: "y".repeat(45) }], rules)
        expect(long.get("b")).toMatchObject({ decisao: "revisar_dono" })
    })

    it("orçamento: ~4 caracteres por token por combinação de turno", () => {
        const budgets = estimateBudgets([{ channel: "dndicas/opex/global", text: "x".repeat(400) }, { channel: "dndicas/opex/admin", text: "x".repeat(400) }], budgetCombinations(), 150)
        expect(budgets.find((item) => item.key === "opex-admin")).toMatchObject({ tokens: 208, memories: 2, over: true })
        expect(budgets.find((item) => item.key === "opex-user")).toMatchObject({ tokens: 104, memories: 1, over: false })
    })
})
