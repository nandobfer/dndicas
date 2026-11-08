import { describe, expect, it } from "vitest"
import { DEFAULT_MADDOX_SETTINGS } from "@/features/maddox/schemas"
import { MADDOX_PROPOSAL_MARKER } from "@/features/maddox/constants"
import {
    buildConsolidationInstructions,
    buildInterviewInstructions,
    createMarkerFilter,
    extractProposal,
    transcriptText,
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
        expect(text).toContain("Mundo de fantasia D&D, oficial ou próprio, com povos e classes do catálogo do DnDicas")
        expect(buildInterviewInstructions(base())).toContain("nenhuma: jogo puramente narrativo")
    })

    it("seção fixa de universo por grau (Maddox 8), mesmo com instruções e guia editados sem a regra", () => {
        const of = (rigor: "narrativo" | "flexivel" | "equilibrado" | "rigoroso" | "fiel-dnd") => buildInterviewInstructions(base({ interviewerInstructions: "Sem regras.", script: { version: 1, guide: "Livre.", topics: [] }, campaign: { name: "X", rigor, setting: "", openingSituation: "" } }))
        expect(of("fiel-dnd")).toContain("## Universo, povos e classes")
        expect(of("fiel-dnd")).toContain("Os povos (raças) e as classes do mundo são SÓ os do catálogo do DnDicas")
        expect(of("rigoroso")).toContain("a ambientação pode ser própria, mas as raças, as classes, as subclasses e as origens dos personagens vêm do catálogo")
        for (const rigor of ["narrativo", "flexivel"] as const) expect(of(rigor)).toContain("qualquer universo, setting, estilo, raça ou classe vale, conforme o roteiro")
        expect(of("equilibrado")).toContain("qualquer universo, setting ou estilo vale, conforme o roteiro")
        for (const rigor of ["narrativo", "flexivel", "equilibrado", "rigoroso"] as const) expect(of(rigor)).not.toContain("## Povos e classes do mundo")
    })

    it("cenário do Fiel: seção dos povos e classes do mundo com a situação e, no OpenCode, o MCP e o token", () => {
        const text = buildInterviewInstructions(base({ campaign: { name: "X", rigor: "fiel-dnd", setting: "", openingSituation: "" }, world: { status: "- Povos (raças) deste mundo: Humano.", tools: { kind: "mcp", server: "dndicas-maddox", token: "tok-1" } } }))
        expect(text).toContain("## Povos e classes do mundo")
        expect(text).toContain("`update_world_options`")
        expect(text).toContain("### Mundo: situação atual\n- Povos (raças) deste mundo: Humano.")
        expect(text).toContain("do servidor MCP `dndicas-maddox`. Em TODA chamada envie `turno` com este valor exato: tok-1")
        // A entrevista de cenário nunca recebe a ficha.
        expect(text).not.toContain("## Construção da ficha")
    })

    it("personagem do Fiel lista os povos e as classes do mundo; o Rigoroso não", () => {
        const world = { races: [{ id: "r1", name: "Humano" }], classes: [] }
        const faithful = buildInterviewInstructions(base({ kind: "character", character: { name: "Lyra" }, campaign: { name: "X", rigor: "fiel-dnd", setting: "", openingSituation: "", worldCatalog: world } }))
        expect(faithful).toContain("O mundo desta campanha (definido na entrevista de cenário) só tem estes povos e classes")
        expect(faithful).toContain("  - Povos (raças) deste mundo: Humano.")
        expect(faithful).toContain("  - Classes deste mundo: todas as do catálogo do DnDicas.")
        const strict = buildInterviewInstructions(base({ kind: "character", character: { name: "Lyra" }, campaign: { name: "X", rigor: "rigoroso", setting: "", openingSituation: "", worldCatalog: world } }))
        expect(strict).not.toContain("deste mundo")
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

describe("nome do personagem (DND-31)", () => {
    it("sem nome, o entrevistador recebe a regra de perguntar e combinar o nome; com nome, não", () => {
        const unnamed = buildInterviewInstructions(base({ kind: "character", character: { name: null } }))
        expect(unnamed).toContain("## Nome do personagem")
        expect(unnamed).toContain('Personagem do jogador: "a definir"')
        const named = buildInterviewInstructions(base({ kind: "character", character: { name: "Lyra" } }))
        expect(named).not.toContain("## Nome do personagem")
        expect(named).toContain('Personagem do jogador: "Lyra"')
        expect(buildInterviewInstructions(base())).not.toContain("## Nome do personagem")
    })

    it("a consolidação do personagem exige o nome combinado", () => {
        expect(buildConsolidationInstructions(base({ kind: "character" }), false)).toContain("O nome do personagem é obrigatório")
        expect(buildConsolidationInstructions(base(), false)).not.toContain("O nome do personagem é obrigatório")
    })
})

describe("consolidação", () => {
    it("pede JSON do cenário com as seções e o nome; do personagem com a ficha só quando aplicável", () => {
        const scenario = buildConsolidationInstructions(base(), false)
        expect(scenario).toContain('"openingSituation"')
        expect(scenario).toContain('"campaignName"')
        const withSheet = buildConsolidationInstructions(base({ kind: "character" }), true)
        // A parte mecânica vem das ferramentas: a consolidação só descreve (aparência, história, personalidade).
        expect(withSheet).not.toContain('"attributes"')
        expect(withSheet).not.toContain('"race"')
        for (const key of ['"appearance"', '"history"', '"personalityTraits"', '"ideals"', '"bonds"', '"flaws"']) expect(withSheet).toContain(key)
        expect(withSheet).toContain("NÃO a repita")
        expect(withSheet).toContain("sem a marcação {{Tipo:Nome}}")
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

describe("atributos na entrevista de personagem (Maddox 5)", () => {
    const character = (rigor: InterviewPromptContext["campaign"]["rigor"], abilities: InterviewPromptContext["abilities"] = null) =>
        buildInterviewInstructions(base({ kind: "character", character: { name: "Lyra" }, campaign: { name: "Brumas", rigor, setting: "Aethra", openingSituation: "" }, abilities }))

    it("nos graus com ficha: card como único caminho, sem números digitados, regra 72 − soma e bônus só sugerido", () => {
        for (const rigor of ["equilibrado", "rigoroso", "fiel-dnd"] as const) {
            const text = character(rigor)
            expect(text).toContain("## Atributos do personagem")
            expect(text).toContain("`request_ability_scores`")
            expect(text).toContain("Nunca peça ao jogador que digite números, nunca role dados nem invente valores por ele.")
            expect(text).toContain("cinco rolagens de 4d6 descartando o menor dado, e a sexta pontuação é 72 menos a soma das cinco")
            expect(text).toContain("15, 14, 13, 12, 10 e 8")
            expect(text).toContain("27 pontos")
            expect(text).toContain("Bônus do antecedente (sugira, não é obrigatório)")
            expect(text).toContain("`apply_ability_bonus`")
            expect(text).toContain("`get_ability_scores`")
        }
    })

    it("Narrativo, Flexível e o cenário não recebem a seção", () => {
        expect(character("narrativo")).not.toContain("## Atributos do personagem")
        expect(character("flexivel")).not.toContain("## Atributos do personagem")
        expect(buildInterviewInstructions(base({ campaign: { name: "B", rigor: "fiel-dnd", setting: "", openingSituation: "" } }))).not.toContain("## Atributos do personagem")
    })

    it("traz a situação atual; pelo MCP, o servidor e o token de turno da entrevista", () => {
        const sdk = character("fiel-dnd", { status: "Atributos enviados (Rolagem): Força 8", tools: { kind: "ai-sdk" } })
        expect(sdk).toContain("### Atributos: situação atual\nAtributos enviados (Rolagem): Força 8")
        expect(sdk).not.toContain("turno")
        const mcp = character("fiel-dnd", { status: "Card aberto", tools: { kind: "mcp", server: "dndicas-maddox", token: "tok.123" } })
        expect(mcp).toContain("servidor MCP `dndicas-maddox`")
        expect(mcp).toContain("envie `turno` com este valor exato: tok.123")
    })

    it("catálogo: consultar antes de sugerir, com a regra de cada grau; fora dos graus com ficha e no cenário não aparece", () => {
        for (const rigor of ["rigoroso", "fiel-dnd"] as const) {
            const text = character(rigor)
            expect(text).toContain("## Catálogo do DnDicas")
            expect(text).toContain("consulte `search_catalog`")
            expect(text).toContain("`get_catalog_entity`")
            expect(text).toContain("Nunca use nomes de memória ou de outras edições do D&D.")
            expect(text).toContain("a raça, a classe, a subclasse e a origem do personagem precisam ser do catálogo")
            // O catálogo vem antes dos atributos (a origem é conferida antes do bônus).
            expect(text.indexOf("## Catálogo do DnDicas")).toBeLessThan(text.indexOf("## Atributos do personagem"))
            expect(text).toContain("confira a origem com `search_catalog` e os atributos sugeridos com `get_catalog_entity`")
        }
        const balanced = character("equilibrado")
        expect(balanced).toContain("prefira o catálogo")
        expect(balanced).not.toContain("precisam ser do catálogo")
        expect(character("narrativo")).not.toContain("## Catálogo do DnDicas")
        expect(character("flexivel")).not.toContain("## Catálogo do DnDicas")
        expect(buildInterviewInstructions(base({ campaign: { name: "B", rigor: "fiel-dnd", setting: "", openingSituation: "" } }))).not.toContain("## Catálogo do DnDicas")
    })

    it("pelo MCP, as instruções listam também as ferramentas de catálogo", () => {
        const mcp = character("fiel-dnd", { status: "Card aberto", tools: { kind: "mcp", server: "dndicas-maddox", token: "tok.123" } })
        expect(mcp).toContain("`request_ability_scores`, `get_ability_scores`, `apply_ability_bonus`, `update_character_build`, `get_character_build`, `request_hit_points`, `search_catalog` e `get_catalog_entity` do servidor MCP `dndicas-maddox`")
    })

    it("a fala interna aparece como SISTEMA na transcrição; a consolidação avisa que os atributos vêm do card", () => {
        expect(transcriptText([{ role: "user", content: "[Sistema] Enviou", internal: true }, { role: "user", content: "Oi" }])).toBe("SISTEMA: [Sistema] Enviou\n\nJOGADOR: Oi")
        const context = base({ kind: "character", campaign: { name: "B", rigor: "fiel-dnd", setting: "", openingSituation: "" } })
        expect(buildConsolidationInstructions(context, true, true)).toContain("Os atributos vêm do card de atributos")
        expect(buildConsolidationInstructions(context, true, false)).not.toContain("Os atributos vêm do card de atributos")
    })
})

describe("nível inicial e construção da ficha (Maddox 5)", () => {
    const scenario = (rigor: InterviewPromptContext["campaign"]["rigor"]) => buildInterviewInstructions(base({ campaign: { name: "B", rigor, setting: "", openingSituation: "" } }))
    const character = (campaign: Partial<InterviewPromptContext["campaign"]>, build: InterviewPromptContext["build"] = null) =>
        buildInterviewInstructions(base({ kind: "character", character: { name: "Lyra" }, campaign: { name: "B", rigor: "fiel-dnd", setting: "Aethra", openingSituation: "", ...campaign }, build }))

    it("o cenário pergunta o nível por grau: número direto em Fiel, estágio adaptado ao cenário nos narrativos", () => {
        const faithful = scenario("fiel-dnd")
        expect(faithful).toContain("## Nível inicial da mesa")
        expect(faithful).toContain('Pergunte diretamente: "qual o nível inicial dos personagens (1 a 20)?"')
        expect(scenario("rigoroso")).toContain("Pergunte o número do nível inicial (1 a 20)")
        expect(scenario("equilibrado")).toContain("Ofereça estágios descritos na ficção do cenário, cada um com o nível correspondente")
        for (const rigor of ["narrativo", "flexivel"] as const) {
            const text = scenario(rigor)
            expect(text).toContain("## Estágio de experiência inicial da mesa")
            expect(text).toContain("acabou de se tornar aventureiro")
            expect(text).toContain("caçador recém-iniciado")
            expect(text).toContain('Nunca fale em "aventureiro" se o cenário não for desse tipo.')
            expect(text).not.toContain("1 a 20")
        }
    })

    it("a consolidação do cenário pede startingLevel nos graus com ficha e startingStage nos narrativos", () => {
        expect(buildConsolidationInstructions(base({ campaign: { name: "B", rigor: "fiel-dnd", setting: "", openingSituation: "" } }), false)).toContain('"startingLevel"')
        const narrative = buildConsolidationInstructions(base({ campaign: { name: "B", rigor: "narrativo", setting: "", openingSituation: "" } }), false)
        expect(narrative).toContain('"startingStage"')
        expect(narrative).not.toContain('"startingLevel"')
    })

    it("o personagem confirma o nível da mesa; sem nível definido, pergunta pelo grau", () => {
        expect(character({ startingLevel: 3 })).toContain("A mesa começa no nível 3")
        expect(character({ startingLevel: null })).toContain("A mesa ainda não definiu o nível inicial: pergunte ao jogador.")
        expect(character({ rigor: "narrativo", startingStage: "caçadores recém-iniciados" })).toContain("A mesa começa neste estágio: caçadores recém-iniciados.")
    })

    it("graus com ficha recebem a construção da ficha com as ferramentas e a situação; narrativos e cenário não", () => {
        const text = character({}, { status: "- Já gravado: nada ainda.\n- Falta: raça." })
        expect(text).toContain("## Construção da ficha")
        expect(text).toContain("grave com `update_character_build`")
        expect(text).toContain("`request_hit_points`")
        expect(text).toContain("consulte `get_character_build`: só apresente a síntese com `faltando` vazio")
        expect(text).toContain("### Ficha: situação atual\n- Já gravado: nada ainda.\n- Falta: raça.")
        expect(text.indexOf("## Construção da ficha")).toBeLessThan(text.indexOf("## Atributos do personagem"))
        expect(character({ rigor: "narrativo" })).not.toContain("## Construção da ficha")
        expect(scenario("fiel-dnd")).not.toContain("## Construção da ficha")
    })
})

