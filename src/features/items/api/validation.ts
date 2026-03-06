import { z } from "zod";

const diceValueSchema = z.object({
    quantidade: z.number().min(1, "Quantidade deve ser pelo menos 1"),
    tipo: z.enum(["d4", "d6", "d8", "d10", "d12", "d20"])
});

const itemTraitSchema = z.object({
    name: z.string().max(100).optional(),
    level: z.number().default(1),
    description: z.string().min(1, "Campo obrigatório").max(5000)
});

export const createItemSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(20000, "Descrição muito longa"),
    source: z.string().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
    status: z.enum(["active", "inactive"]),
    image: z.string().optional().default(""),
    price: z.string().optional().default(""),
    type: z.enum(["ferramenta", "arma", "armadura", "escudo", "consumível", "munição", "qualquer"]),
    rarity: z.enum(["comum", "incomum", "raro", "muito raro", "lendário", "artefato"]),
    traits: z.array(itemTraitSchema).default([]),
    
    // Weapon specifics
    properties: z.array(itemTraitSchema).optional().default([]),
    damageDice: diceValueSchema.optional(),
    damageType: z.enum(["cortante", "perfurante", "concussão", "ácido", "fogo", "frio", "relâmpago", "trovão", "veneno", "psíquico", "radiante", "necrótico", "força"]).optional(),
    mastery: z.any().optional(),
    
    // Tool specifics
    attributeUsed: z.enum(["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"]).optional(),
    
    // Armor specifics
    ac: z.number().optional(),
    acType: z.enum(["base", "bonus"]).optional(),
    armorType: z.enum(["leve", "média", "pesada", "nenhuma"]).optional(),
    
    // Shield specifics
    acBonus: z.number().optional(),
    
    // Consumable specifics
    effectDice: diceValueSchema.optional(),
});

export const updateItemSchema = createItemSchema.partial().omit({ name: true }).extend({
    name: z.string().min(2).max(100).optional()
});

export type CreateItemSchema = z.infer<typeof createItemSchema>;
export type UpdateItemSchema = z.infer<typeof updateItemSchema>;
