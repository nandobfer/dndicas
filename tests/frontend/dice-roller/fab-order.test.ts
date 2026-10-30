import { describe, expect, it } from "vitest"
import { DEFAULT_FAB_ORDER, FAB_MOUSE_ACTIVATION, FAB_TOUCH_ACTIVATION, moveFab, normalizeFabOrder, parseStoredFabOrder } from "@/features/dice-roller/components/fab-order"

describe("ordem dos botões flutuantes", () => {
    it("começa em Dados → Agente Opex → Busca", () => {
        expect(DEFAULT_FAB_ORDER).toEqual(["dice", "opex", "search"])
    })

    it("aceita uma permutação válida salva", () => {
        expect(parseStoredFabOrder(JSON.stringify(["search", "dice", "opex"]))).toEqual(["search", "dice", "opex"])
    })

    it.each([
        ["vazio", null],
        ["JSON quebrado", "{"],
        ["botão que não existe mais", JSON.stringify(["dice", "opex", "chat"])],
        ["botão faltando", JSON.stringify(["dice", "opex"])],
        ["botão duplicado", JSON.stringify(["dice", "dice", "search"])],
        ["formato antigo", JSON.stringify({ dice: 0 })],
    ])("volta ao padrão com valor %s", (_label, raw) => {
        expect(parseStoredFabOrder(raw)).toEqual(["dice", "opex", "search"])
    })

    it("normaliza sem alterar a entrada", () => {
        const input = ["opex", "search", "dice"]
        expect(normalizeFabOrder(input)).toEqual(input)
        expect(normalizeFabOrder(input)).not.toBe(input)
    })

    it("reordena entre os visíveis", () => {
        expect(moveFab(["dice", "opex", "search"], ["dice", "opex", "search"], "search", "dice")).toEqual(["search", "dice", "opex"])
        expect(moveFab(["dice", "opex", "search"], ["dice", "opex", "search"], "dice", "search")).toEqual(["opex", "search", "dice"])
    })

    it("mantém o botão oculto na posição salva", () => {
        // Busca oculta (Início): trocar Dados e Opex não mexe na posição dela.
        expect(moveFab(["dice", "search", "opex"], ["dice", "opex"], "opex", "dice")).toEqual(["opex", "search", "dice"])
    })

    it("não muda nada ao soltar fora da linha ou sobre si mesmo", () => {
        expect(moveFab(["opex", "dice", "search"], ["opex", "dice", "search"], "dice", null)).toEqual(["opex", "dice", "search"])
        expect(moveFab(["opex", "dice", "search"], ["opex", "dice", "search"], "dice", "dice")).toEqual(["opex", "dice", "search"])
    })

    it("só arrasta depois de mover o mouse e, no toque, de segurar", () => {
        expect(FAB_MOUSE_ACTIVATION.distance).toBeGreaterThanOrEqual(5)
        expect(FAB_TOUCH_ACTIVATION.delay).toBeGreaterThanOrEqual(200)
        expect(FAB_TOUCH_ACTIVATION.tolerance).toBeGreaterThan(0)
    })
})
