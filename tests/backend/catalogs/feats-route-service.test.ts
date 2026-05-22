import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('feats backend', () => {
    it('GET /api/feats forwards filters and treats authenticated users as admin-visible', async () => {
        const listFeats = vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, limit: 5, totalPages: 0 });

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/features/feats/api/validation', () => ({
            createFeatSchema: { safeParse: vi.fn() },
        }));
        vi.doMock('@/features/feats/api/feats-service', () => ({
            listFeats,
            createFeat: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/feats/route')>('@/app/api/feats/route');
        const response = await mod.GET(new Request('http://localhost/api/feats?page=2&limit=5&search=war&searchField=name&status=inactive&level=3&levelMax=9&attributes=forca,destreza&categories=Geral&sources=PHB,XPHB'));

        expect(response.status).toBe(200);
        expect(listFeats).toHaveBeenCalledWith({
            search: 'war',
            searchField: 'name',
            status: 'inactive',
            level: 3,
            levelMax: 9,
            attributes: ['forca', 'destreza'],
            categories: ['Geral'],
            sources: ['PHB', 'XPHB'],
        }, 2, 5, true);
    });

    it('POST /api/feats rejects anonymous users', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
        }));
        vi.doMock('@/features/feats/api/validation', () => ({
            createFeatSchema: { safeParse: vi.fn() },
        }));
        vi.doMock('@/features/feats/api/feats-service', () => ({
            listFeats: vi.fn(),
            createFeat: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/feats/route')>('@/app/api/feats/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/feats', {
            method: 'POST',
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(401);
    });

    it('POST /api/feats returns 400 for schema validation errors', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/features/feats/api/validation', () => ({
            createFeatSchema: {
                safeParse: vi.fn().mockReturnValue({
                    success: false,
                    error: { issues: [{ path: ['name'], message: 'required' }] },
                }),
            },
        }));
        vi.doMock('@/features/feats/api/feats-service', () => ({
            listFeats: vi.fn(),
            createFeat: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/feats/route')>('@/app/api/feats/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/feats', {
            method: 'POST',
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(400);
    });

    it('POST /api/feats maps duplicate-name errors to 409', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/features/feats/api/validation', () => ({
            createFeatSchema: {
                safeParse: vi.fn().mockReturnValue({
                    success: true,
                    data: { name: 'Sharpshooter' },
                }),
            },
        }));
        vi.doMock('@/features/feats/api/feats-service', () => ({
            listFeats: vi.fn(),
            createFeat: vi.fn().mockRejectedValue(new Error('já existe um talento com este nome.')),
        }));

        const mod = await importFresh<typeof import('@/app/api/feats/route')>('@/app/api/feats/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/feats', {
            method: 'POST',
            body: JSON.stringify({ name: 'Sharpshooter' }),
        }));

        expect(response.status).toBe(409);
    });

    it('listFeats applies non-admin active filtering, source regex matching, and local pagination', async () => {
        vi.doUnmock('@/features/feats/api/feats-service');
        const find = vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    { _id: '1', name: 'A', status: 'active', level: 1, source: 'PHB p. 1' },
                    { _id: '2', name: 'B', status: 'active', level: 2, source: 'XPHB p. 2' },
                ]),
            }),
        });
        const applyFuzzySearch = vi.fn().mockImplementation((items) => items.slice().reverse());

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/feats/models/feat', () => ({
            Feat: { find },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }));
        vi.doMock('@/core/utils/search-engine', () => ({
            applyFuzzySearch,
        }));

        const mod = await importFresh<typeof import('@/features/feats/api/feats-service')>('@/features/feats/api/feats-service');
        const result = await mod.listFeats({
            search: 'b',
            sources: ['PHB', 'XPHB'],
        }, 1, 1, false);

        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            status: 'active',
            source: { $in: [expect.any(RegExp), expect.any(RegExp)] },
        }));
        expect(applyFuzzySearch).toHaveBeenCalled();
        expect(result.items).toEqual([{ _id: '2', name: 'B', status: 'active', level: 2, source: 'XPHB p. 2' }]);
        expect(result.total).toBe(2);
        expect(result.totalPages).toBe(2);
    });

    it('getFeatById hides inactive feats from non-admins', async () => {
        vi.doUnmock('@/features/feats/api/feats-service');
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/feats/models/feat', () => ({
            Feat: {
                findById: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ _id: '1', status: 'inactive' }),
                }),
            },
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }));
        vi.doMock('@/core/utils/search-engine', () => ({
            applyFuzzySearch: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/features/feats/api/feats-service')>('@/features/feats/api/feats-service');

        await expect(mod.getFeatById('1', false)).rejects.toThrow('Talento não encontrado ou inativo.');
    });
});
