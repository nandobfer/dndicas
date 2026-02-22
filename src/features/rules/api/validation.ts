import { z } from "zod";

export const createReferenceSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(50000, "Descrição muito longa"),
  source: z.string().min(1, "Fonte é obrigatória").max(100, "Fonte muito longa"),
  status: z.enum(["active", "inactive"]),
});

export const updateReferenceSchema = createReferenceSchema.partial().omit({ name: true }).extend({
    name: z.string().min(3).max(100).optional()
});

export type CreateReferenceSchema = z.infer<typeof createReferenceSchema>;
export type UpdateReferenceSchema = z.infer<typeof updateReferenceSchema>;
