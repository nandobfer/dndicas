import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('rules and traits backend routes', () => {
    it('GET /api/rules applies search, status, and source filters', async () => {
        const countDocuments = vi.fn().mockResolvedValue(1);
        const items = [{ _id: 'rule-1', name: 'Regra', source: 'PHB' }];
        const limit = vi.fn().mockResolvedValue(items);
        const skip = vi.fn(() => ({ limit }));
        const sort = vi.fn(() => ({ skip }));
        const find = vi.fn(() => ({ sort }));

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
        }));
        vi.doMock('@/core/database/models/reference', () => ({
            Reference: { find, countDocuments, findOne: vi.fn(), create: vi.fn() },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            createAuditLog: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/rules/route')>('@/app/api/rules/route');
        const response = await mod.GET(new Request('http://localhost/api/rules?page=1&limit=10&search=Regra&searchField=name&status=active&sources=PHB'));
        const payload = await readJson(response);

        expect(response.status).toBe(200);
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            name: { $regex: 'Regra', $options: 'i' },
            status: 'active',
            source: { $in: [expect.any(RegExp)] },
        }));
        expect(payload.items).toEqual(items);
    });

    it('POST /api/rules returns 409 for duplicate names', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/core/database/models/reference', () => ({
            Reference: {
                findOne: vi.fn().mockResolvedValue({ _id: 'rule-1' }),
                create: vi.fn(),
                find: vi.fn(),
                countDocuments: vi.fn(),
            },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            createAuditLog: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/rules/route')>('@/app/api/rules/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/rules', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Regra',
                description: 'Descrição válida com tamanho suficiente',
                source: 'PHB',
                status: 'active',
            }),
        }));

        expect(response.status).toBe(409);
    });

    it('GET /api/traits uses fuzzy search after DB filtering', async () => {
        const applyFuzzySearch = vi.fn().mockReturnValue([{ _id: 'trait-2', name: 'Fúria' }]);
        const sort = vi.fn().mockResolvedValue([{ _id: 'trait-1', name: 'Ataque', status: 'active' }]);

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
        }));
        vi.doMock('@/features/traits/database/trait', () => ({
            Trait: { find: vi.fn(() => ({ sort })) },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            createAuditLog: vi.fn(),
        }));
        vi.doMock('@/core/utils/search-engine', () => ({
            applyFuzzySearch,
        }));
        vi.doMock('@/features/traits/api/validation', () => ({
            createTraitSchema: { safeParse: vi.fn() },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/traits/route')>('@/app/api/traits/route');
        const response = await mod.GET(new Request('http://localhost/api/traits?search=furia&status=active&sources=PHB'));
        const payload = await readJson(response);

        expect(response.status).toBe(200);
        expect(applyFuzzySearch).toHaveBeenCalled();
        expect(payload.items).toEqual([{ _id: 'trait-2', name: 'Fúria' }]);
    });

    it('POST /api/traits returns 400 for invalid bodies', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/features/traits/database/trait', () => ({
            Trait: { findOne: vi.fn(), create: vi.fn() },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            createAuditLog: vi.fn(),
        }));
        vi.doMock('@/core/utils/search-engine', () => ({
            applyFuzzySearch: vi.fn(),
        }));
        vi.doMock('@/features/traits/api/validation', () => ({
            createTraitSchema: {
                safeParse: vi.fn().mockReturnValue({
                    success: false,
                    error: { flatten: vi.fn().mockReturnValue({ fieldErrors: { name: ['required'] } }) },
                }),
            },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/traits/route')>('@/app/api/traits/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/traits', {
            method: 'POST',
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(400);
    });
});
