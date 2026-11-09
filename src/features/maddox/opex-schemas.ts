import { z } from "zod"
import { MADDOX_ABILITY_METHODS, MADDOX_OPEX_GUIDANCE_MAX, MADDOX_OPEX_INTERVIEW_MODES, MADDOX_OPEX_MEMORY_TEXT_MAX, MADDOX_OPEX_MEMORY_TITLE_MAX, MADDOX_OPEX_PROMPT_MAX, MADDOX_OPEX_PERMISSION } from "./constants"

/** Schemas das rotas dos Personagens Opex (DND-26) — tela e API. */

export const addMaddoxOpexSchema = z.strictObject({
    prompt: z.string().trim().max(MADDOX_OPEX_PROMPT_MAX, `O prompt base vai até ${MADDOX_OPEX_PROMPT_MAX.toLocaleString("pt-BR")} caracteres`).optional().default(""),
    interviewMode: z.enum(MADDOX_OPEX_INTERVIEW_MODES, { error: "Escolha o modo da entrevista" }),
})
export type AddMaddoxOpexInput = z.infer<typeof addMaddoxOpexSchema>

const score = z.number({ error: "Informe um número" }).int().min(1).max(30)

/** Aprovação do rascunho: vazio = como está; `content` = fala editada; card editado = `{ method, scores }` ou `{ escolhas }`. */
export const approveMaddoxOpexDraftSchema = z.union([
    z.strictObject({ content: z.string().trim().min(1, "Escreva a resposta").max(4_000, "Até 4.000 caracteres").optional() }),
    z.strictObject({ method: z.enum(MADDOX_ABILITY_METHODS), scores: z.strictObject({ strength: score, dexterity: score, constitution: score, intelligence: score, wisdom: score, charisma: score }) }),
    z.strictObject({ escolhas: z.record(z.string().regex(/^\d+$/), z.enum(["media", "rolagem"])) }),
])
export type ApproveMaddoxOpexDraftInput = z.infer<typeof approveMaddoxOpexDraftSchema>

export const regenerateMaddoxOpexDraftSchema = z.strictObject({
    orientacao: z.string().trim().max(MADDOX_OPEX_GUIDANCE_MAX, `A orientação vai até ${MADDOX_OPEX_GUIDANCE_MAX.toLocaleString("pt-BR")} caracteres`).optional().default(""),
})

/** Memória global do Personagem Opex (configuração, só administradores). */
export const maddoxOpexGlobalMemorySchema = z.strictObject({
    title: z.string().trim().min(1, "Dê um título à memória").max(MADDOX_OPEX_MEMORY_TITLE_MAX, `Até ${MADDOX_OPEX_MEMORY_TITLE_MAX} caracteres`),
    text: z.string().trim().min(1, "Escreva a memória").max(MADDOX_OPEX_MEMORY_TEXT_MAX, `Até ${MADDOX_OPEX_MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`),
})
export type MaddoxOpexGlobalMemoryInput = z.infer<typeof maddoxOpexGlobalMemorySchema>

/** O usuário (permissões efetivas do Perfix) pode adicionar Personagens Opex. */
export const canAddMaddoxOpex = (permissions: readonly string[] | undefined) => Boolean(permissions?.includes("*") || permissions?.includes(MADDOX_OPEX_PERMISSION))
