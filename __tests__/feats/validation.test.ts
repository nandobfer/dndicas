/**
 * @fileoverview Tests for Feats validation schemas (createFeatSchema, updateFeatSchema).
 * Validates that the category field is required on create and optional on update.
 */

import { createFeatSchema, updateFeatSchema } from '@/features/feats/api/validation'
import { FEAT_CATEGORIES } from '@/features/feats/lib/feat-categories'

const validBase = {
    name: 'Talento de Teste',
    description: 'Descrição com mais de dez caracteres.',
    source: 'LDJ pág. 42',
    level: 1,
    prerequisites: [],
    attributeBonuses: [],
    status: 'active' as const,
}

describe('createFeatSchema', () => {
    it('fails when category is missing', () => {
        const result = createFeatSchema.safeParse(validBase)
        expect(result.success).toBe(false)
        if (!result.success) {
            const fields = result.error.flatten().fieldErrors
            expect(fields.category).toBeDefined()
        }
    })

    it.each(FEAT_CATEGORIES)('accepts valid category "%s"', (category) => {
        const result = createFeatSchema.safeParse({ ...validBase, category })
        expect(result.success).toBe(true)
    })

    it('fails with an invalid category value', () => {
        const result = createFeatSchema.safeParse({ ...validBase, category: 'Inválida' })
        expect(result.success).toBe(false)
        if (!result.success) {
            const fields = result.error.flatten().fieldErrors
            expect(fields.category).toBeDefined()
        }
    })

    it('succeeds with all required fields and a valid category', () => {
        const result = createFeatSchema.safeParse({ ...validBase, category: 'Geral' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.category).toBe('Geral')
        }
    })
})

describe('updateFeatSchema', () => {
    it('succeeds without category (category is optional on update)', () => {
        const result = updateFeatSchema.safeParse({ name: 'Novo Nome' })
        expect(result.success).toBe(true)
    })

    it.each(FEAT_CATEGORIES)('accepts valid category "%s" on update', (category) => {
        const result = updateFeatSchema.safeParse({ category })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.category).toBe(category)
        }
    })

    it('fails with an invalid category on update', () => {
        const result = updateFeatSchema.safeParse({ category: 'Categoria Fantasma' })
        expect(result.success).toBe(false)
        if (!result.success) {
            const fields = result.error.flatten().fieldErrors
            expect(fields.category).toBeDefined()
        }
    })

    it('succeeds with empty object (all fields optional)', () => {
        const result = updateFeatSchema.safeParse({})
        expect(result.success).toBe(true)
    })
})
