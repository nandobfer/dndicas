import { describe, expect, it } from "vitest"
import { DEFAULT_MADDOX_SETTINGS } from "@/features/maddox/schemas"
import { MADDOX_PROPOSAL_MARKER } from "@/features/maddox/constants"
import {
    buildConsolidationInstructions,
    buildInterviewInstructions,
    createMarkerFilter,
    extractProposal,
    parseJsonObject,
    settingMarkdown,
    type InterviewPromptContext,
} from "@/features/maddox/server/interview-prompt"
import { resolveInterviewerModel } from "@/features/maddox/server/interviews"

const base = (over: Partial<InterviewPromptContext> = {}): InterviewPromptContext => ({
    kind: "scenario",
    interviewerInstructions: "Você é o entrevistador.",
    script: {
        version: 3,
        guide: "# Guia de teste\nPergunte com calma.",
        topics: [
            { id: "b", text: "Tom da história", active: true },
            { id: "a", text: "Tópico desligado", active: false },
            { id: "c", text: "Universo escolhido", active: true },
        ],
    },
    campaign: { name: "Brumas", rigor: "narrativo", setting: "", openingSituation: "" },
    ...over,
})

describe("instruções da entrevista", () => {
    it("lista só os tópicos ativos, numerados na ordem do roteiro, com o guia da versão gravada", () => {
        const text = buildInterviewInstructions(base())
        expect(text).toContain("## Roteiro (versão 3)")
        expect(text).toContain("# Guia de teste")
        expect(text).toContain("1. Tom da história\n2. Universo escolhido")
        expect(text).not.toContain("Tópico desligado")
        expect(text.indexOf("Tom da história")).toBeLessThan(text.indexOf("Universo escolhido"))
        expect(text).toContain(MADDOX_PROPOSAL_MARKER)
    })

    it("leva o grau de rigor com as colunas das regras e do livre", () => {
        const text = buildInterviewInstructions(base({ campaign: { name: "X", rigor: "fiel-dnd", setting: "", openingSituation: "" } }))
        expect(text).toContain("Grau de rigor da campanha: Fiel ao D&D")
        expect(text).toContain("Só raças, classes, magias e itens cadastrados no DnDicas")
        expect(buildInterviewInstructions(base())).toContain("nenhuma: jogo puramente narrativo")
    })

    it("na entrevista de personagem inclui o cenário salvo, a situação inicial e os outros personagens", () => {
        const text = buildInterviewInstructions(
            base({ kind: "character", character: { name: "Lyra" }, otherCharacters: ["Borin"], campaign: { name: "X", rigor: "equilibrado", setting: "## Universo\nTerra média", openingSituation: "Numa taverna" } }),
        )
        expect(text).toContain('Personagem do jogador: "Lyra"')
        expect(text).toContain("Terra média")
        expect(text).toContain("Numa taverna")
        expect(text).toContain("- Borin")
        expect(text).toContain("ficha do D&D")
    })

    it("traz o formato fixo da resposta (Markdown, negrito para nomes do catálogo, citação) antes da conclusão", () => {
        const text = buildInterviewInstructions(base())
        expect(text).toContain("## Formato da resposta")
        expect(text).toContain("Responda em Markdown")
        expect(text).toContain("{{Tipo:Nome oficial em português}}")
        expect(text).toContain("{{Raça:Elfo}}")
        expect(text).toContain("Tipos aceitos: Regra, Habilidade, Talento, Raça, Classe, Subclasse, Origem, Magia, Item, Monstro")
        expect(text).toContain("menção clicável do catálogo")
        expect(text).toContain("Nunca use essa marcação para personagens, jogadores, lugares")
        expect(text).toContain("**Negrito** nunca vira menção")
        expect(text).toContain("citação (`>`)")
        expect(text).toContain("um título (`###`) por tópico")
        expect(text.indexOf("## Formato da resposta")).toBeLessThan(text.indexOf("## Conclusão"))
        expect(text).toContain(MADDOX_PROPOSAL_MARKER)
    })

    it("sem tópicos ativos segue só o guia", () => {
        expect(buildInterviewInstructions(base({ script: { version: 0, guide: "Guia", topics: [] } }))).toContain("não tem tópicos ativos")
    })
})

describe("marcador de proposta", () => {
    it("remove o marcador e indica a proposta", () => {
        expect(extractProposal(`Síntese pronta.\n${MADDOX_PROPOSAL_MARKER}`)).toEqual({ content: "Síntese pronta.", proposal: true })
        expect(extractProposal("Só uma pergunta?")).toEqual({ content: "Só uma pergunta?", proposal: false })
    })

    it("o filtro do stream nunca deixa o marcador passar, mesmo partido entre deltas", () => {
        const filter = createMarkerFilter()
        const pieces = ["Confirma? ", "\n[[MADDOX_PRO", "POSTA_DE_CONC", "LUSAO]]"]
        const out = pieces.map((piece) => filter.push(piece)).join("") + filter.flush()
        expect(out).toBe("Confirma? \n")
        expect(out).not.toContain("[[")
    })

    it("o filtro devolve colchetes que não formam o marcador", () => {
        const filter = createMarkerFilter()
        const out = filter.push("Veja [[nota") + filter.push("]] ok") + filter.flush()
        expect(out).toBe("Veja [[nota]] ok")
    })
})

describe("consolidação", () => {
    it("pede JSON do cenário com as seções e o nome; do personagem com a ficha só quando aplicável", () => {
        const scenario = buildConsolidationInstructions(base(), false)
        expect(scenario).toContain('"openingSituation"')
        expect(scenario).toContain('"campaignName"')
        const withSheet = buildConsolidationInstructions(base({ kind: "character" }), true)
        expect(withSheet).toContain('"attributes"')
        expect(buildConsolidationInstructions(base({ kind: "character" }), false)).toContain('"sheet": null')
    })

    it("extrai o JSON mesmo com cerca de código e texto ao redor", () => {
        expect(parseJsonObject('Aqui:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 })
        expect(() => parseJsonObject("sem json")).toThrow()
    })

    it("monta o Markdown do cenário com as seções e o padrão para o que ficou em aberto", () => {
        const md = settingMarkdown({ universo: "Mundo de Aethra", canone: "", contexto: "", regras: "", tom: "Sombrio" })
        expect(md).toContain("## Universo e referências\nMundo de Aethra")
        expect(md).toContain("## Cânone e adaptações\na definir durante a história")
        expect(md).toContain("## Tom e preferências narrativas\nSombrio")
    })
})

describe("modelo do entrevistador", () => {
    const main = { provider: "gemini" as const, model: "gemini-pro", agent: null, variant: null, temperature: 0.7, maxOutputTokens: 4000 }
    it("'Mesmo do Maddox' usa o modelo principal com a amostragem dele", () => {
        expect(resolveInterviewerModel({ ...DEFAULT_MADDOX_SETTINGS, main })).toEqual({ ...main })
    })
    it("com provedor próprio usa o do entrevistador, sem amostragem", () => {
        const interviewer = { provider: "opencode" as const, model: "anthropic/claude", agent: "build", variant: null }
        expect(resolveInterviewerModel({ ...DEFAULT_MADDOX_SETTINGS, main, interviewer })).toEqual({ ...interviewer, temperature: null, maxOutputTokens: null })
    })
    it("sem modelo configurado devolve null", () => {
        expect(resolveInterviewerModel(DEFAULT_MADDOX_SETTINGS)).toBeNull()
    })
})
