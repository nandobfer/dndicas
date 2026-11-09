import { describe, expect, it } from "vitest"
import { buildOpexInstructions, opexCombatTask, opexMemoriesOf, opexTableActionSchema, opexTableTask, MADDOX_OPEX_ROLE_RULE, MADDOX_OPEX_MEMORY_RULE } from "@/features/maddox/server/opex-prompt"
import { MADDOX_OPEX_MEMORIES_PER_TURN, MADDOX_OPEX_MEMORY_TITLE_MAX } from "@/features/maddox/constants"

/** Prompts e contratos do Personagem Opex (DND-26), módulo puro. */

const context = {
    instructions: "Jogue em equipe.",
    memories: "- Desconfio de magos.",
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
