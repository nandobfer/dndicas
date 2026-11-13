import { z } from "zod"
import { MADDOX_GAME_MESSAGE_MAX, MADDOX_REMINDER_MAX_CHARS } from "./constants"

/** Schemas da mesa (Maddox 3) — módulo PURO, usado pela tela e pelas rotas. */

const content = z
    .string({ error: "Escreva o que o seu personagem faz" })
    .trim()
    .min(1, { error: "Escreva o que o seu personagem faz" })
    .max(MADDOX_GAME_MESSAGE_MAX, { error: `A mensagem pode ter no máximo ${MADDOX_GAME_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres` })

/** Declaração (intenção, ação ou diálogo), pergunta ao mestre (não encerra o turno) ou "Não fazer nada". */
export const maddoxGameActionSchema = z.discriminatedUnion(
    "kind",
    [z.strictObject({ kind: z.literal("declaration"), content }), z.strictObject({ kind: z.literal("question"), content }), z.strictObject({ kind: z.literal("pass") })],
    { error: "Ação inválida" },
)
export type MaddoxGameActionInput = z.infer<typeof maddoxGameActionSchema>

/** Dono registra "não fez nada" no lugar de um jogador ausente. */
export const maddoxSkipPlayerSchema = z.strictObject({ memberId: z.string({ error: "Informe o jogador" }).trim().min(1, { error: "Informe o jogador" }) })
export type MaddoxSkipPlayerInput = z.infer<typeof maddoxSkipPlayerSchema>

/** Injetar Lembrança (DND-25): texto livre para a próxima narração do Maddox. */
export const maddoxReminderSchema = z.strictObject({
    texto: z
        .string({ error: "Escreva a lembrança" })
        .trim()
        .min(1, { error: "Escreva a lembrança" })
        .max(MADDOX_REMINDER_MAX_CHARS, { error: `A lembrança tem até ${MADDOX_REMINDER_MAX_CHARS} caracteres` }),
})
export type MaddoxReminderInput = z.infer<typeof maddoxReminderSchema>

/** Rolar um teste pedido pelo Maddox: sem campos (dado e modificador são do servidor). */
export const maddoxRollCheckSchema = z.strictObject({}, { error: "A rolagem não aceita dados nem modificadores." })
export type MaddoxRollCheckInput = z.infer<typeof maddoxRollCheckSchema>

/** Voltar a mesa ao turno X (DND-44): cobre "Desfazer turno" e andar entre os turnos dentro da volta pendente. */
export const maddoxRewindSchema = z.strictObject({
    turnNumber: z.number({ error: "Informe o turno" }).int({ error: "O turno deve ser um número inteiro" }).min(1, { error: "O turno deve ser 1 ou maior" }),
})
export type MaddoxRewindInput = z.infer<typeof maddoxRewindSchema>

/** "Voltar ao turno atual (N)": sem campos. */
export const maddoxResumeTurnSchema = z.strictObject({}, { error: "A retomada não aceita campos." })

/** "Tentar de novo" da subida de nível do Personagem Opex (DND-56): sem corpo. */
export const levelUpRetryBodySchema = z.strictObject({}, { error: "Esta ação não aceita dados no corpo." })
