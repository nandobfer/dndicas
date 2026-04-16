import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('auxiliary backend routes', () => {
    it('GET /api/sources returns 400 for unsupported entities', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/core/utils/source-utils', () => ({
            extractBookName: vi.fn((value: string) => value),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: {} }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(new Request('http://localhost/api/sources?entity=unknown'));

        expect(response.status).toBe(400);
    });

    it('GET /api/sources normalizes, de-duplicates, and sorts source book names', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/core/utils/source-utils', () => ({
            extractBookName: vi.fn((value: string) => value.split(' p.')[0]),
        }));
        vi.doMock('@/features/spells/models/spell', () => ({ Spell: { distinct: vi.fn().mockResolvedValue(['XPHB p. 2', 'PHB p. 1', 'PHB p. 99']) } }));
        vi.doMock('@/features/classes/models/character-class', () => ({ CharacterClass: {} }));
        vi.doMock('@/features/races/models/race', () => ({ RaceModel: {} }));
        vi.doMock('@/features/backgrounds/models/background', () => ({ BackgroundModel: {} }));
        vi.doMock('@/features/feats/models/feat', () => ({ Feat: {} }));
        vi.doMock('@/core/database/models/reference', () => ({ Reference: {} }));
        vi.doMock('@/features/traits/database/trait', () => ({ Trait: {} }));
        vi.doMock('@/features/items/database/item', () => ({ ItemModel: {} }));

        const mod = await importFresh<typeof import('@/app/api/sources/route')>('@/app/api/sources/route');
        const response = await mod.GET(new Request('http://localhost/api/sources?entity=spells'));
        const payload = await readJson(response);

        expect(response.status).toBe(200);
        expect(payload.sources).toEqual(['PHB', 'XPHB']);
    });

    it('GET /api/core/health returns a healthy payload even when dbConnect throws', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockRejectedValue(new Error('down')),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/health/route')>('@/app/api/core/health/route');
        const response = await mod.GET(new Request('http://localhost/api/core/health'));
        const payload = await readJson(response);

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
        const response = await mod.GET();

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

    it('POST /api/core/ai validates request payloads', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn(),
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateText: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/ai/route')>('@/app/api/core/ai/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai', {
            method: 'POST',
            body: JSON.stringify({ prompt: '' }),
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
        const response = await mod.POST(new Request('http://localhost/api/core/storage/upload', {
            method: 'POST',
            body: form,
        }));
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.code).toBe('FILE_REQUIRED');
    });

    it('POST /api/feedback strips admin-only fields for non-admin creators', async () => {
        const create = vi.fn().mockResolvedValue({ _id: 'feedback-1' });

        vi.doMock('@clerk/nextjs/server', () => ({
            currentUser: vi.fn().mockResolvedValue({
                id: 'clerk-1',
                fullName: 'Hero Player',
                username: 'hero',
                emailAddresses: [{ emailAddress: 'hero@example.com' }],
                publicMetadata: { role: 'user' },
            }),
        }));
        vi.doMock('@/features/feedback/api/feedback.model', () => ({
            FeedbackModel: {
                find: vi.fn(),
                countDocuments: vi.fn(),
                create,
            },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/feedback/route')>('@/app/api/feedback/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/feedback', {
            method: 'POST',
            body: JSON.stringify({
                title: 'Bug',
                description: 'Descrição suficientemente longa para validar.',
                type: 'bug',
                status: 'concluido',
                priority: 'alta',
            }),
        }));

        expect(response.status).toBe(201);
        expect(create).toHaveBeenCalledWith(expect.not.objectContaining({
            status: 'concluido',
            priority: 'alta',
        }));
    });

    it('PATCH /api/feedback/[id] blocks non-owner non-admin users', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-2' }),
            currentUser: vi.fn().mockResolvedValue({
                publicMetadata: { role: 'user' },
            }),
        }));
        vi.doMock('@/features/feedback/api/feedback.model', () => ({
            FeedbackModel: {
                findById: vi.fn().mockResolvedValue({ createdBy: 'clerk-1' }),
                findByIdAndUpdate: vi.fn(),
            },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/feedback/[id]/route')>('@/app/api/feedback/[id]/route');
        const response = await mod.PATCH(makeJsonRequest('http://localhost/api/feedback/feedback-1', {
            method: 'PATCH',
            body: JSON.stringify({ title: 'Updated title' }),
        }), { params: Promise.resolve({ id: 'feedback-1' }) });

        expect(response.status).toBe(403);
    });

    it('GET /api/admin/mention-audit requires admin users', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
            currentUser: vi.fn().mockResolvedValue({
                publicMetadata: { role: 'user' },
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
        const response = await mod.GET(new Request('http://localhost/api/admin/mention-audit'));

        expect(response.status).toBe(401);
    });
});
