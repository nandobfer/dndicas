import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('classes service', () => {
    it('matches source filters against class and subclass sources', async () => {
        const lean = vi.fn().mockResolvedValue([]);
        const sort = vi.fn(() => ({ lean }));
        const find = vi.fn((_query?: unknown) => ({ sort }));

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
                { source: { $in: expect.arrayContaining([expect.any(RegExp)]) } },
                { 'subclasses.source': { $in: expect.arrayContaining([expect.any(RegExp)]) } },
            ],
        }));
        const lastFindCall = find.mock.lastCall;
        expect(lastFindCall).toBeDefined();
        if (!lastFindCall) {
            throw new Error('Expected CharacterClass.find to be called.');
        }

        const query = lastFindCall[0] as {
            $or: Array<{
                source?: { $in: RegExp[] };
            }>;
        };

        const sourceMatchers = query.$or[0]?.source?.$in ?? []
        expect(sourceMatchers.some((regex) => regex.test("TCE p. 1"))).toBe(true)
        expect(sourceMatchers.some((regex) => regex.test("Tasha's Cauldron of Everything p. 1"))).toBe(true)
        expect(sort).toHaveBeenCalledWith({ name: 1 });
        expect(lean).toHaveBeenCalled();
    });
});
