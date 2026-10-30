import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, makeRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('auxiliary backend routes', () => {
    it('GET /api/sources returns 400 for unsupported entities', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: {} }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=unknown'));

        expect(response.status).toBe(400);
    });

    it('GET /api/sources normalizes, de-duplicates, and sorts source book names', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: { distinct: vi.fn().mockResolvedValue(['XPHB p. 2', 'PHB p. 1', 'PHB p. 99']) } }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: {} }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=spells'));
        const payload = await readJson<{
            sources: string[];
        }>(response);

        expect(response.status).toBe(200);
        expect(payload.sources).toEqual(['Livro do Jogador']);
    });

    it('GET /api/sources supports monster sources', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { distinct: vi.fn().mockResolvedValue(['LDM p. 12', 'XMM p. 5', 'LDM p. 99']) } }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=monsters'));
        const payload = await readJson<{
            sources: string[];
        }>(response);

        expect(response.status).toBe(200);
        expect(payload.sources).toEqual(['Monster Manual', 'Monster Manual 2024']);
    });

    it('GET /api/sources rejects anonymous user NPC sources', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: {} }));
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }));
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { distinct: vi.fn() } }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=npcs'));

        expect(response.status).toBe(401);
    });

    it('GET /api/sources returns only authenticated user NPC sources', async () => {
        const distinct = vi.fn().mockResolvedValue(['Homebrew', 'Guilda pág. 12', 'Guilda pág. 99']);

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: {} }));
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }));
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { distinct } }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=npcs'));
        const payload = await readJson<{
            sources: string[];
        }>(response);

        expect(response.status).toBe(200);
        expect(distinct).toHaveBeenCalledWith('source', { userId: 'user-1' });
        expect(payload.sources).toEqual(['Guilda', 'Homebrew']);
    });

    it('GET /api/sources includes subclass sources for classes', async () => {
        const distinct = vi.fn((path: string) => {
            if (path === 'source') return Promise.resolve(['LDJ p. 70', 'XPHB p. 50']);
            if (path === 'subclasses.source') return Promise.resolve(['TCE p. 29', 'LDJ p. 72']);
            return Promise.resolve([]);
        });

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: { distinct } }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: {} }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(makeRequest('http://localhost/api/sources?entity=classes'));
        const payload = await readJson<{
            sources: string[];
        }>(response);

        expect(response.status).toBe(200);
        expect(distinct).toHaveBeenCalledWith('source');
        expect(distinct).toHaveBeenCalledWith('subclasses.source');
        expect(payload.sources).toEqual(['Livro do Jogador', "Tasha's Cauldron of Everything"]);
    });

    it('GET /api/core/health returns a healthy payload even when dbConnect throws', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockRejectedValue(new Error('down')),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/health/route')>('@/app/api/core/health/route');
        const response = await mod.GET(makeRequest('http://localhost/api/core/health'));
        const payload = await readJson<{
            success: boolean;
            data: {
                database: string;
            };
        }>(response);

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.database).toBe('error');
    });

    it('GET /api/realtime/pusher-config returns 503 when realtime is unavailable', async () => {
        vi.doMock('@/core/realtime/pusher-service', () => ({
            PusherService: {
                getInstance: vi.fn(() => ({
                    getClientConfig: vi.fn(() => {
                        throw new Error('Realtime indisponível.');
                    }),
                })),
            },
        }));

        const mod = await importFresh<typeof import('@/app/api/realtime/pusher-config/route')>('@/app/api/realtime/pusher-config/route');
        const response = await mod.GET(makeJsonRequest('http://localhost/api/realtime/pusher-config'));

        expect(response.status).toBe(503);
    });

    it('POST /api/core/email returns 401 when requireAuth rejects', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn().mockRejectedValue(new Error('UNAUTHORIZED')),
        }));
        vi.doMock('@/core/email/mailer', () => ({
            sendEmail: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/email/route')>('@/app/api/core/email/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/email', {
            method: 'POST',
            body: JSON.stringify({ to: 'hero@example.com', subject: 'Hello', html: '<p>Hi</p>' }),
        }));

        expect(response.status).toBe(401);
    });

    it('POST /api/core/email validates request payloads', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn().mockResolvedValue('clerk-1'),
        }));
        vi.doMock('@/core/email/mailer', () => ({
            sendEmail: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/email/route')>('@/app/api/core/email/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/email', {
            method: 'POST',
            body: JSON.stringify({ to: 'bad-email', subject: '', html: '' }),
        }));

        expect(response.status).toBe(400);
    });

    it('POST /api/core/storage/upload requires a file', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn().mockResolvedValue('clerk-1'),
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/storage/upload/route')>('@/app/api/core/storage/upload/route');
        const form = new FormData();
        const response = await mod.POST(makeRequest('http://localhost/api/core/storage/upload', {
            method: 'POST',
            body: form,
        }));
        const payload = await readJson<{
            code: string;
        }>(response);

        expect(response.status).toBe(400);
        expect(payload.code).toBe('FILE_REQUIRED');
    });

    it('GET /api/admin/mention-audit requires admin users', async () => {
        vi.doMock('@/core/auth/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
            currentUser: vi.fn().mockResolvedValue({
                can: () => false,
            }),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: { find: vi.fn() } }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: { find: vi.fn() } }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: { find: vi.fn() } }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: { find: vi.fn() } }));

        const mod = await importFresh<typeof import('@/app/api/admin/mention-audit/route')>('@/app/api/admin/mention-audit/route');
        const response = await mod.GET(makeRequest('http://localhost/api/admin/mention-audit'));

        expect(response.status).toBe(401);
    });
});
