import { z } from "zod"
import { MADDOX_GAME_MESSAGE_MAX } from "./constants"

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
