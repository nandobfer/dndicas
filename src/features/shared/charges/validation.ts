import { z } from "zod"
import { attributeColors, type AttributeType } from "@/lib/config/colors"
import { isValidChargeValue, sortChargeRows } from "./utils"

const ATTRIBUTE_OPTIONS = Object.keys(attributeColors) as [AttributeType, ...AttributeType[]]

export const chargeLevelSchema = z.preprocess(
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

export const chargeValueSchema = z
    .string()
    .min(1, "Valor da carga é obrigatório")
    .refine((value) => isValidChargeValue(value), "Use apenas números ou dados no formato NdX, como 3 ou 1d6")

export const chargesSchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("fixed"),
        value: chargeValueSchema,
    }),
    z.object({
        mode: z.literal("proficiency"),
    }),
    z.object({
        mode: z.literal("attribute"),
        attribute: z.enum(ATTRIBUTE_OPTIONS, { message: "Atributo é obrigatório" }),
    }),
    z.object({
        mode: z.literal("byLevel"),
        values: z
            .array(
                z.object({
                    level: chargeLevelSchema,
                    value: chargeValueSchema,
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
            .transform((rows) => sortChargeRows(rows)),
    }),
])
