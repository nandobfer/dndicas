import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('POST /api/core/ai/image', () => {
    it('requires an authenticated user', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn().mockRejectedValue(new Error('UNAUTHORIZED')),
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateImage: vi.fn(),
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile: vi.fn(),
            buildFileProxyUrl: vi.fn(),
            getImageExtensionFromMimeType: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/ai/image/route')>('@/app/api/core/ai/image/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', {
            method: 'POST',
            body: JSON.stringify({ prompt: 'draw a dragon' }),
        }));

        expect(response.status).toBe(401);
    });

    it('validates request payloads', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn().mockResolvedValue('clerk-1'),
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateImage: vi.fn(),
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile: vi.fn(),
            buildFileProxyUrl: vi.fn(),
            getImageExtensionFromMimeType: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/ai/image/route')>('@/app/api/core/ai/image/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', {
            method: 'POST',
            body: JSON.stringify({ prompt: '' }),
        }));
        const payload = await readJson<{ code: string }>(response);

        expect(response.status).toBe(400);
        expect(payload.code).toBe('VALIDATION_ERROR');
    });

    it('generates an image from full form JSON, uploads it to storage, and returns the saved asset metadata', async () => {
        const requireAuth = vi.fn().mockResolvedValue('clerk-1');
        const generateImage = vi.fn().mockResolvedValue({
            buffer: Buffer.from('generated-image'),
            mimeType: 'image/png',
        });
        const uploadFile = vi.fn().mockResolvedValue(undefined);
        const buildFileProxyUrl = vi.fn((key: string) => `/api/upload?key=${encodeURIComponent(key)}`);
        const getImageExtensionFromMimeType = vi.fn().mockReturnValue('png');

        vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

        vi.doMock('@/core/auth', () => ({
            requireAuth,
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateImage,
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile,
            buildFileProxyUrl,
            getImageExtensionFromMimeType,
        }));

        const mod = await importFresh<typeof import('@/app/api/core/ai/image/route')>('@/app/api/core/ai/image/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', {
            method: 'POST',
            body: JSON.stringify({
                entityLabel: 'Classe',
                formData: {
                    name: 'Guerreiro',
                    description: 'Combatente marcial veterano.',
                    hitDice: 'd10',
                },
                preferredAspectRatio: '1:1',
                model: 'gemini-image-test',
            }),
        }));
        const payload = await readJson<{
            success: boolean;
            data: {
                key: string;
                url: string;
                mimeType: string;
            };
        }>(response);

        expect(response.status).toBe(201);
        expect(requireAuth).toHaveBeenCalledTimes(1);
        expect(generateImage).toHaveBeenCalledWith(expect.stringContaining('Dungeons & Dragons 5e'), 'gemini-image-test', 'clerk-1');
        expect(generateImage).toHaveBeenCalledWith(expect.stringContaining('"name": "Guerreiro"'), 'gemini-image-test', 'clerk-1');
        expect(generateImage).toHaveBeenCalledWith(expect.stringContaining('Contexto principal da entidade: Classe.'), 'gemini-image-test', 'clerk-1');
        expect(getImageExtensionFromMimeType).toHaveBeenCalledWith('image/png');
        expect(uploadFile).toHaveBeenCalledWith('ai/generated/clerk-1/1700000000000.png', Buffer.from('generated-image'), 'image/png');
        expect(payload.success).toBe(true);
        expect(payload.data).toEqual({
            key: 'ai/generated/clerk-1/1700000000000.png',
            url: '/api/upload?key=ai%2Fgenerated%2Fclerk-1%2F1700000000000.png',
            mimeType: 'image/png',
        });
    });

    it('logs the parsed AI image payload received by the server', async () => {
        const requireAuth = vi.fn().mockResolvedValue('clerk-1');
        const generateImage = vi.fn().mockResolvedValue({
            buffer: Buffer.from('generated-image'),
            mimeType: 'image/png',
        });
        const uploadFile = vi.fn().mockResolvedValue(undefined);
        const buildFileProxyUrl = vi.fn((key: string) => `/api/upload?key=${encodeURIComponent(key)}`);
        const getImageExtensionFromMimeType = vi.fn().mockReturnValue('png');
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        vi.spyOn(Date, 'now').mockReturnValue(1700000000001);

        vi.doMock('@/core/auth', () => ({
            requireAuth,
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateImage,
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile,
            buildFileProxyUrl,
            getImageExtensionFromMimeType,
        }));

        const formData = {
            name: 'Kael',
            equippedItems: [{ name: 'Armadura de placas', quantity: 1, type: 'armadura' }],
        };

        const mod = await importFresh<typeof import('@/app/api/core/ai/image/route')>('@/app/api/core/ai/image/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', {
            method: 'POST',
            body: JSON.stringify({
                entityLabel: 'Personagem',
                formData,
                preferredAspectRatio: '3:4',
            }),
        }));

        expect(response.status).toBe(201);
        expect(consoleLogSpy).toHaveBeenCalledWith('[AI image] Received payload', {
            prompt: undefined,
            model: undefined,
            entityLabel: 'Personagem',
            preferredAspectRatio: '3:4',
            formData,
        });

        consoleLogSpy.mockRestore();
    });

    it('rejects generated images larger than 5MB before upload', async () => {
        const requireAuth = vi.fn().mockResolvedValue('clerk-1');
        const generateImage = vi.fn().mockResolvedValue({
            buffer: Buffer.alloc((5 * 1024 * 1024) + 1),
            mimeType: 'image/png',
        });
        const uploadFile = vi.fn().mockResolvedValue(undefined);

        vi.doMock('@/core/auth', () => ({
            requireAuth,
        }));
        vi.doMock('@/core/ai/genai', () => ({
            generateImage,
        }));
        vi.doMock('@/core/storage/s3', () => ({
            uploadFile,
            buildFileProxyUrl: vi.fn(),
            getImageExtensionFromMimeType: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/core/ai/image/route')>('@/app/api/core/ai/image/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', {
            method: 'POST',
            body: JSON.stringify({
                entityLabel: 'Monstro',
                formData: { name: 'Dragão Vermelho Adulto' },
            }),
        }));
        const payload = await readJson<{ code: string }>(response);

        expect(response.status).toBe(422);
        expect(payload.code).toBe('AI_IMAGE_TOO_LARGE');
        expect(uploadFile).not.toHaveBeenCalled();
    });
});
