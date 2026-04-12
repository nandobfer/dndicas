import { z } from "zod";
import { chargesSchema } from "@/features/shared/charges/validation";

const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)
export const traitChargesSchema = chargesSchema.optional()

export const createTraitSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  originalName: optionalOriginalNameSchema,
  description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(50000, "Descrição muito longa"),
  charges: traitChargesSchema,
  source: z.string().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
  status: z.enum(["active", "inactive"]),
});

export const updateTraitSchema = createTraitSchema.partial().omit({ name: true }).extend({
    name: z.string().min(3).max(100).optional()
});

export type CreateTraitSchema = z.infer<typeof createTraitSchema>;
export type UpdateTraitSchema = z.infer<typeof updateTraitSchema>;
