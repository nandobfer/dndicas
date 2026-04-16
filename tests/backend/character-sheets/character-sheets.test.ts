import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('character sheets backend', () => {
    it('getAllUserSheets performs Fuse search, paginates, and computes hasNextPage', async () => {
        const sheetDocs = [
            { _id: 'sheet-1', name: 'Aragorn', class: 'Ranger', race: 'Humano', subclass: 'Hunter', updatedAt: new Date('2024-01-03T00:00:00.000Z') },
            { _id: 'sheet-2', name: 'Gandalf', class: 'Wizard', race: 'Maia', subclass: '—', updatedAt: new Date('2024-01-02T00:00:00.000Z') },
        ];
        const equippedItems = [{ sheetId: 'sheet-2', equipped: true }];

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('fuse.js', () => ({
            default: class FuseMock {
                constructor(private readonly items: unknown[]) {}
                search() {
                    return [{ item: (this.items as typeof sheetDocs)[1] }];
                }
            },
        }));
        vi.doMock('@/features/character-sheets/realtime/character-sheet-pusher-service', () => ({
            CharacterSheetPusherService: class {},
        }));
        vi.doMock('@/features/character-sheets/models/character-sheet', () => ({
            CharacterSheet: {
                find: vi.fn(() => ({
                    sort: vi.fn(() => ({
                        lean: vi.fn().mockResolvedValue(sheetDocs),
                    })),
                })),
            },
        }));
        vi.doMock('@/features/character-sheets/models/character-item', () => ({
            CharacterItem: {
                find: vi.fn(() => ({
                    lean: vi.fn().mockResolvedValue(equippedItems),
                })),
            },
        }));
        vi.doMock('@/features/character-sheets/models/character-spell', () => ({
            CharacterSpell: { find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })), updateMany: vi.fn() },
        }));
        vi.doMock('@/features/character-sheets/models/character-trait', () => ({
            CharacterTrait: { find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) })) },
        }));
        vi.doMock('@/features/character-sheets/models/character-feat', () => ({
            CharacterFeat: { find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) },
        }));
        vi.doMock('@/features/character-sheets/models/character-attack', () => ({
            CharacterAttack: { find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) },
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { collection: { name: 'users' } },
        }));
        vi.doMock('@/features/character-sheets/utils/slug', () => ({
            generateSlug: vi.fn(),
        }));
        vi.doMock('@/features/character-sheets/utils/dnd-calculations', () => ({
            getArmorClass: vi.fn().mockReturnValue(15),
        }));

        const mod = await importFresh<typeof import('@/features/character-sheets/api/character-sheets-service')>('@/features/character-sheets/api/character-sheets-service');
        const result = await mod.getAllUserSheets('clerk-1', 'gandalf', 1, 1);

        expect(result.total).toBe(1);
        expect(result.totalPages).toBe(1);
        expect(result.hasNextPage).toBe(false);
        expect(result.sheets).toHaveLength(1);
    });

    it('GET /api/character-sheets returns 401 for anonymous users', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/features/character-sheets/api/character-sheets-service', () => ({
            getAllUserSheets: vi.fn(),
            createBlankSheet: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/character-sheets/route')>('@/app/api/character-sheets/route');
        const response = await mod.GET(new Request('http://localhost/api/character-sheets'));

        expect(response.status).toBe(401);
    });

    it('POST /api/character-sheets creates a blank sheet with derived username fallback', async () => {
        const createBlankSheet = vi.fn().mockResolvedValue({ _id: 'sheet-1' });

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
            currentUser: vi.fn().mockResolvedValue({
                username: null,
                firstName: 'Hero',
            }),
        }));
        vi.doMock('@/features/character-sheets/api/character-sheets-service', () => ({
            getAllUserSheets: vi.fn(),
            createBlankSheet,
        }));

        const mod = await importFresh<typeof import('@/app/api/character-sheets/route')>('@/app/api/character-sheets/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/character-sheets', {
            method: 'POST',
            body: JSON.stringify({ name: 'Nova Ficha' }),
        }));

        expect(response.status).toBe(201);
        expect(createBlankSheet).toHaveBeenCalledWith('clerk-1', 'hero', 'Nova Ficha');
    });

    it('GET /api/character-sheets/by-slug validates missing slug', async () => {
        vi.doMock('@/features/character-sheets/api/character-sheets-service', () => ({
            getSheetBySlug: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/character-sheets/by-slug/route')>('@/app/api/character-sheets/by-slug/route');
        const response = await mod.GET(new NextRequest('http://localhost/api/character-sheets/by-slug'));

        expect(response.status).toBe(400);
    });

    it('PATCH /api/character-sheets/[id] validates request body before patching', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/core/realtime/pusher-origin', () => ({
            PUSHER_ORIGIN_HEADER: 'x-pusher-origin',
        }));
        vi.doMock('@/features/character-sheets/api/character-sheets-service', () => ({
            getSheetById: vi.fn(),
            patchSheet: vi.fn(),
            deleteSheet: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/character-sheets/[id]/route')>('@/app/api/character-sheets/[id]/route');
        const response = await mod.PATCH(makeJsonRequest('http://localhost/api/character-sheets/sheet-1', {
            method: 'PATCH',
            body: JSON.stringify({ level: 99 }),
        }), { params: Promise.resolve({ id: 'sheet-1' }) });
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.error).toBe('Dados inválidos');
    });

    it('POST /api/character-sheets/[id]/long-rest forwards pusher origin and maps missing sheets to 404', async () => {
        const applyLongRest = vi.fn().mockResolvedValue(null);

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
        }));
        vi.doMock('@/core/realtime/pusher-origin', () => ({
            PUSHER_ORIGIN_HEADER: 'x-pusher-origin',
        }));
        vi.doMock('@/features/character-sheets/api/character-sheets-service', () => ({
            applyLongRest,
        }));

        const mod = await importFresh<typeof import('@/app/api/character-sheets/[id]/long-rest/route')>('@/app/api/character-sheets/[id]/long-rest/route');
        const response = await mod.POST(new Request('http://localhost/api/character-sheets/sheet-1/long-rest', {
            method: 'POST',
            headers: { 'x-pusher-origin': 'origin-1' },
        }), { params: Promise.resolve({ id: 'sheet-1' }) });

        expect(response.status).toBe(404);
        expect(applyLongRest).toHaveBeenCalledWith('sheet-1', 'clerk-1', 'origin-1');
    });
});
