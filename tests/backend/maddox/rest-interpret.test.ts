import { describe, expect, it } from "vitest"
import { createCatalogReadLog, recordCatalogRead } from "@/features/maddox/server/catalog-reads"
import { interpretRestPrep, RestPrepFormatError } from "@/features/maddox/server/rest-interpret"
import { REST_REASON_LONG_ONLY } from "@/features/maddox/rest-rules"

const charges = [
    { id: "rage", name: "Fúria", total: 3, used: 2, source: { kind: "class-feature", entityType: "Habilidade", entityId: "hab-rage" } },
    { id: "luck", name: "Sorte", total: 3, used: 1, source: { kind: "feat", entityType: "Talento", entityId: "tal-luck" } },
]

function reads() {
    const log = createCatalogReadLog()
    recordCatalogRead(log, "Habilidade", "hab-rage", { nome: "Fúria", descricao: "Você recupera um uso gasto quando termina um Descanso Curto e todos os usos quando termina um Descanso Longo." })
    recordCatalogRead(log, "Talento", "tal-luck", { nome: "Sortudo", descricao: "Você recupera os pontos de sorte gastos quando termina um Descanso Longo." })
    recordCatalogRead(log, "Classe", "bruxo", { nome: "Bruxo", descricao: "Magia de Pacto: você recupera todos os espaços de Magia de Pacto gastos quando termina um Descanso Curto ou Longo." })
    return log
}

describe("DND-58 — preparação da ficha confere a fonte do catálogo", () => {
    it("aceita com a origem lida e o trecho do descanso; recusa o que só volta no longo durante o curto", () => {
        const decisions = interpretRestPrep(
            {
                cargas: [
                    { chargeId: "rage", recupera: 1, source: { ref: "Habilidade:hab-rage", quote: "Você recupera um uso gasto quando termina um Descanso Curto" } },
                    { chargeId: "luck", recupera: "todas", source: { ref: "Talento:tal-luck", quote: "Você recupera os pontos de sorte gastos quando termina um Descanso Longo" } },
                ],
                espacosNoCurto: { recupera: true, source: { ref: "Classe:bruxo", quote: "você recupera todos os espaços de Magia de Pacto gastos quando termina um Descanso Curto ou Longo" } },
            },
            { type: "short", charges, classRefs: ["Classe:bruxo"] },
            reads(),
        )
        expect(decisions.charges.get("rage")).toEqual({ recover: 1 })
        expect(decisions.charges.has("luck")).toBe(false)
        expect(decisions.refusals.get("luck")).toBe(REST_REASON_LONG_ONLY)
        expect(decisions.shortRestSlots).toBe(true)
    })

    it("sem fonte, fonte não lida, trecho que não está no texto ou de outra entidade: não volta", () => {
        const decisions = interpretRestPrep(
            {
                cargas: [
                    { chargeId: "rage", recupera: "todas" },
                    { chargeId: "luck", recupera: "todas", source: { ref: "Habilidade:hab-rage", quote: "todos os usos quando termina um Descanso Longo" } },
                ],
                espacosNoCurto: { recupera: true, source: { ref: "Classe:mago", quote: "recupera espaços num descanso curto" } },
            },
            { type: "long", charges, classRefs: ["Classe:bruxo"] },
            reads(),
        )
        expect(decisions.charges.size).toBe(0)
        expect(decisions.refusals.get("rage")).toContain("não confirmado no catálogo")
        expect(decisions.refusals.get("luck")).toContain("não é a origem")
        expect(decisions.shortRestSlots).toBe(false)
    })

    it("'nenhuma' com motivo vira o motivo do resumo; resposta fora do formato é erro (vai para nova tentativa)", () => {
        const decisions = interpretRestPrep({ cargas: [{ chargeId: "rage", recupera: "nenhuma", motivo: "a descrição não fala de descanso" }] }, { type: "long", charges, classRefs: [] }, reads())
        expect(decisions.refusals.get("rage")).toBe("a descrição não fala de descanso")
        expect(() => interpretRestPrep({ cargas: "x" }, { type: "long", charges, classRefs: [] }, reads())).toThrow(RestPrepFormatError)
    })
})
