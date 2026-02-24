/**
 * @fileoverview Zod validation schemas for Feats API routes.
 *
 * @see specs/003-feats-catalog/data-model.md
 */

import { z } from 'zod';

export const createFeatSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  description: z
    .string()
    .min(10, 'Descrição deve ter no mínimo 10 caracteres')
    .max(50000, 'Descrição muito longa'),
  source: z
    .string()
    .min(1, 'Fonte é obrigatória')
    .max(200, 'Fonte muito longa'),
  level: z
    .number()
    .int('Nível deve ser número inteiro')
    .min(1, 'Nível mínimo é 1')
    .max(20, 'Nível máximo é 20'),
  prerequisites: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
});

export const updateFeatSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(50000).optional(),
  source: z.string().min(1).max(200).optional(),
  level: z.number().int().min(1).max(20).optional(),
  prerequisites: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type CreateFeatSchema = z.infer<typeof createFeatSchema>;
export type UpdateFeatSchema = z.infer<typeof updateFeatSchema>;
