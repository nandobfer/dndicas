import { describe, expect, it } from "vitest"
import { CAMPAIGN_CHANNEL_PREFIX, campaignChannel, normalizeCategoryKey, parseCampaignChannel, subscriptionsFor } from "@/features/engramind/constants"
import { engramindTextOf, kindOfCategory, memoryIdOfKey, mirrorKey, parseEngramindText, resolveCategory } from "@/features/engramind/campaign-mirror-format"
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

describe("formato do espelho das campanhas", () => {
    it("linha de status só nas missões; ausente ou inválida mantém o status anterior", () => {
        expect(engramindTextOf({ kind: "missao", text: "Achar o mapa.", status: "ativa" })).toBe("Status: ativa\nAchar o mapa.")
        expect(engramindTextOf({ kind: "fato", text: "Sol.", status: null })).toBe("Sol.")
        expect(parseEngramindText("Status: concluida\nAchou.", "missao", "ativa")).toEqual({ text: "Achou.", status: "concluida" })
        expect(parseEngramindText("Sem linha.", "missao", "falhou")).toEqual({ text: "Sem linha.", status: "falhou" })
        expect(parseEngramindText("Status: talvez\nX", "missao", "abandonada")).toEqual({ text: "X", status: "abandonada" })
        expect(parseEngramindText("Status: ativa\nTexto", "fato", null)).toEqual({ text: "Texto", status: null })
    })

    it("tipo ↔ categoria com fallback para OUTRO e chave mx-<id>", () => {
        expect(kindOfCategory("RELACAO")).toBe("relacao")
        expect(kindOfCategory("PROJECT_RULES")).toBe("outro")
        expect(resolveCategory("local", ["LOCAL", "OUTRO"])).toBe("LOCAL")
        expect(resolveCategory("local", ["OUTRO", "X"])).toBe("OUTRO")
        expect(resolveCategory("local", ["X"])).toBe("X")
        expect(resolveCategory("local", null)).toBe("LOCAL")
        expect(memoryIdOfKey(mirrorKey(ID))).toBe(ID)
        expect(memoryIdOfKey("lore:dragao")).toBeNull()
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
