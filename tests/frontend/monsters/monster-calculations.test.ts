import { describe, expect, it } from 'vitest'
import { getMonsterHitPointAverage, isMonsterHitPointFormulaStatic } from '@/features/monsters/utils/monster-calculations'

describe('monster hit point calculations', () => {
    it('returns the original number for static hit point values', () => {
        expect(getMonsterHitPointAverage('42')).toBe(42)
        expect(isMonsterHitPointFormulaStatic('42')).toBe(true)
    })

    it('calculates the average for dice formulas with bonuses', () => {
        expect(getMonsterHitPointAverage('20d10 + 100')).toBe(210)
    })

    it('calculates the average for dice formulas with subtraction', () => {
        expect(getMonsterHitPointAverage('3d8 - 3')).toBe(10)
    })

    it('returns null for unsupported free-text formulas', () => {
        expect(getMonsterHitPointAverage('40 + 10 for each spell level above 4')).toBeNull()
    })
})
