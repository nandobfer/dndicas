import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';

const actor = { id: 'user-1', name: 'Heroína', role: 'user' as const };

type DomainErrorArgs = [status: number, message: string, code: string];

/** Erro de domínio criado na mesma instância do módulo que a rota usa (o import é refeito a cada teste). */
const domainError = (...args: DomainErrorArgs) => ({ domainError: args });

type Outcome = { value: unknown } | { domainError: DomainErrorArgs };

function mockRoute({ actorOutcome, imageOutcome }: { actorOutcome: Outcome; imageOutcome?: Outcome }) {
    const generateAndStoreDndImage = vi.fn();
    vi.doMock('@/features/auth/server/actor', async () => {
        const { DomainError } = await import('@/lib/api/route');
        return {
            requireActor: vi.fn(async () => {
                if ('domainError' in actorOutcome) throw new DomainError(...actorOutcome.domainError);
                return actorOutcome.value;
            }),
        };
    });
    vi.doMock('@/features/ai/server/image-generator', async () => {
        const { DomainError } = await import('@/lib/api/route');
        generateAndStoreDndImage.mockImplementation(async () => {
            if (imageOutcome && 'domainError' in imageOutcome) throw new DomainError(...imageOutcome.domainError);
            return imageOutcome?.value;
        });
        return { generateAndStoreDndImage };
    });
    return generateAndStoreDndImage;
}

async function post(body: unknown) {
    vi.resetModules();
    const mod = await import('@/app/api/core/ai/image/route');
    return mod.POST(makeJsonRequest('http://localhost/api/core/ai/image', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({}) });
}

describe('POST /api/core/ai/image', () => {
    it('exige usuário logado', async () => {
        const generateAndStoreDndImage = mockRoute({ actorOutcome: domainError(401, 'Faça login para continuar.', 'UNAUTHENTICATED') });

        const response = await post({ prompt: 'draw a dragon' });

        expect(response.status).toBe(401);
        expect(generateAndStoreDndImage).not.toHaveBeenCalled();
    });

    it('valida o payload (prompt ou dados do formulário)', async () => {
        const generateAndStoreDndImage = mockRoute({ actorOutcome: { value: actor } });

        const response = await post({ prompt: '' });

        expect(response.status).toBe(400);
        expect(generateAndStoreDndImage).not.toHaveBeenCalled();
    });

    it('gera pelo agente "Gerador de imagens" com o JSON do formulário e devolve a imagem gravada', async () => {
        const generateAndStoreDndImage = mockRoute({
            actorOutcome: { value: actor },
            imageOutcome: { value: { key: 'ai/generated/user-1/1.png', url: '/api/upload?key=ai%2Fgenerated%2Fuser-1%2F1.png', mimeType: 'image/png' } },
        });

        const formData = { name: 'Bola de Fogo', circle: 3 };
        const response = await post({ entityLabel: 'Magia', preferredAspectRatio: '1:1', formData });
        const payload = await readJson<{ success: boolean; data: { key: string; url: string; mimeType: string } }>(response);

        expect(response.status).toBe(201);
        expect(payload.data).toEqual({ key: 'ai/generated/user-1/1.png', url: '/api/upload?key=ai%2Fgenerated%2Fuser-1%2F1.png', mimeType: 'image/png' });
        expect(generateAndStoreDndImage).toHaveBeenCalledWith({ entityLabel: 'Magia', preferredAspectRatio: '1:1', formData, userId: 'user-1' });
    });

    it('responde 409 em pt-BR quando o agente não está configurado (sem fallback)', async () => {
        mockRoute({ actorOutcome: { value: actor }, imageOutcome: domainError(409, 'O agente "Gerador de imagens" está desativado.', 'AI_IMAGE_UNAVAILABLE') });

        const response = await post({ prompt: 'um dragão vermelho' });
        const payload = await readJson<{ success: boolean; error: string; code: string }>(response);

        expect(response.status).toBe(409);
        expect(payload.code).toBe('AI_IMAGE_UNAVAILABLE');
        expect(payload.error).toContain('Gerador de imagens');
    });

    it('responde 422 quando a imagem gerada excede 5MB', async () => {
        mockRoute({ actorOutcome: { value: actor }, imageOutcome: domainError(422, 'A imagem gerada excedeu o limite de 5MB.', 'AI_IMAGE_TOO_LARGE') });

        const response = await post({ prompt: 'um dragão vermelho' });

        expect(response.status).toBe(422);
    });
});
