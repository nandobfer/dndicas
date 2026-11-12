import { z } from "zod"
import { MADDOX_COMBAT_ADJUST_TEXT_MAX, MADDOX_COMBAT_FREE_TEXT_MAX, MADDOX_COMBAT_TARGETS_MAX } from "./constants"

/** Schemas do combate tático (Maddox 7) — módulo PURO, usado pela tela e pelas rotas. */

const freeText = z.string().trim().max(MADDOX_COMBAT_FREE_TEXT_MAX, { error: `O texto pode ter no máximo ${MADDOX_COMBAT_FREE_TEXT_MAX.toLocaleString("pt-BR")} caracteres` })

/** Ação ou Ação bônus da vez: a opção (id da lista do servidor), os alvos e os complementos. */
export const maddoxCombatActionSchema = z.strictObject({
    economy: z.enum(["action", "bonus"], { error: "Escolha Ação ou Ação bônus" }),
    optionId: z.string({ error: "Escolha uma opção" }).trim().min(1, { error: "Escolha uma opção" }).max(200),
    targets: z.array(z.string().trim().min(1).max(80)).max(MADDOX_COMBAT_TARGETS_MAX).optional(),
    spellLevel: z.number().int().min(1).max(9).optional(),
    skill: z.string().trim().max(40).optional(),
    freeText: freeText.optional(),
    readyOptionId: z.string().trim().max(200).optional(),
    readyTrigger: freeText.optional(),
})
export type MaddoxCombatActionInput = z.infer<typeof maddoxCombatActionSchema>

/** DND-49: depois do acerto, somar (ou não) o ataque furtivo ao dano. */
export const maddoxSneakChoiceSchema = z.strictObject({ add: z.boolean({ error: "Escolha se soma o ataque furtivo" }) })
export type MaddoxSneakChoiceInput = z.infer<typeof maddoxSneakChoiceSchema>

/** "Encerrar turno": o movimento e a posição, em texto (sem grid). */
export const maddoxEndCombatTurnSchema = z.strictObject({ movimento: freeText.optional() })
export type MaddoxEndCombatTurnInput = z.infer<typeof maddoxEndCombatTurnSchema>

/** Escolha na janela de reação: o id da opção ou `none` (não reagir). */
export const maddoxReactionChoiceSchema = z.strictObject({ escolha: z.string({ error: "Escolha a reação" }).trim().min(1, { error: "Escolha a reação" }).max(200) })
export type MaddoxReactionChoiceInput = z.infer<typeof maddoxReactionChoiceSchema>

/** Rolar um passo de ação ou uma rolagem avulsa: sem campos (dado e modificador são do servidor). */
export const maddoxCombatRollSchema = z.strictObject({}, { error: "A rolagem não aceita dados nem modificadores." })

/** DND-41: pedido de ajuste de uma opção da Ação ou da Ação bônus, na própria vez. */
export const maddoxCombatAdjustmentSchema = z.strictObject({
    economy: z.enum(["action", "bonus"], { error: "Escolha Ação ou Ação bônus" }),
    optionId: z.string({ error: "Escolha uma opção" }).trim().min(1, { error: "Escolha uma opção" }).max(200),
    text: z
        .string({ error: "Descreva o ajuste" })
        .trim()
        .min(3, { error: "Descreva o ajuste" })
        .max(MADDOX_COMBAT_ADJUST_TEXT_MAX, { error: `O pedido pode ter no máximo ${MADDOX_COMBAT_ADJUST_TEXT_MAX.toLocaleString("pt-BR")} caracteres` }),
})
export type MaddoxCombatAdjustmentInput = z.infer<typeof maddoxCombatAdjustmentSchema>

/** DND-51: resposta do jogador à pergunta da preparação do combate. */
export const maddoxCombatPrepAnswerSchema = z.strictObject({
    text: z
        .string({ error: "Escreva a sua resposta" })
        .trim()
        .min(1, { error: "Escreva a sua resposta" })
        .max(MADDOX_COMBAT_ADJUST_TEXT_MAX, { error: `A resposta pode ter no máximo ${MADDOX_COMBAT_ADJUST_TEXT_MAX.toLocaleString("pt-BR")} caracteres` }),
})
export type MaddoxCombatPrepAnswerInput = z.infer<typeof maddoxCombatPrepAnswerSchema>
