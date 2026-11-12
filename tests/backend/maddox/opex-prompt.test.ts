import { describe, expect, it } from "vitest"
import {
    buildOpexInstructions,
    buildOpexNpcInstructions,
    opexCombatTask,
    opexMemoriesOf,
    opexNpcCombatSchema,
    opexNpcCombatTask,
    opexNpcSceneSchema,
    opexNpcSceneTask,
    opexTableActionSchema,
    opexTableTask,
    MADDOX_OPEX_NPC_ROLE_RULE,
    MADDOX_OPEX_ROLE_RULE,
    MADDOX_OPEX_MEMORY_RULE,
    MADDOX_OPEX_NPC_MEMORY_RULE,
    OPEX_OWNER_GUIDANCE_TITLE,
    opexMemorySchema,
} from "@/features/maddox/server/opex-prompt"
import { MADDOX_OPEX_MEMORIES_PER_TURN, MADDOX_OPEX_MEMORY_TEXT_EXPECTED, MADDOX_OPEX_MEMORY_TEXT_MAX, MADDOX_OPEX_MEMORY_TITLE_MAX } from "@/features/maddox/constants"

/** Prompts e contratos do Personagem Opex (DND-26), módulo puro. */

const context = {
    instructions: "Jogue em equipe.",
    ownerGuidance: "",
    memories: "- Desconfio de magos.",
    table: [{ name: "Brunna", kind: "opex" as const, self: true }],
    basePrompt: "Uma clériga anã chamada Brunna.",
    campaign: { name: "Brumas", rigor: "fiel-dnd" as const, setting: "Fantasia sombria.", openingSituation: "Numa taverna.", state: { scene: "A ponte", location: "", situation: "Goblins atacam.", pendingDecision: "" } },
    character: { name: "Brunna", profile: { identidade: "Clériga anã" }, currentState: "Ferida no braço.", sheet: "Nível 3 · Clériga" },
}

describe("instruções do Personagem Opex", () => {
    it("juntam as instruções da configuração, o papel de jogador, as memórias, a campanha, o personagem e o prompt base", () => {
        const text = buildOpexInstructions(context, { withMemoryRule: true })
        for (const part of ["Jogue em equipe.", MADDOX_OPEX_ROLE_RULE, MADDOX_OPEX_MEMORY_RULE, "- Desconfio de magos.", "Fantasia sombria.", "Goblins atacam.", "## Seu personagem: Brunna", "Ferida no braço.", "Nível 3 · Clériga", "Uma clériga anã chamada Brunna."]) expect(text).toContain(part)
        expect(text.indexOf("Jogue em equipe.")).toBe(0)
    })

    it("sem prompt base, o Opex decide tudo (inclusive o nome); sem memórias, a seção some", () => {
        const text = buildOpexInstructions({ ...context, basePrompt: "", memories: "", character: null })
        expect(text).toContain("você decide tudo, inclusive o nome")
        expect(text).not.toContain("## Memórias")
        expect(text).not.toContain(MADDOX_OPEX_MEMORY_RULE)
    })
})

describe("tarefa da mesa", () => {
    it("conta as perguntas restantes e devolve o motivo da recusa", () => {
        expect(opexTableTask({ turnNumber: 4, transcript: "x", questionsLeft: 2 })).toContain("restam 2 perguntas")
        expect(opexTableTask({ turnNumber: 4, transcript: "x", questionsLeft: 0 })).toContain("Você já usou as suas perguntas")
        expect(opexTableTask({ turnNumber: 4, transcript: "x", questionsLeft: 1, invalidReason: "Sem asas." })).toContain("Sem asas.")
    })

    it("o JSON aceita só as três ações e as memórias são cortadas sem invalidar a decisão", () => {
        expect(opexTableActionSchema.safeParse({ acao: "fugir" }).success).toBe(false)
        const parsed = opexTableActionSchema.parse({ acao: "declarar", texto: "Ataco.", memorias: Array.from({ length: 8 }, (_, index) => ({ titulo: `${"T".repeat(150)}${index}`, texto: "Algo." })) })
        const memories = opexMemoriesOf(parsed)
        expect(memories).toHaveLength(MADDOX_OPEX_MEMORIES_PER_TURN)
        expect(memories[0]!.title.length).toBeLessThanOrEqual(MADDOX_OPEX_MEMORY_TITLE_MAX)
    })

    it("o prompt informa o tamanho esperado da memória e o corte de proteção fica bem acima do limite do administrador", () => {
        expect(MADDOX_OPEX_MEMORY_RULE).toContain(`até ${MADDOX_OPEX_MEMORY_TEXT_EXPECTED} caracteres`)
        const long = "Frase completa. ".repeat(250).trim()
        expect(long.length).toBeGreaterThan(MADDOX_OPEX_MEMORY_TEXT_MAX)
        const [memory] = opexMemoriesOf(opexTableActionSchema.parse({ acao: "nada", memorias: [{ titulo: "Longa", texto: long }] }))
        expect(memory!.text).toBe(long)
    })
})

describe("tarefa do combate", () => {
    it("lista só as opções e os alvos dados, com a economia disponível", () => {
        const text = opexCombatTask({
            round: 2,
            situation: "Emboscada",
            options: [{ id: "weapon:machado", economy: "action", label: "Machado", detail: "+5", target: "inimigo" }, { id: "spell:cura", economy: "bonus", label: "Palavra curativa", detail: "", target: "aliado", levels: [1, 2] }],
            targets: [{ key: "m:goblin-1", name: "Goblin", side: "inimigo" }],
            economy: { action: true, bonus: false },
        })
        expect(text).toContain('id="weapon:machado"')
        expect(text).toContain("círculos: 1, 2")
        expect(text).toContain('"m:goblin-1": Goblin (inimigo)')
        expect(text).toContain("Disponível agora: Ação\n")
    })
})

describe("NPC Opex (DND-27)", () => {
    const npcContext = {
        instructions: "Interprete com coerência.",
        memories: "- Quem eu sou: Anão mercador.",
        npc: { name: "Gundren", publicDescription: "Anão mercador, primo dos Rockseeker." },
        campaign: context.campaign,
    }

    it("as instruções levam o papel de NPC (não de jogador), as memórias dos 2 canais, a campanha e o NPC", () => {
        const text = buildOpexNpcInstructions(npcContext)
        for (const part of ["Interprete com coerência.", MADDOX_OPEX_NPC_ROLE_RULE, "- Quem eu sou: Anão mercador.", "## Memórias (global dos NPCs Opex e as suas)", "Fantasia sombria.", "## Você é: Gundren", "primo dos Rockseeker"]) expect(text).toContain(part)
        expect(text).not.toContain(MADDOX_OPEX_ROLE_RULE)
        expect(text).not.toContain("Jogadores")
        expect(text).toContain("Você NÃO é um jogador nem o mestre")
    })

    it("a tarefa da cena leva a situação e a pergunta; o schema exige fala ou ação", () => {
        const task = opexNpcSceneTask({ situation: "O grupo chega à estrada.", question: "Você conhece o caminho?" })
        expect(task).toContain("O grupo chega à estrada.")
        expect(task).toContain("Você conhece o caminho?")
        expect(opexNpcSceneSchema.safeParse({ fala: "Olá!" }).success).toBe(true)
        expect(opexNpcSceneSchema.safeParse({ fala: " ", acao: "" }).success).toBe(false)
    })

    it("no combate, a ação precisa estar entre as opções (a grafia volta à da opção)", () => {
        const options = [{ name: "Cimitarra", detail: "ataque +4" }, { name: "Disparada", detail: "" }]
        const task = opexNpcCombatTask({ round: 2, situation: "Caverna.", options, targets: [{ name: "Kael", side: "personagem, do outro lado", health: "de pé" }] })
        expect(task).toContain('- "Cimitarra" — ataque +4')
        expect(task).toContain('- "Kael" (personagem, do outro lado; de pé)')
        const schema = opexNpcCombatSchema(options)
        expect(schema.safeParse({ acao: "cimitarra", alvos: ["Kael"] })).toMatchObject({ success: true, data: { acao: "Cimitarra", alvos: ["Kael"], fala: "", memorias: [] } })
        expect(schema.safeParse({ acao: "Bola de Fogo" }).success).toBe(false)
    })
})

describe("orientações do dono e quem está na mesa (DND-57)", () => {
    // Contexto real da DND-57: o canal global como o Engramind devolve, na campanha de Nala (humana) e Uther (Opex).
    const guidance = "## Memórias\n\n### PROJECT_RULES\n- [Diálogo] Deixe os jogadores conduzirem os diálogos. Apenas os apoiem quando necessário ou quando solicitado pelos jogadores.\n- [Coadjuvante] Deixe o holofote para os jogadores. Você é um coadjuvante: sirva apenas como ajudante e auxilie os protagonistas.\n- [Pode não fazer nada] Pode não fazer nada — quando quiser ou quando for conveniente, o agente pode pular a vez, declarando que não faz nada."
    const table = [
        { name: "Uther", kind: "opex" as const, self: true },
        { name: "Nala", kind: "human" as const, self: false },
        { name: "Vaelyra", kind: "opex" as const, self: false },
    ]
    const uther = { ...context, ownerGuidance: guidance, table, memories: "### PROJECT_RULES\n- Afrouxei a lâmina e assumi a conversa.", character: { ...context.character, name: "Uther" } }

    it("as orientações ficam numa seção própria, separada das memórias, que prevalece sobre personalidade, prompt base e memórias", () => {
        const text = buildOpexInstructions(uther, { withMemoryRule: true })
        const section = text.indexOf(OPEX_OWNER_GUIDANCE_TITLE)
        expect(section).toBeGreaterThan(0)
        expect(text).toContain("PREVALECEM sobre a sua personalidade, o prompt base do dono da campanha e as suas próprias memórias")
        expect(text).toContain("Deixe os jogadores conduzirem os diálogos.")
        // Antes das memórias, da campanha e do personagem; o título das memórias não cita mais o global.
        expect(section).toBeLessThan(text.indexOf("## Memórias (campanha e as suas)"))
        expect(section).toBeLessThan(text.indexOf("## Seu personagem: Uther"))
        expect(text).not.toContain("global do Personagem Opex")
        const memoriesBlock = text.slice(text.indexOf("## Memórias (campanha e as suas)"))
        expect(memoriesBlock).not.toContain("Deixe os jogadores conduzirem")
        // O título "Memórias" do Engramind sai e as categorias viram subtítulos da seção.
        const body = text.slice(section, text.indexOf(MADDOX_OPEX_MEMORY_RULE))
        expect(body).not.toMatch(/^#{1,6} Memórias$/m)
        expect(body).toContain("### PROJECT_RULES")
    })

    it("vale em toda decisão (mesa, combate, reação e entrevista usam as mesmas instruções)", () => {
        expect(buildOpexInstructions(uther)).toContain(OPEX_OWNER_GUIDANCE_TITLE)
    })

    it("lista quem é humano e quem é Opex, marca você e define jogadores/protagonistas como os humanos", () => {
        const text = buildOpexInstructions(uther)
        expect(text).toContain("## Quem está na mesa")
        expect(text).toContain("- Nala — personagem de jogador humano")
        expect(text).toContain("- Uther — Personagem Opex (você)")
        expect(text).toContain("- Vaelyra — Personagem Opex\n")
        expect(text).not.toContain("Vaelyra — Personagem Opex (você)")
        expect(text).toContain('"jogadores" e "protagonistas" significam SEMPRE os personagens dos jogadores humanos')
    })

    it("sem humano na mesa, diz que não há personagem de jogador humano; personagem em criação aparece como você", () => {
        const solo = buildOpexInstructions({ ...uther, table: [] })
        expect(solo).toContain("Não há personagem de jogador humano nesta mesa")
        expect(solo).toContain("(o seu personagem, ainda em criação) — Personagem Opex (você)")
    })

    it("sem orientações, nem a seção nem a repetição aparecem", () => {
        expect(buildOpexInstructions({ ...uther, ownerGuidance: "" })).not.toContain(OPEX_OWNER_GUIDANCE_TITLE)
        expect(buildOpexInstructions({ ...uther, ownerGuidance: "## Memórias\n" })).not.toContain(OPEX_OWNER_GUIDANCE_TITLE)
        const task = opexTableTask({ turnNumber: 12, transcript: "x", questionsLeft: 1, ownerGuidance: "" })
        expect(task).not.toContain("orientações do dono")
    })

    it("no turno da mesa, as orientações se repetem em texto integral logo antes do formato da resposta", () => {
        const task = opexTableTask({ turnNumber: 12, transcript: "[Turno 12 — Nala (jogador humano) declara] Continuo interrogando o goblin.", questionsLeft: 1, ownerGuidance: guidance })
        const reminder = task.indexOf("### Lembre: orientações do dono")
        expect(reminder).toBeGreaterThan(task.indexOf("### Transcrição recente"))
        expect(reminder).toBeLessThan(task.indexOf("Responda só com:"))
        expect(task.slice(reminder)).toContain("Deixe o holofote para os jogadores.")
        expect(task.slice(reminder)).toContain("Pode não fazer nada")
    })
})

describe("categoria das memórias do Opex (DND-57)", () => {
    it("a regra das memórias lista as categorias permitidas e proíbe as de regra (Personagem e NPC)", () => {
        for (const rule of [MADDOX_OPEX_MEMORY_RULE, MADDOX_OPEX_NPC_MEMORY_RULE]) {
            for (const key of ["SENTIMENTO", "PLANO", "OPINIAO", "RELACAO", "FATO", "EVENTO", "OUTRO"]) expect(rule).toContain(key)
            expect(rule).toContain("Nunca use categorias de regra (PROJECT_RULES")
        }
    })

    it("os formatos de resposta da mesa, da cena e do combate do NPC pedem a categoria", () => {
        const format = '"categoria": "SENTIMENTO | PLANO | OPINIAO | RELACAO | FATO | EVENTO | OUTRO"'
        expect(opexTableTask({ turnNumber: 1, transcript: "", questionsLeft: 0 })).toContain(format)
        expect(opexNpcSceneTask({ situation: "x" })).toContain(format)
        expect(opexNpcCombatTask({ round: 1, situation: "x", options: [{ name: "Adaga", detail: "" }], targets: [] })).toContain(format)
    })

    it("categoria escolhida passa; ausente, nula, de regra ou desconhecida vira OUTRO sem invalidar a decisão", () => {
        const parsed = opexTableActionSchema.parse({
            acao: "nada",
            memorias: [
                { titulo: "Medo", texto: "Tenho medo do escuro.", categoria: "sentimento" },
                { titulo: "Plano", texto: "Vou a Phandalin.", categoria: "PLANO" },
                { titulo: "Regra", texto: "Assumo a conversa.", categoria: "PROJECT_RULES" },
                { titulo: "Nula", texto: "Algo.", categoria: null },
                { titulo: "Sem", texto: "Algo." },
                { titulo: "Número", texto: "Algo.", categoria: 7 },
            ],
        })
        expect(opexMemoriesOf(parsed).map((memory) => memory.category)).toEqual(["SENTIMENTO", "PLANO", "OUTRO", "OUTRO", "OUTRO"])
        expect(opexMemorySchema.safeParse({ titulo: "Opinião", texto: "Lyra é corajosa.", categoria: "Opinião" }).success).toBe(true)
        expect(opexMemoriesOf({ memorias: [{ titulo: "Opinião", texto: "Lyra é corajosa.", categoria: "Opinião" }] })[0]!.category).toBe("OPINIAO")
    })
})
