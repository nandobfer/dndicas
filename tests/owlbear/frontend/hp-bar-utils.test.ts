import { describe, expect, it } from "vitest"
import { getHpBarColor, hpPercent } from "@/features/owlbear/hp-bar-utils"

describe("hpPercent", () => {
    it("retorna 100 quando HP está cheio", () => {
        expect(hpPercent(20, 20)).toBe(100)
    })

    it("retorna 0 quando HP é zero", () => {
        expect(hpPercent(0, 20)).toBe(0)
    })

    it("retorna 50 quando HP está na metade", () => {
        expect(hpPercent(10, 20)).toBe(50)
    })

    it("clampeia em 0 quando HP é negativo", () => {
        expect(hpPercent(-5, 20)).toBe(0)
    })

    it("clampeia em 100 quando HP excede o máximo", () => {
        expect(hpPercent(25, 20)).toBe(100)
    })

    it("retorna 0 quando o máximo é zero (evita divisão por zero)", () => {
        expect(hpPercent(0, 0)).toBe(0)
    })

    it("retorna 0 quando o máximo é negativo", () => {
        expect(hpPercent(5, -1)).toBe(0)
    })
})

describe("getHpBarColor", () => {
    it("retorna verde quando HP está cheio (100%)", () => {
        const color = getHpBarColor(20, 20)
        // Verde: rgb(52, 211, 153)
        expect(color).toBe("rgb(52, 211, 153)")
    })

    it("retorna vermelho escuro quando HP está em zero (0%)", () => {
        const color = getHpBarColor(0, 20)
        // Vermelho: rgb(88, 0, 0)
        expect(color).toBe("rgb(88, 0, 0)")
    })

    it("retorna amarelo quando HP está exatamente na metade (50%)", () => {
        const color = getHpBarColor(10, 20)
        // Amarelo: rgb(234, 179, 8)
        expect(color).toBe("rgb(234, 179, 8)")
    })

    it("retorna cor entre vermelho e amarelo quando HP está em 25%", () => {
        const color = getHpBarColor(5, 20)
        // Interpolação entre vermelho e amarelo a 50% do caminho
        // from=[88,0,0] to=[234,179,8] at 0.5 → rgb(161, 90, 4)
        expect(color).toBe("rgb(161, 90, 4)")
    })

    it("retorna cor entre amarelo e verde quando HP está em 75%", () => {
        const color = getHpBarColor(15, 20)
        // Interpolação entre amarelo e verde a 50% do caminho
        // from=[234,179,8] to=[52,211,153] at 0.5 → rgb(143, 195, 81)
        expect(color).toBe("rgb(143, 195, 81)")
    })

    it("retorna vermelho escuro quando HP está zerado e max também (edge case)", () => {
        const color = getHpBarColor(0, 0)
        expect(color).toBe("rgb(88, 0, 0)")
    })

    it("clampeia overflow — HP maior que max retorna verde", () => {
        const color = getHpBarColor(30, 20)
        expect(color).toBe("rgb(52, 211, 153)")
    })
})
