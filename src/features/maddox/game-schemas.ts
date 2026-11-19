import { z } from "zod"
import { MADDOX_GAME_MESSAGE_MAX, MADDOX_REMINDER_MAX_CHARS } from "./constants"

/** Schemas da mesa (Maddox 3) — módulo PURO, usado pela tela e pelas rotas. */

const content = z
    .string({ error: "Escreva o que o seu personagem faz" })
    .trim()
    .min(1, { error: "Escreva o que o seu personagem faz" })
    .max(MADDOX_GAME_MESSAGE_MAX, { error: `A mensagem pode ter no máximo ${MADDOX_GAME_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres` })

/**
 * Declaração (intenção, ação ou diálogo) ou "Não fazer nada". Desde a DND-74 o campo da mesa não pergunta mais: falar com o
 * mestre é o "Conversar com o Mestre" (`maddoxTalkSchema`).
 */
export const maddoxGameActionSchema = z.discriminatedUnion(
    "kind",
    [z.strictObject({ kind: z.literal("declaration"), content }), z.strictObject({ kind: z.literal("pass") })],
    { error: "Ação inválida" },
)
export type MaddoxGameActionInput = z.infer<typeof maddoxGameActionSchema>

/** Dono registra "não fez nada" no lugar de um jogador ausente. */
export const maddoxSkipPlayerSchema = z.strictObject({ memberId: z.string({ error: "Informe o jogador" }).trim().min(1, { error: "Informe o jogador" }) })
export type MaddoxSkipPlayerInput = z.infer<typeof maddoxSkipPlayerSchema>

/** "Conversar com o Mestre" (DND-74, sucede o "Injetar Lembrança" da DND-25): texto livre, fora da mesa. */
export const maddoxTalkSchema = z.strictObject({
    texto: z
        .string({ error: "Escreva a mensagem para o mestre" })
        .trim()
        .min(1, { error: "Escreva a mensagem para o mestre" })
        .max(MADDOX_REMINDER_MAX_CHARS, { error: `A mensagem para o mestre tem até ${MADDOX_REMINDER_MAX_CHARS} caracteres` }),
})
export type MaddoxTalkInput = z.infer<typeof maddoxTalkSchema>

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
