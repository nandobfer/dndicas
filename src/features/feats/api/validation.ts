/**
 * @fileoverview Zod validation schemas for Feats API routes.
 *
 * @see specs/003-feats-catalog/data-model.md
 */

import { z } from 'zod';
import { chargesSchema } from '@/features/shared/charges/validation';
import { FEAT_CATEGORIES } from '../lib/feat-categories';
const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)

export const createFeatSchema = z.object({
    name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres").max(50000, "Descrição muito longa"),
    charges: chargesSchema.optional(),
    source: z.string().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
    level: z.number().int("Nível deve ser número inteiro").min(1, "Nível mínimo é 1").max(20, "Nível máximo é 20"),
    prerequisites: z.array(z.string()),
    attributeBonuses: z
        .array(
            z.object({
                attribute: z.string().min(1, "Atributo é obrigatório"),
                value: z.number().int().min(1).max(3),
            }),
        )
        .optional()
        .default([]),
    category: z.enum(FEAT_CATEGORIES, { error: "Categoria é obrigatória" }),
    status: z.enum(["active", "inactive"]),
})

export const updateFeatSchema = z.object({
    name: z.string().min(3).max(100).optional(),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10).max(50000).optional(),
    charges: chargesSchema.optional(),
    source: z.string().min(1).max(200).optional(),
    level: z.number().int().min(1).max(20).optional(),
    prerequisites: z.array(z.string()).optional(),
    attributeBonuses: z
        .array(
            z.object({
                attribute: z.string().min(1, "Atributo é obrigatório"),
                value: z.number().int().min(1).max(3),
            }),
        )
        .optional(),
    category: z.enum(FEAT_CATEGORIES).optional(),
    status: z.enum(["active", "inactive"]).optional(),
})

export type CreateFeatSchema = z.infer<typeof createFeatSchema>;
export type UpdateFeatSchema = z.infer<typeof updateFeatSchema>;
