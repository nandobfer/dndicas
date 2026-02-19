/**
 * @fileoverview Zod validation schemas for Users feature.
 * Used for validating API requests and form inputs.
 *
 * @see specs/000/data-model.md
 */

import { z } from 'zod';

/**
 * Schema for creating a new user.
 * All required fields must be provided.
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username deve ter no mínimo 3 caracteres')
    .max(50, 'Username deve ter no máximo 50 caracteres')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username deve conter apenas letras, números e underscore'
    ),
  email: z
    .string()
    .email('Email inválido')
    .transform((v) => v.toLowerCase()),
  name: z
    .string()
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .optional(),
  avatarUrl: z
    .string()
    .url('URL do avatar inválida')
    .optional()
    .or(z.literal('')),
  role: z.enum(['admin', 'user']).default('user'),
});

/**
 * Schema for updating an existing user.
 * All fields are optional.
 */
export const updateUserSchema = createUserSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

/** Inferred type from createUserSchema */
export type CreateUserSchema = z.infer<typeof createUserSchema>;

/** Inferred type from updateUserSchema */
export type UpdateUserSchema = z.infer<typeof updateUserSchema>;

/**
 * Schema for user list filters/query parameters.
 */
export const userFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['all', 'admin', 'user']).default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

/**
 * Schema for user ID parameter.
 */
export const userIdSchema = z.object({
  id: z.string().min(1, 'ID é obrigatório'),
});

/**
 * Schema for audit log filters/query parameters.
 */
export const auditLogFiltersSchema = z.object({
  action: z.enum(['all', 'CREATE', 'UPDATE', 'DELETE']).default('all'),
  entity: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

// Inferred types from schemas
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserFilters = z.infer<typeof userFiltersSchema>;
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;

/**
 * Validate and parse create user input.
 * Throws ZodError if validation fails.
 */
export const validateCreateUser = (data: unknown): CreateUserInput => {
  return createUserSchema.parse(data);
};

/**
 * Validate and parse update user input.
 * Throws ZodError if validation fails.
 */
export const validateUpdateUser = (data: unknown): UpdateUserInput => {
  return updateUserSchema.parse(data);
};

/**
 * Validate and parse user filters.
 * Uses defaults for missing values.
 */
export const validateUserFilters = (data: unknown): UserFilters => {
  return userFiltersSchema.parse(data);
};

/**
 * Validate and parse audit log filters.
 * Uses defaults for missing values.
 */
export const validateAuditLogFilters = (data: unknown): AuditLogFilters => {
  return auditLogFiltersSchema.parse(data);
};

/**
 * Safe parse functions that return success/error objects instead of throwing.
 */
export const safeParseCreateUser = (data: unknown) =>
  createUserSchema.safeParse(data);

export const safeParseUpdateUser = (data: unknown) =>
  updateUserSchema.safeParse(data);

export const safeParseUserFilters = (data: unknown) =>
  userFiltersSchema.safeParse(data);
