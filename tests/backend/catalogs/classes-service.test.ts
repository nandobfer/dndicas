/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('classes service', () => {
    it('matches source filters against class and subclass sources', async () => {
        const lean = vi.fn().mockResolvedValue([]);
        const sort = vi.fn(() => ({ lean }));
        const find = vi.fn(() => ({ sort }));

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: { find } }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }));
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn((items) => items) }));

        const mod = await importFresh<typeof import('@/features/classes/api/classes-service')>('@/features/classes/api/classes-service');
        await mod.listClasses({ sources: ['TCE'], status: 'active' }, 1, 10, true);

        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            status: 'active',
            $or: [
                { source: { $in: [expect.any(RegExp)] } },
                { 'subclasses.source': { $in: [expect.any(RegExp)] } },
            ],
        }));
        expect(String((find.mock.calls[0][0] as any).$or[0].source.$in[0])).toBe('/^TCE/i');
        expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
        expect(lean).toHaveBeenCalled();
    });
});
