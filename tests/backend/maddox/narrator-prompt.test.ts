import { describe, expect, it } from "vitest"
import {
    buildNarratorInstructions,
    checkResultLine,
    combatDifficultyLine,
    combatDifficultyReinforcementLine,
    judgesFreeActionsInNarration,
    narratorTaskText,
    narratorTranscript,
    sceneImagesRule,
    tacticalCombatRule,
    tacticalTaskLines,
    usesChecks,
    usesCombat,
    type NarratorCheckResult,
    type NarratorPromptContext,
} from "@/features/maddox/server/narrator-prompt"
import { remindersTaskSection } from "@/features/maddox/server/reminders"

const context = (overrides: Partial<NarratorPromptContext> = {}): NarratorPromptContext => ({
    instructions: "Você é Maddox.",
    agentMemories: "",
    rigor: "narrativo",
    campaignName: "Brumas",
    setting: "## Universo\nPorto na névoa.",
    openingSituation: "O farol apagou.",
    state: { scene: "Cais", location: "Porto", situation: "", pendingDecision: "Seguir o faroleiro?" },
    characters: [{ name: "Lyra", playerName: "Ana", profile: { capacidades: "Arqueira." }, currentState: "" }],
    npcs: [{ name: "Bartolomeu", status: "active", visibility: "players", publicDescription: "Faroleiro.", masterNotes: "Mente sobre o farol." }],
    memories: [
        { kind: "missao", title: "Reacender o farol", text: "Descobrir a causa.", visibility: "players", status: "ativa" },
        { kind: "fato", title: "Contrabando", text: "Há contrabando no porto.", visibility: "master", status: null },
    ],
    ...overrides,
})

describe("instruções do Maddox narrador", () => {
    it("traz as regras do narrador, o modo narrativo puro e o estado gravado (com o que é segredo do mestre marcado)", () => {
        const text = buildNarratorInstructions(context(), { kind: "ai-sdk" })
        expect(text.startsWith("Você é Maddox.")).toBe(true)
        expect(text).toContain("Sentir não é decidir")
        expect(text).toContain("Não use dados, rolagens, testes numéricos")
        expect(text).toContain('# Campanha "Brumas"')
        expect(text).toContain("- Local: Porto")
        expect(text).toContain("- Decisão aguardada: Seguir o faroleiro?")
        expect(text).toContain("### Lyra (jogador: Ana)")
        expect(text).toContain("- Capacidades e limitações: Arqueira.")
        expect(text).toContain("**Bartolomeu** (active): Faroleiro. — [SÓ O MESTRE] Mente sobre o farol.")
        expect(text).toContain("**Reacender o farol** [ativa]: Descobrir a causa.")
        expect(text).toContain("**Contrabando** [SÓ O MESTRE]")
        expect(text).toContain("update_campaign_state")
        expect(text).toContain("até uns 3.000 caracteres")
        expect(text).toContain("Se o retorno trouxer `truncated`")
        expect(text).not.toContain("servidor MCP")
    })

    it("avisa que estado, condição dos personagens e anotações públicas aparecem no Diário da campanha (Maddox 9)", () => {
        const text = buildNarratorInstructions(context(), { kind: "ai-sdk" })
        expect(text).toContain("Os jogadores consultam no Diário da campanha o estado da história (`update_campaign_state`), a condição dos personagens (`update_character_state`)")
        expect(text).toContain("Nunca ponha segredos nesses campos")
        // Lembrete a cada turno, junto do próprio estado (além da regra de persistência).
        const stateBlock = text.slice(text.indexOf("## Estado atual da história"))
        expect(stateBlock.split("\n")[1]).toContain("Os jogadores leem este estado e a condição de cada personagem no Diário da campanha")
    })

    it("memórias do agente entram logo depois das instruções da aba", () => {
        const text = buildNarratorInstructions(context({ agentMemories: "- Nunca mate um personagem sem aviso." }), { kind: "ai-sdk" })
        expect(text).toContain("- Nunca mate um personagem sem aviso.")
    })

    it.each(["narrativo", "flexivel", "equilibrado"] as const)("%s julga a ação impossível na narração", (rigor) => {
        expect(judgesFreeActionsInNarration(rigor)).toBe(true)
        expect(buildNarratorInstructions(context({ rigor }), { kind: "ai-sdk" })).toContain("## Ações impossíveis")
    })

    it.each(["rigoroso", "fiel-dnd"] as const)("%s valida ao declarar (sem a regra de tentativa frustrada)", (rigor) => {
        expect(judgesFreeActionsInNarration(rigor)).toBe(false)
        expect(buildNarratorInstructions(context({ rigor }), { kind: "ai-sdk" })).not.toContain("## Ações impossíveis")
    })

    it("no OpenCode, as ferramentas vêm do MCP com o token de turno", () => {
        const text = buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "tok.sig" })
        expect(text).toContain("servidor MCP `dndicas-maddox`")
        expect(text).toContain("envie o campo `turno` exatamente com este valor: `tok.sig`")
    })

    it("sem estado gravado, avisa que a história está começando", () => {
        const text = buildNarratorInstructions(context({ state: { scene: "", location: "", situation: "", pendingDecision: "" }, npcs: [], memories: [] }), { kind: "ai-sdk" })
        expect(text).toContain("(ainda não registrado: a história está começando)")
        expect(text).not.toContain("## NPCs")
    })
})

describe("tarefa e transcrição do narrador", () => {
    it("abertura, turno com declarações e resposta sem avançar a cena", () => {
        expect(narratorTaskText({ kind: "narration", turnNumber: 1, declarations: [] })).toContain("Abertura da campanha")
        const turn = narratorTaskText({
            kind: "narration",
            turnNumber: 3,
            declarations: [
                { characterName: "Lyra", kind: "declaration", content: "Atiro uma flecha.", skipped: false },
                { characterName: "Doran", kind: "pass", content: "", skipped: true },
            ],
        })
        expect(turn).toContain("# Turno 3 do mestre")
        expect(turn).toContain("- **Lyra**: Atiro uma flecha.")
        expect(turn).toContain("- **Doran**: não fez nada (o dono pulou a vez do jogador).")
        const answer = narratorTaskText({ kind: "answer", turnNumber: 3, characterName: "Lyra", question: "Há guardas?", declarations: [] })
        expect(answer).toContain("**Lyra** pergunta: Há guardas?")
        expect(answer).toContain("NÃO avance a cena")
    })

    it("transcrição em ordem cronológica, cortada pelas mais antigas", () => {
        const messages = [
            { turnNumber: 1, kind: "narration" as const, characterName: null, content: "A".repeat(50) },
            { turnNumber: 1, kind: "declaration" as const, characterName: "Lyra", content: "Ajo." },
            { turnNumber: 2, kind: "narration" as const, characterName: null, content: "Segue." },
        ]
        const full = narratorTranscript(messages, 10_000)
        expect(full.indexOf("Turno 1 — Maddox narra")).toBeLessThan(full.indexOf("Turno 2 — Maddox narra"))
        expect(full).toContain("[Turno 1 — Lyra declara] Ajo.")
        const cut = narratorTranscript(messages, 60)
        expect(cut).not.toContain("AAAA")
        expect(cut).toContain("Segue.")
    })
})

describe("fichas e testes no prompt (Maddox 5)", () => {
    const result = (overrides: Partial<NarratorCheckResult> = {}): NarratorCheckResult => ({
        characterName: "Lyra",
        title: "Furtividade (Destreza)",
        reason: "Passar pelos guardas",
        dc: 15,
        status: "rolled",
        mode: "normal",
        total: 17,
        d20: 12,
        discarded: null,
        modifier: 5,
        rolledByOwner: false,
        cancelReason: null,
        ...overrides,
    })

    it("graus com ficha trocam o modo narrativo pela regra dos testes, na frequência do grau, e mostram o resumo da ficha", () => {
        for (const rigor of ["equilibrado", "rigoroso", "fiel-dnd"] as const) {
            const text = buildNarratorInstructions(context({ rigor, characters: [{ name: "Lyra", playerName: "Ana", profile: {}, currentState: "", sheet: "Nível 1 · Ladina\nPerícias treinadas: Furtividade +5" }] }), { kind: "ai-sdk" })
            expect(text).toContain("## Fichas e testes")
            expect(text).toContain("`request_check`")
            expect(text).toContain("NUNCA role dados nem invente resultados")
            expect(text).not.toContain("## Modo narrativo")
            expect(text).toContain("- Ficha D&D:\n  - Nível 1 · Ladina\n  - Perícias treinadas: Furtividade +5")
        }
        expect(buildNarratorInstructions(context({ rigor: "equilibrado" }), { kind: "ai-sdk" })).toContain("só nos momentos decisivos")
        expect(buildNarratorInstructions(context({ rigor: "fiel-dnd" }), { kind: "ai-sdk" })).toContain("exatamente como nas regras do D&D 2024")
        for (const rigor of ["narrativo", "flexivel"] as const) {
            const text = buildNarratorInstructions(context({ rigor }), { kind: "ai-sdk" })
            expect(text).toContain("## Modo narrativo")
            expect(text).not.toContain("request_check")
        }
        expect(usesChecks("flexivel")).toBe(false)
        expect(usesChecks("equilibrado")).toBe(true)
    })

    it("no MCP, a lista de ferramentas só inclui request_check quando os testes valem", () => {
        expect(buildNarratorInstructions(context({ rigor: "fiel-dnd" }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", checks: true })).toContain("update_character_state, update_character_hit_points, resolve_reminder, request_check, promover_npc_opex, desfazer_npc_opex, gravar_memoria_npc_opex, search_catalog, get_catalog_entity)")
        expect(buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", checks: false })).not.toContain("request_check")
    })

    it("linha do resultado: total, d20, modificador, vantagem, natural, dono no lugar, cancelado e pendente", () => {
        expect(checkResultLine(result())).toBe("Lyra — Furtividade (Destreza), CD 15: total 17 (d20 12, modificador +5) — sucesso.")
        expect(checkResultLine(result({ mode: "advantage", d20: 20, discarded: 4, total: 25 }))).toBe("Lyra — Furtividade (Destreza), CD 15: total 25 (d20 20, modificador +5; vantagem: 20 e 4; 20 natural) — sucesso.")
        expect(checkResultLine(result({ d20: 1, total: 6, modifier: 5, rolledByOwner: true }))).toContain("1 natural; rolado pelo dono no lugar do jogador) — falha.")
        // 20 natural abaixo da CD ainda passa; 1 natural acima dela ainda falha.
        expect(checkResultLine(result({ d20: 20, total: 24, modifier: 4, dc: 30 }))).toMatch(/20 natural\) — sucesso\.$/)
        expect(checkResultLine(result({ d20: 1, total: 16, modifier: 15 }))).toMatch(/1 natural\) — falha\.$/)
        expect(checkResultLine(result({ status: "cancelled", total: null, cancelReason: "O jogador saiu da campanha" }))).toBe("Lyra — Furtividade (Destreza), CD 15: cancelado (O jogador saiu da campanha); resolva sem o teste.")
        expect(checkResultLine(result({ status: "pending", total: null }))).toContain("aguardando a rolagem")
    })

    it("tarefa de continuação: resultados, declarações do turno e, na última rodada, sem novos testes", () => {
        const declarations = [{ characterName: "Lyra", kind: "declaration" as const, content: "Me esgueiro.", skipped: false, checkHint: true }]
        const text = narratorTaskText({ kind: "continuation", turnNumber: 3, round: 1, declarations, results: [result()] })
        expect(text).toContain("# Turno 3 do mestre — resultado dos testes")
        expect(text).toContain("- **Lyra**: Me esgueiro. _(o JEV indica que esta ação provavelmente exige teste; você decide)_")
        expect(text).toContain("- Lyra — Furtividade (Destreza), CD 15: total 17")
        expect(text).toContain("Continue a narração exatamente de onde parou")
        expect(text).toContain("Se a situação pedir um novo teste")
        expect(narratorTaskText({ kind: "continuation", turnNumber: 3, round: 2, declarations: [], results: [result()] })).toContain("último pedido de testes deste turno")
    })

    it("transcrição marca os testes", () => {
        const text = narratorTranscript([{ turnNumber: 2, kind: "check", characterName: "Lyra", content: "Lyra — Furtividade (Destreza), CD 15: total 17" }], 10_000)
        expect(text).toBe("[Turno 2 — teste] Lyra — Furtividade (Destreza), CD 15: total 17")
    })
})

describe("catálogo do DnDicas no narrador", () => {
    it("todos os graus têm a seção; nos graus com testes o catálogo decide, no narrativo é referência", () => {
        for (const rigor of ["narrativo", "flexivel", "equilibrado", "rigoroso", "fiel-dnd"] as const) {
            const text = buildNarratorInstructions(context({ rigor }), { kind: "ai-sdk" })
            expect(text).toContain("## Catálogo do DnDicas")
            expect(text).toContain("consulte `search_catalog` e `get_catalog_entity` antes de afirmar a mecânica")
            expect(text).toContain(usesChecks(rigor) ? "não invente regras nem entidades" : "a narrativa tem prioridade")
        }
    })

    it("Fiel ao D&D (Maddox 8): catálogo como fonte de verdade, NPCs só dos povos e classes do mundo; os demais graus não", () => {
        const world = { races: [{ id: "r1", name: "Humano" }, { id: "r2", name: "Anão" }], classes: [{ id: "c1", name: "Guerreiro" }] }
        const faithful = buildNarratorInstructions(context({ rigor: "fiel-dnd", worldCatalog: world }), { kind: "ai-sdk" })
        expect(faithful).toContain("Fiel ao D&D: as entidades de regras do catálogo são a fonte de verdade")
        expect(faithful).toContain("Onde não houver regra clara, você decide pelo seu julgamento.")
        expect(faithful).toContain("- Povos (raças) deste mundo: Humano, Anão.")
        expect(faithful).toContain("- Classes deste mundo: Guerreiro.")
        expect(buildNarratorInstructions(context({ rigor: "fiel-dnd" }), { kind: "ai-sdk" })).toContain("- Povos (raças) deste mundo: todos os do catálogo do DnDicas.")
        for (const rigor of ["narrativo", "flexivel", "equilibrado", "rigoroso"] as const) {
            const text = buildNarratorInstructions(context({ rigor, worldCatalog: world }), { kind: "ai-sdk" })
            expect(text).not.toContain("Fiel ao D&D: as entidades de regras")
            expect(text).not.toContain("deste mundo")
        }
    })

    it("no MCP, a lista de ferramentas inclui as de catálogo também sem testes", () => {
        expect(buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", checks: false })).toContain("update_character_state, update_character_hit_points, resolve_reminder, promover_npc_opex, desfazer_npc_opex, gravar_memoria_npc_opex, search_catalog, get_catalog_entity)")
    })
})


describe("combate narrativo no prompt (Maddox 6)", () => {
    const combat = { title: "Emboscada no cais", location: "Cais", masterTurns: 2, combatants: [{ name: "Varn", side: "inimigo" as const, quantity: 1, condition: "ferido", description: "Líder" }, { name: "Lobo", side: "aliado" as const, quantity: 2, condition: "", description: "" }] }

    it("só Narrativo, Flexível e Equilibrado têm a regra e o bloco do combate em andamento", () => {
        expect(["narrativo", "flexivel", "equilibrado", "rigoroso", "fiel-dnd"].map((rigor) => usesCombat(rigor as never))).toEqual([true, true, true, false, false])
        for (const rigor of ["narrativo", "flexivel", "equilibrado"] as const) {
            const text = buildNarratorInstructions(context({ rigor, combat }), { kind: "ai-sdk" })
            expect(text).toContain("## Combate narrativo")
            expect(text).toContain("`start_combat`")
            expect(text).toContain("## Combate em andamento: Emboscada no cais")
            expect(text).toContain("- **Varn**: Líder — condição: ferido")
            expect(text).toContain("- **Lobo** (2) [aliado] — condição: sem registro")
        }
        // Rigoroso e Fiel ao D&D: combate tático (Maddox 7), sem a regra nem o bloco do combate narrativo.
        for (const rigor of ["rigoroso", "fiel-dnd"] as const) {
            const text = buildNarratorInstructions(context({ rigor, combat, tacticalCombat: "## Combate tático em andamento: Cripta" }), { kind: "ai-sdk" })
            expect(text).not.toContain("## Combate narrativo")
            expect(text).not.toContain("## Combate em andamento:")
            expect(text).toContain("## Combate tático\n")
            expect(text).toContain("## Combate tático em andamento: Cripta")
            expect(text).toContain("O combate é TÁTICO")
            expect(text).toContain("`monster_action`")
        }
        expect(buildNarratorInstructions(context({ rigor: "fiel-dnd" }), { kind: "ai-sdk" })).toContain("SÓ monstros do catálogo")
        expect(buildNarratorInstructions(context({ rigor: "rigoroso" }), { kind: "ai-sdk" })).toContain("`estatisticas` próprias")
        // Equilibrado: testes nos golpes decisivos; Narrativo: sem dados.
        expect(buildNarratorInstructions(context({ rigor: "equilibrado" }), { kind: "ai-sdk" })).toContain("Testes só nos golpes decisivos")
        expect(buildNarratorInstructions(context({ rigor: "narrativo" }), { kind: "ai-sdk" })).toContain("Nada de dados nem testes")
    })

    it("sem combate não há bloco; luta longa ganha o lembrete de conduzir ao desfecho", () => {
        expect(buildNarratorInstructions(context({ combat: null }), { kind: "ai-sdk" })).not.toContain("## Combate em andamento")
        expect(buildNarratorInstructions(context({ combat }), { kind: "ai-sdk" })).not.toContain("conduza-a a um desfecho")
        expect(buildNarratorInstructions(context({ combat: { ...combat, masterTurns: 6 } }), { kind: "ai-sdk" })).toContain("A luta já dura 6 narrações: conduza-a a um desfecho")
    })

    it("MCP lista as ferramentas do combate só quando liberadas", () => {
        expect(buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", combat: true })).toContain("get_combat, start_combat, update_combat, end_combat")
        const toolsLine = (text: string) => text.split("\n").find((line) => line.includes("servidor MCP")) ?? ""
        expect(toolsLine(buildNarratorInstructions(context({ rigor: "rigoroso" }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", combat: false }))).not.toContain("start_combat")
        const tactical = toolsLine(buildNarratorInstructions(context({ rigor: "fiel-dnd" }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", combat: true, tactical: true }))
        expect(tactical).toContain("get_combat, start_combat, update_combat, end_combat, monster_action, apply_effect, request_damage_roll, offer_reaction")
    })

    it("tarefa leva a orientação do JEV e a transcrição mostra os cards do combate", () => {
        const declarations = [{ characterName: "Lyra", kind: "declaration" as const, content: "Ataco o guarda.", skipped: false }]
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations, combatHint: "start" })).toContain("provavelmente começam um combate")
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations, combatHint: "end" })).toContain("provavelmente encerram o combate")
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations })).not.toContain("JEV")
        const transcript = narratorTranscript([{ turnNumber: 2, kind: "combat", characterName: null, content: "combate começou: Briga" }], 1000)
        expect(transcript).toBe("[Turno 2 — combate começou: Briga]")
    })
})

describe("regra das imagens da cena (Maddox 10)", () => {
    const situations = [{ key: "new-location", label: "Novo local ou cenário", description: "O grupo chega a um lugar novo." }, { key: "ritual", label: "Ritual", description: "Um ritual grandioso." }]

    it("lista só as situações ativas, avisa a cota e o retrato; ausente sem situações", () => {
        const rule = sceneImagesRule({ situations, portraits: true, blocked: "Intervalo entre imagens: a próxima pode sair a partir do turno 6." })!
        expect(rule).toContain("## Imagens da cena")
        expect(rule).toContain("`new-location` — Novo local ou cenário: O grupo chega a um lugar novo.")
        expect(rule).toContain("`ritual` — Ritual")
        expect(rule).toContain("AGORA: Intervalo entre imagens: a próxima pode sair a partir do turno 6. Não peça imagem nesta narração.")
        expect(rule).toContain("save_npc { gerarRetrato: true }")
        expect(sceneImagesRule(null)).toBeNull()
        expect(sceneImagesRule({ situations: [], portraits: false, blocked: null })).toBeNull()
        const portraitsOnly = sceneImagesRule({ situations: [], portraits: true, blocked: null })!
        expect(portraitsOnly).not.toContain("request_scene_image")
        expect(portraitsOnly).toContain("gerarRetrato")
    })

    it("retrato automático (DND-43): avisa que o NPC conhecido ganha retrato sozinho, no lugar do gerarRetrato", () => {
        const auto = sceneImagesRule({ situations: [], portraits: true, autoPortraits: true, blocked: null })!
        expect(auto).toContain("ganha um retrato sozinho")
        expect(auto).not.toContain("save_npc { gerarRetrato: true }")
        expect(sceneImagesRule({ situations: [], portraits: false, autoPortraits: true, blocked: null })).toContain("ganha um retrato sozinho")
        expect(sceneImagesRule({ situations: [], portraits: true, autoPortraits: false, blocked: null })).toContain("save_npc { gerarRetrato: true }")
    })

    it("entra nas instruções e, no OpenCode, a ferramenta aparece na lista do MCP", () => {
        const withImages = buildNarratorInstructions(context({ sceneImages: { situations, portraits: false, blocked: null } }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", sceneImages: true })
        expect(withImages).toContain("## Imagens da cena")
        expect(withImages).toContain(", request_scene_image,")
        const without = buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t" })
        expect(without).not.toContain("## Imagens da cena")
        expect(without).not.toContain("request_scene_image")
    })
})

describe("densidade das narrações (DND-22)", () => {
    const declarations = [{ characterName: "Lyra", kind: "declaration" as const, content: "Abro a porta.", skipped: false }]
    const result: NarratorCheckResult = { characterName: "Lyra", title: "Furtividade (Destreza)", dc: 12, status: "rolled", total: 15, d20: 12, modifier: 3, mode: "normal", discarded: null, rolledByOwner: false, cancelReason: null } as unknown as NarratorCheckResult

    it("a narração, a abertura, a continuação e a vez dos adversários recebem o tamanho do nível escolhido", () => {
        const tasks = [
            narratorTaskText({ kind: "narration", turnNumber: 1, declarations: [] }, { density: "breve" }),
            narratorTaskText({ kind: "narration", turnNumber: 3, declarations }, { density: "breve" }),
            narratorTaskText({ kind: "continuation", turnNumber: 3, round: 1, declarations, results: [result] }, { density: "breve" }),
            narratorTaskText({ kind: "narration", turnNumber: 4, declarations: [], tactical: { phase: "running", queue: ["Goblin"], next: "Lyra", enemiesDown: false, charactersDown: false } }, { density: "breve" }),
        ]
        for (const text of tasks) {
            expect(text).toContain("densidade **Breve**")
            expect(text).toContain("1 a 2 parágrafos, umas 60 a 120 palavras")
        }
    })

    it("a resposta a uma pergunta não recebe a densidade (continua em poucas frases)", () => {
        const answer = narratorTaskText({ kind: "answer", turnNumber: 3, characterName: "Lyra", question: "Há guardas?", declarations: [] }, { density: "extensa" })
        expect(answer).not.toContain("densidade")
        expect(answer).toContain("em poucas frases")
    })

    it("cada nível pede um tamanho diferente e sem densidade a tarefa fica como antes", () => {
        const task = { kind: "narration" as const, turnNumber: 3, declarations }
        const texts = (["concisa", "breve", "equilibrada", "detalhada", "extensa"] as const).map((density) => narratorTaskText(task, { density }))
        expect(new Set(texts).size).toBe(5)
        expect(texts[0]).toContain("até umas 60 palavras")
        expect(texts[4]).toContain("4 a 7 parágrafos")
        expect(narratorTaskText(task)).not.toContain("Tamanho desta narração")
    })

    it("o formato das instruções não fixa mais parágrafos curtos (o tamanho vem da tarefa)", () => {
        const instructions = buildNarratorInstructions(context(), { kind: "ai-sdk" })
        expect(instructions).not.toContain("parágrafos curtos")
        expect(instructions).toContain("no tamanho pedido na tarefa")
    })
})

describe("dificuldade dos combates (DND-42)", () => {
    const levels = ["muito-facil", "facil", "equilibrado", "dificil", "mortal"] as const

    it("cada passo traz o rótulo e a própria orientação de balanceamento", () => {
        const lines = levels.map((level) => combatDifficultyLine(level))
        expect(new Set(lines).size).toBe(5)
        expect(lines[0]).toContain("(**Muito fácil**)")
        expect(lines[0]).toContain("BEM menos adversários")
        expect(lines[1]).toContain("(**Fácil**)")
        expect(lines[1]).toContain("no máximo 3 goblins contra 4 personagens de nível 1")
        expect(lines[1]).toContain("4 goblins bêbados ou sonolentos, com desvantagem nos ataques")
        expect(lines[2]).toContain("(**Equilibrado**)")
        expect(lines[2]).toContain("4 goblins contra 4 personagens de nível 1")
        expect(lines[3]).toContain("(**Difícil**)")
        expect(lines[3]).toContain("no limite do orçamento de XP")
        expect(lines[4]).toContain("(**Mortal**)")
        expect(lines[4]).toContain("risco real de morte")
    })

    it("exige motivo na ficção para enfraquecer adversários e proíbe penalizar todos em todo combate", () => {
        for (const level of levels) {
            const line = combatDifficultyLine(level)
            expect(line).toContain("só quando a cena justificar")
            expect(line).toContain("nunca enfraqueça todos os adversários em todo combate")
            expect(line).toContain("só do catálogo")
            expect(line).toContain("`start_combat`")
        }
    })

    it("vai nas narrações com a opção e nunca na resposta a uma pergunta; sem a opção a tarefa fica como antes", () => {
        const narration = narratorTaskText({ kind: "narration", turnNumber: 3, declarations: [] }, { combatDifficulty: "facil" })
        expect(narration).toContain("Dificuldade dos combates desta campanha (**Fácil**)")
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations: [] })).not.toContain("Dificuldade dos combates")
        const answer = narratorTaskText({ kind: "answer", turnNumber: 3, characterName: "Lyra", question: "Há guardas?", declarations: [] }, { combatDifficulty: "mortal" })
        expect(answer).not.toContain("Dificuldade dos combates")
    })

    it("com o combate tático em andamento a tarefa leva a versão curta, para os reforços (update_combat), no mesmo nível", () => {
        const tactical = { phase: "running" as const, queue: ["Goblin 1"], next: "Lyra", enemiesDown: false, charactersDown: false }
        const text = narratorTaskText({ kind: "narration", turnNumber: 4, declarations: [], tactical }, { combatDifficulty: "facil" })
        expect(text).toContain(combatDifficultyReinforcementLine("facil"))
        expect(text).toContain("Dificuldade dos combates desta campanha (**Fácil**)")
        expect(text).toContain("`update_combat`")
        expect(text).toContain("no máximo 3 goblins contra 4 personagens de nível 1")
        expect(text).toContain("nunca todos")
        expect(text).not.toContain(combatDifficultyLine("facil"))
        // Fora do combate vai a versão completa (abertura com start_combat).
        expect(narratorTaskText({ kind: "narration", turnNumber: 4, declarations: [] }, { combatDifficulty: "facil" })).toContain(combatDifficultyLine("facil"))
        expect(new Set((["muito-facil", "facil", "equilibrado", "dificil", "mortal"] as const).map((level) => combatDifficultyReinforcementLine(level))).size).toBe(5)
    })

    it("a regra do combate tático orienta a desvantagem do adversário enfraquecido pela ficção, sem penalizar todos", () => {
        for (const rigor of ["rigoroso", "fiel-dnd"] as const) {
            const rule = tacticalCombatRule(rigor)
            expect(rule).toContain("Adversário enfraquecido pela ficção")
            expect(rule).toContain('`modo: "desvantagem"`')
            expect(rule).toContain("nunca enfraqueça todos os adversários em todo combate")
        }
    })
})

describe("DND-25 — blocos do combate tático e lembranças no prompt", () => {
    const tactical = (block: NonNullable<Parameters<typeof tacticalTaskLines>[0]>["block"], extra: Partial<NonNullable<Parameters<typeof tacticalTaskLines>[0]>> = {}) => ({ phase: "running" as const, queue: ["Goblin 1", "Goblin 2"], next: "Lyra", enemiesDown: false, charactersDown: false, block, ...extra })

    it("narração da vez do personagem: nenhum adversário age e os blocos vêm depois", () => {
        const text = tacticalTaskLines(tactical({ kind: "character", actor: null, resumed: false, waits: 0, remaining: ["Goblin 1", "Goblin 2"] })).join("\n")
        expect(text).toContain("nesta narração NENHUM adversário age")
        expect(text).toContain("cada adversário age no próprio bloco, nesta ordem: Goblin 1, Goblin 2")
    })

    it("bloco de um NPC: só ele age, ferramentas antes do texto, e a tarefa ganha o título da vez dele", () => {
        const task = narratorTaskText({ kind: "continuation", turnNumber: 4, round: 1, declarations: [], results: [], combatResults: [], tactical: tactical({ kind: "npc", actor: "Goblin 1", resumed: false, waits: 0, remaining: ["Goblin 2"] }) })
        expect(task).toContain("# Turno 4 do mestre — vez de Goblin 1")
        expect(task).toContain("bloco de **Goblin 1**: SÓ ele age agora")
        expect(task).toContain("ANTES de escrever")
        expect(task).toContain("Depois dele, cada um no próprio bloco: Goblin 2")
        const last = tacticalTaskLines(tactical({ kind: "npc", actor: "Goblin 2", resumed: false, waits: 0, remaining: [] })).join("\n")
        expect(last).toContain("Depois dele é a vez de **Lyra**")
        // Continuação do mesmo bloco depois de uma reação: conclui o mesmo NPC com o resultado.
        const resumed = narratorTaskText({ kind: "continuation", turnNumber: 4, round: 2, declarations: [], results: [], combatResults: ["Lyra usou Escudo"], tactical: tactical({ kind: "npc", actor: "Goblin 1", resumed: true, waits: 1, remaining: [] }) })
        expect(resumed).toContain("Lyra usou Escudo")
        expect(resumed).toContain("Conclua a narração dele")
        expect(resumed).not.toContain("— vez de Goblin 1")
    })

    it("lembranças: id curto, personagem, texto e a orientação de avaliar cada uma (ficha prevalece nos graus táticos)", () => {
        const section = remindersTaskSection([{ id: "6aeea67b82ea9175dbde7df0", characterName: "Lyra", text: "Tenho  Alerta.\nNão sou surpreendida.", memory: null, decided: false }], true)
        expect(section).toContain("## Lembranças dos jogadores (considere nesta narração)")
        expect(section).toContain("- [de7df0] **Lyra**: Tenho Alerta. Não sou surpreendida.")
        expect(section).toContain("a ficha prevalece")
        expect(section).toContain("`resolve_reminder`")
        expect(remindersTaskSection([], true)).toBe("")
        expect(remindersTaskSection([{ id: "x1", characterName: "Doran", text: "Oi", memory: null, decided: false }], false)).not.toContain("ficha prevalece")
    })
})

describe("sugestões de ação (DND-30)", () => {
    const declarations = [{ characterName: "Lyra", kind: "declaration" as const, content: "Subo a escada.", skipped: false }]

    it("a linha do `suggest_actions` entra na abertura, no turno e na continuação quando pedida, e nunca na resposta", () => {
        expect(narratorTaskText({ kind: "narration", turnNumber: 1, declarations: [] }, { actionOptions: true })).toContain("chame `suggest_actions`")
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations }, { actionOptions: true })).toContain("chame `suggest_actions`")
        expect(narratorTaskText({ kind: "continuation", turnNumber: 3, round: 1, declarations, results: [] }, { actionOptions: true })).toContain("suggest_actions")
        expect(narratorTaskText({ kind: "narration", turnNumber: 3, declarations })).not.toContain("suggest_actions")
        expect(narratorTaskText({ kind: "answer", turnNumber: 3, characterName: "Lyra", question: "Há guardas?", declarations: [] }, { actionOptions: true })).not.toContain("suggest_actions")
        // Com densidade e sugestões, as duas linhas vêm depois da tarefa.
        const both = narratorTaskText({ kind: "narration", turnNumber: 3, declarations }, { density: "breve", actionOptions: true })
        expect(both.indexOf("Tamanho desta narração")).toBeLessThan(both.indexOf("suggest_actions"))
    })

    it("o bloco das ferramentas do MCP lista `suggest_actions` só quando oferecida", () => {
        expect(buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", actionOptions: true })).toContain(", suggest_actions,")
        expect(buildNarratorInstructions(context(), { kind: "mcp", server: "dndicas-maddox", turnToken: "t" })).not.toContain("suggest_actions")
    })
})

describe("NPCs Opex no prompt do narrador (DND-27)", () => {
    it("o NPC Opex é marcado no bloco dos NPCs e o MCP lista as ferramentas (a consulta só quando oferecida)", () => {
        const npcs = [{ name: "Gundren", status: "active", visibility: "players" as const, publicDescription: "Anão mercador.", masterNotes: "", opex: true }]
        expect(buildNarratorInstructions(context({ npcs }), { kind: "ai-sdk" })).toContain("- **Gundren** (active) [NPC Opex]: Anão mercador.")
        const mcp = buildNarratorInstructions(context({ npcs }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t", opexNpcs: true })
        expect(mcp).toContain("promover_npc_opex, desfazer_npc_opex, gravar_memoria_npc_opex, consultar_npc_opex")
        expect(buildNarratorInstructions(context({ npcs }), { kind: "mcp", server: "dndicas-maddox", turnToken: "t" })).not.toContain("consultar_npc_opex")
    })

    it("a tarefa das narrações traz a seção NPCs Opex com a regra de consultar; a resposta a perguntas, não", () => {
        const narration = narratorTaskText({ kind: "narration", turnNumber: 2, declarations: [] }, { opexNpcs: ["Gundren", "Strahd"] })
        expect(narration).toContain("## NPCs Opex\nNPCs Opex desta campanha: Gundren, Strahd.")
        expect(narration).toContain("chame `consultar_npc_opex` ANTES de narrar a fala ou a ação dele e siga a decisão")
        expect(narratorTaskText({ kind: "answer", turnNumber: 2, characterName: "Kael", question: "Quem é ele?", declarations: [] }, { opexNpcs: ["Gundren"] })).not.toContain("NPCs Opex")
        expect(narratorTaskText({ kind: "narration", turnNumber: 2, declarations: [] }, { opexNpcs: [] })).not.toContain("NPCs Opex")
    })

    it("no bloco do NPC Opex, a decisão do agente vai na tarefa (só no bloco não retomado)", () => {
        const decision = { npcName: "Klarg", action: "Cimitarra", targets: ["Kael"], speech: "" }
        const block = { kind: "npc" as const, actor: "Klarg", resumed: false, waits: 0, remaining: [], opexDecision: decision }
        const tactical = { phase: "running" as const, queue: ["Klarg"], next: "Kael", enemiesDown: false, charactersDown: false, block }
        expect(tacticalTaskLines(tactical).join("\n")).toContain("O NPC Opex Klarg decidiu: Cimitarra em Kael. Execute exatamente essa ação com `monster_action` e narre a partir dela.")
        expect(tacticalTaskLines({ ...tactical, block: { ...block, resumed: true } }).join("\n")).not.toContain("decidiu")
    })
})
