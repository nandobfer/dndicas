import { describe, expect, it } from "vitest"
import { buildNarratorInstructions, judgesFreeActionsInNarration, narratorTaskText, narratorTranscript, type NarratorPromptContext } from "@/features/maddox/server/narrator-prompt"

const context = (overrides: Partial<NarratorPromptContext> = {}): NarratorPromptContext => ({
    instructions: "Você é Maddox.",
    agentMemories: [],
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
        expect(text).not.toContain("servidor MCP")
    })

    it("memórias do agente entram logo depois das instruções da aba", () => {
        const text = buildNarratorInstructions(context({ agentMemories: ["Nunca mate um personagem sem aviso."] }), { kind: "ai-sdk" })
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
