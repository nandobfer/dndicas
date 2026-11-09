import { describe, expect, it } from "vitest"
import { MADDOX_RIGOR_LEVELS, type MaddoxRigorLevel } from "@/features/maddox/constants"
import { firstFreeRigor, nextFreeRigorIndex, resolveInterviewerModel, resolveNarratorModel } from "@/features/maddox/model-resolution"
import { DEFAULT_MADDOX_SETTINGS, type MaddoxRigorModel, type MaddoxSettings } from "@/features/maddox/schemas"

const settings = (patch: Partial<MaddoxSettings> = {}): MaddoxSettings => ({
    ...DEFAULT_MADDOX_SETTINGS,
    enabled: true,
    main: { provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: "high", temperature: 0.7, maxOutputTokens: 4096 },
    ...patch,
})
const block = (rigor: MaddoxRigorLevel, patch: Partial<MaddoxRigorModel> = {}): MaddoxRigorModel => ({ rigor, provider: "opencode", model: "anthropic/claude", agent: "build", variant: "max", ...patch })
const DEFAULT_MAIN = { provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: "high", temperature: 0.7, maxOutputTokens: 4096 }

describe("modelo do Maddox por rigor (DND-32)", () => {
    it("sem blocos, narrador e entrevistador resolvem como antes em todos os níveis e sem rigor", () => {
        const value = settings()
        for (const rigor of [...MADDOX_RIGOR_LEVELS, null, undefined]) {
            expect(resolveNarratorModel(value, rigor)).toEqual(DEFAULT_MAIN)
            expect(resolveInterviewerModel(value, rigor)).toEqual(DEFAULT_MAIN)
        }
        const own = settings({ interviewer: { provider: "opencode", model: "anthropic/claude", agent: "build", variant: null } })
        expect(resolveInterviewerModel(own, "rigoroso")).toEqual({ provider: "opencode", model: "anthropic/claude", agent: "build", variant: null, temperature: null, maxOutputTokens: null })
    })

    it("sem provedor ou modelo padrão e sem bloco, não há modelo", () => {
        expect(resolveNarratorModel(DEFAULT_MADDOX_SETTINGS, "rigoroso")).toBeNull()
        expect(resolveInterviewerModel(DEFAULT_MADDOX_SETTINGS, "rigoroso")).toBeNull()
    })

    it("bloco do narrador vale só no próprio nível, com variante e agente; a amostragem do padrão só entra se o provedor a aceita", () => {
        const value = settings({ rigorModels: { main: [block("rigoroso")], interviewer: [], opexCharacter: [] } })
        expect(resolveNarratorModel(value, "rigoroso")).toEqual({ provider: "opencode", model: "anthropic/claude", agent: "build", variant: "max", temperature: null, maxOutputTokens: null })
        expect(resolveNarratorModel(value, "flexivel")).toEqual(DEFAULT_MAIN)
        expect(resolveNarratorModel(value, null)).toEqual(DEFAULT_MAIN)
        const sampling = settings({ rigorModels: { main: [block("narrativo", { provider: "anthropic", model: "claude", agent: null, variant: null })], interviewer: [], opexCharacter: [] } })
        expect(resolveNarratorModel(sampling, "narrativo")).toMatchObject({ provider: "anthropic", temperature: 0.7, maxOutputTokens: 4096 })
    })

    it("entrevistador: bloco próprio vence o provedor próprio e o do narrador", () => {
        const value = settings({
            interviewer: { provider: "gemini", model: "gemini-flash", agent: null, variant: null },
            rigorModels: { main: [block("rigoroso", { model: "anthropic/main" })], interviewer: [block("rigoroso", { model: "anthropic/interviewer" })], opexCharacter: [] },
        })
        expect(resolveInterviewerModel(value, "rigoroso")?.model).toBe("anthropic/interviewer")
        expect(resolveInterviewerModel(value, "narrativo")?.model).toBe("gemini-flash")
    })

    it("entrevistador com provedor próprio não herda o bloco do narrador", () => {
        const value = settings({ interviewer: { provider: "gemini", model: "gemini-flash", agent: null, variant: null }, rigorModels: { main: [block("rigoroso")], interviewer: [], opexCharacter: [] } })
        expect(resolveInterviewerModel(value, "rigoroso")).toEqual({ provider: "gemini", model: "gemini-flash", agent: null, variant: null, temperature: null, maxOutputTokens: null })
    })

    it("entrevistador em \"Mesmo do Maddox\" usa o modelo do narrador no mesmo rigor (bloco ou padrão com amostragem)", () => {
        const value = settings({ rigorModels: { main: [block("fiel-dnd")], interviewer: [], opexCharacter: [] } })
        expect(resolveInterviewerModel(value, "fiel-dnd")).toEqual(resolveNarratorModel(value, "fiel-dnd"))
        expect(resolveInterviewerModel(value, "fiel-dnd")?.model).toBe("anthropic/claude")
        expect(resolveInterviewerModel(value, "equilibrado")).toEqual(DEFAULT_MAIN)
    })

    it("configuração sem o campo novo (objeto antigo) e bloco incompleto caem no padrão", () => {
        const legacy = { ...settings(), rigorModels: undefined } as unknown as MaddoxSettings
        expect(resolveNarratorModel(legacy, "rigoroso")).toEqual(DEFAULT_MAIN)
        const partial = settings({ rigorModels: { main: [block("rigoroso", { model: null })], interviewer: [], opexCharacter: [] } })
        expect(resolveNarratorModel(partial, "rigoroso")).toEqual(DEFAULT_MAIN)
    })

    it("primeiro nível livre na ordem do slider", () => {
        expect(firstFreeRigor([])).toBe("narrativo")
        expect(firstFreeRigor(["narrativo", "equilibrado"])).toBe("flexivel")
        expect(firstFreeRigor([...MADDOX_RIGOR_LEVELS])).toBeNull()
    })

    it("slider: pula os níveis usados na direção do movimento e fica parado sem nível livre", () => {
        // Índices: narrativo 0, flexivel 1, equilibrado 2, rigoroso 3, fiel-dnd 4.
        expect(nextFreeRigorIndex(0, 1, [])).toBe(1)
        expect(nextFreeRigorIndex(0, 1, ["flexivel"])).toBe(2)
        expect(nextFreeRigorIndex(0, 4, ["fiel-dnd"])).toBe(0)
        expect(nextFreeRigorIndex(4, 1, ["flexivel", "narrativo"])).toBe(4)
        expect(nextFreeRigorIndex(4, 2, ["equilibrado"])).toBe(1)
        expect(nextFreeRigorIndex(2, 2, ["equilibrado"])).toBe(2)
    })
})
