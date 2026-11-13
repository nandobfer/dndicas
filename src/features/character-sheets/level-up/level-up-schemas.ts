import { z } from "zod"

const attribute = z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"])
const id = z.string().trim().min(1).max(120)

/** Escolhas da subida de nível (wizard e Personagem Opex); a validação contra o catálogo fica em `applyLevelUp`. */
export const levelUpChoicesSchema = z.strictObject({
    targetLevel: z.number().int().min(2).max(20),
    hp: z.discriminatedUnion("method", [z.strictObject({ method: z.literal("average") }), z.strictObject({ method: z.literal("roll"), die: z.number().int().min(1).max(20).optional() })]),
    subclassId: id.nullish(),
    feat: z.strictObject({ id, attributes: z.partialRecord(attribute, z.number().int().min(0).max(2)).optional() }).nullish(),
    cantrips: z.array(id).max(10).optional(),
    spells: z.array(id).max(20).optional(),
    swap: z.strictObject({ remove: id, add: id }).nullish(),
})
