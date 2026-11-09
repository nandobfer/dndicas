import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getIntegration: vi.fn(), listAiModels: vi.fn() }));

vi.mock('@/lib/integrations/config', () => ({ getIntegration: mocks.getIntegration, isIntegrationConfigured: vi.fn(() => true) }));
vi.mock('@/lib/ai/catalog', () => ({ clearAiCatalogCache: vi.fn(), listAiModels: mocks.listAiModels, listAiAgents: vi.fn() }));
vi.mock('@/lib/ai/opencode', () => ({ getOpencodeInfo: vi.fn() }));

import { AiProviderError } from '@/lib/ai/errors';
import { testOpencodeGo } from '@/features/ai/server/testers';
import { INTEGRATION_TESTERS } from '@/features/integrations/testers/testers';

const model = (id: string, free = false) => ({ id, name: id, variants: [], group: null, contextWindow: null, free });
const run = (emit = vi.fn()) => testOpencodeGo({ emit, signal: new AbortController().signal });

describe('tester do OpenCode Go', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getIntegration.mockResolvedValue({ values: { apiKey: 'oc_sk_x' }, version: 'v1' });
    });

    it('está registrado para a integração ai_opencode_go', () => {
        expect(INTEGRATION_TESTERS.ai_opencode_go).toBe(testOpencodeGo);
    });

    it('confere a chave listando os modelos do Go e avisa sobre os grátis', async () => {
        mocks.listAiModels.mockResolvedValue([model('deepseek-v4.1-flash'), model('deepseek-v4-pro'), model('beam-free', true)]);
        const emit = vi.fn();

        await expect(run(emit)).resolves.toBe('API key válida; 3 modelo(s)');
        expect(mocks.listAiModels).toHaveBeenCalledWith('opencode-go', expect.objectContaining({ fresh: true }));
        expect(emit).toHaveBeenCalledWith('step', 'GET /models');
        expect(emit).toHaveBeenCalledWith('info', expect.stringContaining('1 modelo(s) grátis'));
    });

    it('sem chave: falha acionável sem chamar o Go', async () => {
        mocks.getIntegration.mockResolvedValue({ values: {}, version: 'v1' });

        await expect(run()).rejects.toThrow('Sem API key: cadastre a chave da assinatura OpenCode Go (oc_sk_…) em Campos privados');
        expect(mocks.listAiModels).not.toHaveBeenCalled();
    });

    it('chave recusada: repassa a mensagem pt-BR do provedor', async () => {
        mocks.listAiModels.mockRejectedValue(new AiProviderError('O OpenCode Go recusou a API key (HTTP 401): confira a chave oc_sk_… da assinatura Go'));

        await expect(run()).rejects.toThrow('O OpenCode Go recusou a API key (HTTP 401)');
    });
});
