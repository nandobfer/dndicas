import { describe, expect, it } from "vitest"
import { AI_AGENT_IDS, AI_AGENTS, contextChannelsFor, listOfChannel, opexMemoryAgentsFor } from "@/features/ai/agents"
import { memoriesSection } from "@/features/ai/memories-prompt"
import { isGeminiImageModel, isOpenaiImageModel } from "@/lib/ai/image"
import { buildImagePrompt } from "@/features/ai/server/image-generator"
import { entityImportSettingsSchema, imageGeneratorSettingsSchema, DEFAULT_IMAGE_GENERATOR_SETTINGS, DEFAULT_ENTITY_IMPORT_SETTINGS } from "@/features/ai/schemas"
import { buildEntityUnderstandingSystemInstruction } from "@/features/entity-understanding/services/entity-understanding-prompt"

describe("listas de memórias dos agentes", () => {
    it("tem as listas do Agente Opex e uma por agente do app", () => {
        expect([...AI_AGENT_IDS]).toEqual(["opex-global", "opex-admin", "opex-user", "image-generator", "entity-understanding", "entity-import", "maddox"])
        expect(AI_AGENT_IDS.map((id) => AI_AGENTS[id].channel)).toEqual([
            "dndicas/opex/global",
            "dndicas/opex/admin",
            "dndicas/opex/user",
            "dndicas/image-generator",
            "dndicas/entity-understanding",
            "dndicas/entity-import",
            "dndicas/maddox",
        ])
        expect(listOfChannel("dndicas/opex/admin")).toBe("opex-admin")
        expect(listOfChannel("dndicas/maddox/campanhas/abc/jogadores")).toBeNull()
    })

    it("as memórias de administradores só entram nos turnos de administradores", () => {
        expect(opexMemoryAgentsFor("admin")).toEqual(["opex-global", "opex-admin"])
        expect(opexMemoryAgentsFor("user")).toEqual(["opex-global", "opex-user"])
        expect(opexMemoryAgentsFor("anonymous")).toEqual(["opex-global", "opex-user"])
    })

    it("cada agente lê no contexto só os próprios canais (o Opex conforme o papel do turno)", () => {
        expect(contextChannelsFor("opex", "admin")).toEqual(["dndicas/opex/global", "dndicas/opex/admin"])
        expect(contextChannelsFor("opex", "user")).toEqual(["dndicas/opex/global", "dndicas/opex/user"])
        expect(contextChannelsFor("opex")).toEqual(["dndicas/opex/global", "dndicas/opex/user"])
        expect(contextChannelsFor("image-generator")).toEqual(["dndicas/image-generator"])
        expect(contextChannelsFor("entity-understanding")).toEqual(["dndicas/entity-understanding"])
        expect(contextChannelsFor("entity-import")).toEqual(["dndicas/entity-import"])
        expect(contextChannelsFor("maddox")).toEqual(["dndicas/maddox"])
    })
})

describe("agente Gerador de imagens", () => {
    it("reconhece os modelos de imagem do Gemini e da OpenAI", () => {
        expect(isGeminiImageModel("gemini-2.5-flash-image")).toBe(true)
        expect(isGeminiImageModel("imagen-4.0-generate-001")).toBe(true)
        expect(isGeminiImageModel("gemini-2.5-flash")).toBe(false)
        expect(isOpenaiImageModel("gpt-image-1")).toBe(true)
        expect(isOpenaiImageModel("gpt-4o")).toBe(false)
    })

    it("monta o prompt com instruções, memórias, proporção e o JSON inteiro do formulário", () => {
        const prompt = buildImagePrompt({ instructions: "Diretor de arte" }, "- Evite fundos brancos", { entityLabel: "Magia", formData: { name: "Bola de Fogo" } }, "16:9")
        expect(prompt).toContain("Diretor de arte")
        expect(prompt).toContain("Evite fundos brancos")
        expect(prompt).toContain("Proporção da arte: 16:9.")
        expect(prompt).toContain('"name": "Bola de Fogo"')
    })

    it("ativar exige provedor e modelo (sem fallback para o genai)", () => {
        expect(imageGeneratorSettingsSchema.safeParse(DEFAULT_IMAGE_GENERATOR_SETTINGS).success).toBe(true)
        const enabled = imageGeneratorSettingsSchema.safeParse({ ...DEFAULT_IMAGE_GENERATOR_SETTINGS, enabled: true })
        expect(enabled.success).toBe(false)
        expect(imageGeneratorSettingsSchema.safeParse({ ...DEFAULT_IMAGE_GENERATOR_SETTINGS, enabled: true, provider: "gemini", model: "gemini-2.5-flash-image" }).success).toBe(true)
    })
})

describe("agentes Entender com IA e Importador 5etools", () => {
    it("o Entender com IA usa as instruções configuradas, as memórias e mantém o formato de menção", () => {
        const instruction = buildEntityUnderstandingSystemInstruction("Seja breve.", "- Cite a página do livro")
        expect(instruction).toContain("Seja breve.")
        expect(instruction).toContain("Cite a página do livro")
        expect(instruction).toContain('data-type="mention"')
    })

    it("o Importador 5etools só ativa com provedor e modelo de texto", () => {
        expect(entityImportSettingsSchema.safeParse({ ...DEFAULT_ENTITY_IMPORT_SETTINGS, enabled: true }).success).toBe(false)
        expect(entityImportSettingsSchema.safeParse({ ...DEFAULT_ENTITY_IMPORT_SETTINGS, enabled: true, provider: "gemini", model: "gemini-2.5-flash" }).success).toBe(true)
    })

    it("memoriesSection fica vazio sem bloco e põe o bloco do Engramind sem alteração depois do cabeçalho", () => {
        expect(memoriesSection("")).toBe("")
        expect(memoriesSection("   ")).toBe("")
        const block = "## PROJECT_RULES\n- a\n- b"
        const section = memoriesSection(block)
        expect(section).toContain("## Memórias e instruções permanentes")
        expect(section.endsWith(block)).toBe(true)
    })
})
