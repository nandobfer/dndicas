import { z } from "zod";
import { isValidTraitChargeValue, sortTraitChargeRows } from "../utils/trait-charges";

const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)
const traitChargeLevelSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed) return undefined
      return Number(trimmed)
    }
    return value
  },
  z.number({ message: "Nível é obrigatório" }).int("Nível inválido").min(1, "Nível mínimo é 1").max(20, "Nível máximo é 20"),
)
const traitChargeValueSchema = z.string().min(1, "Valor da carga é obrigatório").refine(
  (value) => isValidTraitChargeValue(value),
  "Use apenas números ou dados no formato NdX, como 3 ou 1d6",
)

const traitChargesSchemaInternal = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("fixed"),
    value: traitChargeValueSchema,
  }),
  z.object({
    mode: z.literal("byLevel"),
    values: z
      .array(
        z.object({
          level: traitChargeLevelSchema,
          value: traitChargeValueSchema,
        }),
      )
      .min(1, "Adicione ao menos uma linha de carga")
      .superRefine((rows, ctx) => {
        const seen = new Set<number>()
        rows.forEach((row, index) => {
          if (seen.has(row.level)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Níveis não podem se repetir",
              path: [index, "level"],
            })
          }
          seen.add(row.level)
        })
      })
      .transform((rows) => sortTraitChargeRows(rows)),
  }),
])

export const traitChargesSchema = traitChargesSchemaInternal.optional()

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
