import { describe, expect, it, vi } from 'vitest';
import { makeRequest } from '../helpers/http';
import { importFresh } from '../helpers/module';

const permissions: string[] = [];

function mockActor(result: 'admin' | 'user' | 'anonymous') {
    vi.doMock('@/features/auth/server/actor', () => ({
        requireAdminActor: vi.fn(async (permission: string) => {
            permissions.push(permission);
            // Importado aqui: o `importFresh` recria o módulo e o `withRoute` só reconhece a classe nova.
            const { DomainError } = await import('@/lib/api/route');
            if (result === 'anonymous') throw new DomainError(401, 'Faça login para continuar.', 'UNAUTHORIZED');
            if (result === 'user') throw new DomainError(403, 'Acesso restrito a administradores.', 'FORBIDDEN');
            return { id: 'admin-1', name: 'Ana', role: 'admin' };
        }),
    }));
}

function mockUsage() {
    const getOpencodeUsage = vi.fn(async () => ({ origins: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, coverageFrom: null }));
    vi.doMock('@/features/ai/server/opencode-usage', () => ({ getOpencodeUsage }));
    return getOpencodeUsage;
}

const loadRoute = () => importFresh<typeof import('@/app/api/ai/providers/opencode-go/usage/route')>('@/app/api/ai/providers/opencode-go/usage/route');
const get = async (url: string) => (await loadRoute()).GET(makeRequest(url), { params: Promise.resolve({}) } as never);

describe('GET /api/ai/providers/opencode-go/usage', () => {
    it('exige a permissão de ver a IA: visitante 401, sem permissão 403, sem consultar o consumo', async () => {
        permissions.length = 0;
        for (const [who, status] of [['anonymous', 401], ['user', 403]] as const) {
            mockActor(who);
            const getOpencodeUsage = mockUsage();
            const response = await get('http://localhost/api/ai/providers/opencode-go/usage');
            expect(response.status).toBe(status);
            expect(getOpencodeUsage).not.toHaveBeenCalled();
        }
        expect(permissions).toEqual(['integrations.ai.view', 'integrations.ai.view']);
    });

    it('período inválido responde 400 sem consultar', async () => {
        mockActor('admin');
        const getOpencodeUsage = mockUsage();

        const response = await get('http://localhost/api/ai/providers/opencode-go/usage?from=2026-11-09T00:00:00Z&to=2026-11-01T00:00:00Z');

        expect(response.status).toBe(400);
        expect(getOpencodeUsage).not.toHaveBeenCalled();
    });

    it('consulta o consumo do OpenCode Go no período pedido', async () => {
        mockActor('admin');
        const getOpencodeUsage = mockUsage();

        const response = await get('http://localhost/api/ai/providers/opencode-go/usage?from=2026-11-01T00:00:00.000Z');

        expect(response.status).toBe(200);
        expect(getOpencodeUsage).toHaveBeenCalledWith({ from: '2026-11-01T00:00:00.000Z' }, 'opencode-go');
        expect((await response.json()).success).toBe(true);
    });
});
