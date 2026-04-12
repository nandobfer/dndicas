import { z } from "zod";
import { chargesSchema } from "@/features/shared/charges/validation";
const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)

const diceValueSchema = z.object({
    quantidade: z.number().min(1, "Quantidade deve ser pelo menos 1"),
    tipo: z.enum(["d4", "d6", "d8", "d10", "d12", "d20"])
});

const additionalDamageSchema = z.object({
    damageDice: diceValueSchema,
    damageType: z.enum(["cortante", "perfurante", "concussão", "ácido", "fogo", "frio", "relâmpago", "trovão", "veneno", "psíquico", "radiante", "necrótico", "força"]),
})

const itemTraitIdSchema = z.union([
    z.string(),
    z.object({
        _id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        level: z.number().optional().default(1),
    }),
])

export const createItemSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(20000, "Descrição muito longa"),
    charges: chargesSchema.optional(),
    source: z.string().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
    status: z.enum(["active", "inactive"]),
    image: z.string().optional().default(""),
    price: z.string().optional().default(""),
    weight: z.number().optional().default(0),
    isMagic: z.boolean().default(false),
    type: z.enum(["ferramenta", "arma", "armadura", "escudo", "consumível", "munição", "qualquer"]),
    rarity: z.enum(["comum", "incomum", "raro", "muito raro", "lendário", "artefato"]),
    traits: z.array(itemTraitIdSchema).default([]),
    // Weapon specifics
    properties: z.array(itemTraitIdSchema).optional().default([]),
    damageDice: diceValueSchema.default({ quantidade: 1, tipo: "d6" }),
    damageType: z.enum(["cortante", "perfurante", "concussão", "ácido", "fogo", "frio", "relâmpago", "trovão", "veneno", "psíquico", "radiante", "necrótico", "força"]).default("cortante"),
    additionalDamage: z.array(additionalDamageSchema).optional().default([]),
    mastery: z.any().optional(),

    // Tool specifics
    attributeUsed: z.enum(["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"]).optional(),

    // Armor specifics
    ac: z.number().optional(),
    acType: z.enum(["base", "bonus"]).optional(),
    armorType: z.enum(["leve", "média", "pesada", "nenhuma"]).optional(),
    strReq: z.number().optional().default(0),
    stealthDis: z.boolean().optional().default(false),

    // Shield specifics
    acBonus: z.number().optional(),

    // Consumable specifics
    effectDice: diceValueSchema.optional(),
})

export const updateItemSchema = createItemSchema.partial().omit({ name: true }).extend({
    name: z.string().min(2).max(100).optional()
});

export type CreateItemSchema = z.infer<typeof createItemSchema>;
export type UpdateItemSchema = z.infer<typeof updateItemSchema>;
