import { describe, expect, it } from "vitest"
import { applyConditionChange, attackMode, conditionDisplayLabel, hiddenCondition, isHiddenCondition, mentionedConditions, rollMatchesMode } from "@/features/maddox/combat-rules"
import { buildNarratorInstructions, MADDOX_COMBAT_FIX_TASK_RULES, MADDOX_STATE_OR_SILENCE_RULE, narratorTaskText, tacticalCombatRule } from "@/features/maddox/server/narrator-prompt"

/** DND-59: regras puras da condição gravada, do modo do ataque e do prompt "estado ou silêncio". */

const free = { conditions: [], flags: {} }

describe("DND-59 — vantagem vem do estado", () => {
    it("Invisível do Esconder-se no atacante dá vantagem com o motivo; vantagem da situação entra com o motivo do mestre e anula com desvantagem", () => {
        const hidden = { conditions: [hiddenCondition(15)], flags: {} }
        expect(attackMode({ attacker: hidden, target: free, ranged: false })).toMatchObject({ mode: "advantage", reasons: ["atacante invisível"] })
        expect(attackMode({ attacker: free, target: free, ranged: false, situational: { mode: "advantage", reason: "alvo preso na ratoeira" } })).toMatchObject({ mode: "advantage", reasons: ["alvo preso na ratoeira"] })
        expect(attackMode({ attacker: hidden, target: free, ranged: false, situational: { mode: "disadvantage", reason: "escuridão total" } })).toMatchObject({ mode: "normal", reasons: ["atacante invisível", "escuridão total"] })
    })

    it("a rolagem bate com o modo: vantagem/desvantagem trazem dois d20 (mantido e descartado); normal, um; dano sempre bate", () => {
        const d20 = [{ dice: "d20" as const }]
        expect(rollMatchesMode({ mode: "advantage", terms: d20, selectedD20: { reason: "advantage", discarded: 3 } }, "advantage")).toBe(true)
        expect(rollMatchesMode({ mode: "normal", terms: d20, selectedD20: { reason: "normal" } }, "advantage")).toBe(false)
        expect(rollMatchesMode({ mode: "advantage", terms: d20, selectedD20: { reason: "advantage" } }, "advantage")).toBe(false)
        expect(rollMatchesMode({ mode: "disadvantage", terms: d20, selectedD20: { reason: "disadvantage", discarded: 19 } }, "advantage")).toBe(false)
        expect(rollMatchesMode({ mode: "normal", terms: d20, selectedD20: { reason: "normal" } }, "normal")).toBe(true)
        expect(rollMatchesMode({ mode: "advantage", terms: d20, selectedD20: { reason: "advantage", discarded: 3 } }, "normal")).toBe(false)
        expect(rollMatchesMode({ mode: "normal", terms: [{ dice: "d6" as const }] }, "advantage")).toBe(true)
    })
})

describe("DND-59 — condição gravada", () => {
    it("Esconder-se: Invisível com origem Esconder e a CD; rótulo com a CD; outra Invisível não é a do Esconder-se", () => {
        const { conditions, line, changed } = applyConditionChange([], { key: "invisible", hidden: true, hiddenDc: 15, source: "Venceu a Furtividade" }, { name: "Lizwan" })
        expect(changed).toBe(true)
        expect(conditions).toEqual([{ key: "invisible", untilRound: null, source: "Esconder", dc: 15 }])
        expect(line).toBe("Lizwan está Invisível (Esconder-se · CD 15)")
        expect(isHiddenCondition(conditions[0]!)).toBe(true)
        expect(conditionDisplayLabel({ key: "invisible", source: "Invisibilidade" })).toBe("Invisível")
        expect(conditionDisplayLabel({ key: "invisible", source: "Esconder" })).toBe("Invisível (Esconder-se)")
    })

    it("aplicar substitui a mesma condição, remover tira, e imunidade não muda nada", () => {
        const first = applyConditionChange([{ key: "prone", untilRound: null }], { key: "prone", untilRound: 3, source: "rasteira" }, { name: "Goblin" })
        expect(first.conditions).toEqual([{ key: "prone", untilRound: 3, source: "rasteira" }])
        expect(applyConditionChange(first.conditions, { key: "prone", remove: true }, { name: "Goblin" })).toMatchObject({ conditions: [], line: "Goblin não está mais Caído", changed: true })
        expect(applyConditionChange([], { key: "prone", remove: true }, { name: "Goblin" })).toMatchObject({ line: "Goblin já não estava Caído", changed: false })
        expect(applyConditionChange([], { key: "poisoned" }, { name: "Esqueleto", immunities: ["poisoned"] })).toMatchObject({ conditions: [], line: "Esqueleto é imune a Envenenado", changed: false })
    })

    it("condições citadas no texto livre (com acento, gênero e plural)", () => {
        expect(mentionedConditions("Ela está escondida: condição Invisível (Furtividade 15).")).toEqual(["invisible"])
        expect(mentionedConditions("Os ratos estão caídos e envenenados; Ravel ficou atordoado.")).toEqual(["poisoned", "prone", "stunned"])
        expect(mentionedConditions("Ninguém se feriu.")).toEqual([])
    })
})

describe("DND-59 — prompt: estado ou silêncio", () => {
    const answer = (extra: Record<string, unknown> = {}) => narratorTaskText({ kind: "answer", turnNumber: 7, characterName: "Lizwan", question: "coloque a condição nela", declarations: [], sheetFix: true, ...extra })

    it("a resposta só afirma o que a ferramenta gravou; com combate tático, traz as ferramentas de correção e a rolagem definitiva", () => {
        expect(answer()).toContain(MADDOX_STATE_OR_SILENCE_RULE)
        expect(answer()).not.toContain("## Correções do combate tático")
        expect(answer()).toContain("fora do combate tático: texto do Diário, que não muda nenhum dado")
        const tactical = answer({ combatFix: true })
        expect(tactical).toContain(MADDOX_COMBAT_FIX_TASK_RULES)
        expect(tactical).toContain("`set_combat_condition`")
        expect(tactical).toContain("Rolagem já feita é definitiva")
    })

    it("o lembrete corrigido na hora tem a tarefa própria (corrigir antes da rolagem e resolver o lembrete)", () => {
        const text = answer({ reminderRef: "abc123", combatFix: true, question: "lizwan está escondida e ataca com vantagem!" })
        expect(text).toContain("# Lembrete de Lizwan (turno 7)")
        expect(text).toContain("[abc123] **Lizwan** lembra: lizwan está escondida e ataca com vantagem!")
        expect(text).toContain("`resolve_reminder`")
        expect(text).toContain(MADDOX_STATE_OR_SILENCE_RULE)
    })

    it("regra do combate tático: rolagem gravada é definitiva e o Esconder-se antes da luta entra no start_combat", () => {
        const rule = tacticalCombatRule("fiel-dnd")
        expect(rule).toContain('nunca diga que ela "não vale"')
        expect(rule).toContain("`escondidos`")
    })

    it("MCP: a lista de ferramentas inclui as de correção do combate só com combatFix", () => {
        const base = { instructions: "Maddox.", agentMemories: "", rigor: "fiel-dnd" as const, campaignName: "Mesa", setting: "", openingSituation: "", state: { scene: "", location: "", situation: "", pendingDecision: "" }, characters: [], npcs: [], memories: [] }
        const withFix = buildNarratorInstructions(base as never, { kind: "mcp", server: "dndicas-maddox", turnToken: "t", combatFix: true })
        expect(withFix).toContain("get_combat_details, set_combat_condition, edit_combat_action, correct_combatant, correct_character_turn")
        expect(buildNarratorInstructions(base as never, { kind: "mcp", server: "dndicas-maddox", turnToken: "t" })).not.toContain("set_combat_condition")
    })
})
