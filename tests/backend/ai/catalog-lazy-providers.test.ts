import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listGeminiModels: vi.fn(),
    listOpenaiModels: vi.fn(),
    listOpencodeAgents: vi.fn(),
    imageListers: { gemini: vi.fn(), openai: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/db/models/IntegrationStatus', () => ({ IntegrationStatus: { find: vi.fn() } }));
vi.mock('@/lib/integrations/config', () => ({
    getIntegration: vi.fn(async () => ({ version: 'v1' })),
    isIntegrationConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/ai/gemini', () => ({ listGeminiModels: mocks.listGeminiModels }));
vi.mock('@/lib/ai/openai', () => ({ listOpenaiModels: mocks.listOpenaiModels }));
vi.mock('@/lib/ai/opencode', () => ({ listOpencodeAgents: mocks.listOpencodeAgents, listOpencodeModels: vi.fn() }));
vi.mock('@/lib/ai/image', () => ({ IMAGE_MODEL_LISTERS: mocks.imageListers }));

import { clearAiCatalogCache, listAiAgents, listAiImageModels, listAiModels } from '@/lib/ai/catalog';

const model = (id: string) => ({ id, name: id, variants: [], group: null, contextWindow: null, free: false });

describe('lib/ai/catalog — listagens com provedores sob demanda', () => {
    beforeEach(() => {
        clearAiCatalogCache();
    });

    it('lista os modelos pelo módulo do provedor e guarda em cache por versão', async () => {
        mocks.listGeminiModels.mockResolvedValue([model('gemini-x')]);

        await expect(listAiModels('gemini')).resolves.toEqual([model('gemini-x')]);
        await expect(listAiModels('gemini')).resolves.toEqual([model('gemini-x')]);

        expect(mocks.listGeminiModels).toHaveBeenCalledTimes(1);
        expect(mocks.listOpenaiModels).not.toHaveBeenCalled();
    });

    it('propaga a falha do provedor (sem cachear o erro)', async () => {
        mocks.listOpenaiModels.mockRejectedValueOnce(new Error('HTTP 401')).mockResolvedValueOnce([model('gpt-x')]);

        await expect(listAiModels('openai')).rejects.toThrow('HTTP 401');
        await expect(listAiModels('openai')).resolves.toEqual([model('gpt-x')]);
    });

    it('lista agentes do OpenCode e modelos de imagem sob demanda', async () => {
        mocks.listOpencodeAgents.mockResolvedValue([{ id: 'build', name: 'build' }]);
        mocks.imageListers.gemini.mockResolvedValue([model('imagen-x')]);

        await expect(listAiAgents()).resolves.toEqual([{ id: 'build', name: 'build' }]);
        await expect(listAiImageModels('gemini')).resolves.toEqual([model('imagen-x')]);
        expect(mocks.imageListers.openai).not.toHaveBeenCalled();
    });
});
