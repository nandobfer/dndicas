import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    fetch: vi.fn(),
    createOpenAICompatible: vi.fn(),
}));

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }));
vi.mock('@/lib/integrations/debug', () => ({
    integrationDebug: vi.fn(() => ({})),
    debugFetch: vi.fn((_dbg: unknown, _label: string, url: string, init: RequestInit) => fetch(url, init)),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: mocks.createOpenAICompatible }));

import { AiProviderError } from '@/lib/ai/errors';
import {
    createOpencodeGoProvider,
    listOpencodeGoModels,
    OPENCODE_GO_API_URL,
    OPENCODE_GO_USER_AGENT,
    opencodeGoFetch,
    opencodeGoMetadataExtractor,
    opencodeGoSessionId,
    readOpencodeGoBilling,
} from '@/lib/ai/opencode-go';

const KEY = 'oc_sk_segredo_do_dono';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.config.mockResolvedValue({ apiKey: KEY });
    mocks.createOpenAICompatible.mockImplementation(() => vi.fn());
});

describe('lib/ai/opencode-go — listagem de modelos', () => {
    it('lista os modelos do /models em ordem, marcando os *-free como grátis', async () => {
        mocks.fetch.mockResolvedValue(json({ object: 'list', data: [{ id: 'glm-5.3' }, { id: 'deepseek-v4.1-flash' }, { id: 'beam-free' }, { id: 'deepseek-v4-pro' }] }));

        const models = await listOpencodeGoModels();

        expect(models.map((model) => model.id)).toEqual(['beam-free', 'deepseek-v4-pro', 'deepseek-v4.1-flash', 'glm-5.3']);
        expect(models.find((model) => model.id === 'beam-free')).toMatchObject({ free: true, group: 'beam' });
        expect(models.find((model) => model.id === 'deepseek-v4.1-flash')).toMatchObject({ free: false, group: 'deepseek', variants: [] });
        const [url, init] = mocks.fetch.mock.calls[0]!;
        expect(url).toBe(`${OPENCODE_GO_API_URL}/models`);
        expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, 'User-Agent': OPENCODE_GO_USER_AGENT });
    });

    it('sem chave: erro acionável em pt-BR e nenhuma chamada', async () => {
        mocks.config.mockResolvedValue({});

        await expect(listOpencodeGoModels()).rejects.toThrow('OpenCode Go sem API key: configure em Integrações › Provedores de IA › OpenCode Go');
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it.each([401, 403])('chave recusada (HTTP %i): mensagem pt-BR sem a chave', async (status) => {
        mocks.fetch.mockResolvedValue(json({ error: { message: 'Invalid credential' } }, status));

        const error = await listOpencodeGoModels().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(AiProviderError);
        expect((error as Error).message).toBe(`O OpenCode Go recusou a API key (HTTP ${status}): confira a chave oc_sk_… da assinatura Go`);
        expect((error as Error).message).not.toContain(KEY);
    });

    it('falha de rede e HTTP inesperado viram erro acionável', async () => {
        mocks.fetch.mockRejectedValueOnce(new Error('fetch failed'));
        await expect(listOpencodeGoModels()).rejects.toThrow('Não foi possível conectar ao OpenCode Go: fetch failed');

        mocks.fetch.mockResolvedValueOnce(json({}, 502));
        await expect(listOpencodeGoModels()).rejects.toThrow('O OpenCode Go respondeu HTTP 502');
    });
});

describe('lib/ai/opencode-go — provedor de geração', () => {
    it('monta o cliente OpenAI-compatível com a base do Go, a chave, o uso no stream e o x-opencode-session', async () => {
        await createOpencodeGoProvider({ sessionKey: 'opex:s1' });

        const options = mocks.createOpenAICompatible.mock.calls[0]![0];
        expect(options).toMatchObject({
            name: 'opencode-go',
            baseURL: 'https://opencode.ai/inference/go/openai/v1',
            apiKey: KEY,
            includeUsage: true,
            headers: { 'x-opencode-session': opencodeGoSessionId('opex:s1') },
            metadataExtractor: opencodeGoMetadataExtractor,
            fetch: opencodeGoFetch,
        });
    });

    it('sem chave não monta o cliente', async () => {
        mocks.config.mockResolvedValue({ apiKey: '' });

        await expect(createOpencodeGoProvider()).rejects.toBeInstanceOf(AiProviderError);
        expect(mocks.createOpenAICompatible).not.toHaveBeenCalled();
    });

    it('x-opencode-session é estável por conversa, não expõe a chave e muda a cada geração sem chave', () => {
        expect(opencodeGoSessionId('opex:s1')).toBe(opencodeGoSessionId('opex:s1'));
        expect(opencodeGoSessionId('opex:s1')).not.toBe(opencodeGoSessionId('opex:s2'));
        expect(opencodeGoSessionId('opex:s1')).not.toContain('s1');
        expect(opencodeGoSessionId(null)).not.toBe(opencodeGoSessionId(null));
    });

    it('o fetch próprio troca o User-Agent da SDK e preserva os demais headers', async () => {
        mocks.fetch.mockResolvedValue(json({}));

        await opencodeGoFetch('https://opencode.ai/x', { method: 'POST', headers: { 'user-agent': 'ai-sdk/openai-compatible', 'x-opencode-session': 'dndicas-1' } });

        const headers = mocks.fetch.mock.calls[0]![1].headers as Headers;
        expect(headers.get('user-agent')).toBe(OPENCODE_GO_USER_AGENT);
        expect(headers.get('x-opencode-session')).toBe('dndicas-1');
    });
});

describe('lib/ai/opencode-go — custo e allowance', () => {
    // Formato real do chunk final de uso do Go (plano Go: cost 0, gasto no allowance).
    const usageChunk = {
        choices: [],
        usage: {
            prompt_tokens: 35,
            completion_tokens: 13,
            total_tokens: 48,
            cost: 0,
            opencode: { billing_source: 'go', list_cost: 0.00001305, allowance: 0.00000783 },
        },
    };

    it('no stream, junta o custo e o allowance do chunk de uso', () => {
        const extractor = opencodeGoMetadataExtractor.createStreamExtractor();
        extractor.processChunk({ choices: [{ delta: { content: 'ok' } }] });
        extractor.processChunk(usageChunk);

        expect(extractor.buildMetadata()).toEqual({
            'opencode-go': { cost: 0, allowance: 0.00000783, listCost: 0.00001305, billingSource: 'go', costUsd: 0.00000783 },
        });
    });

    it('sem dados de cobrança, não gera metadados', () => {
        const extractor = opencodeGoMetadataExtractor.createStreamExtractor();
        extractor.processChunk({ choices: [{ delta: { content: 'ok' } }] });
        expect(extractor.buildMetadata()).toBeUndefined();
    });

    it('resposta inteira: lê cost e opencode na raiz (Extra Usage soma o cobrado)', async () => {
        await expect(opencodeGoMetadataExtractor.extractMetadata({ parsedBody: { cost: 0.002, opencode: { billing_source: 'balance', allowance: 0 } } })).resolves.toEqual({
            'opencode-go': { cost: 0.002, allowance: 0, listCost: null, billingSource: 'balance', costUsd: 0.002 },
        });
        expect(readOpencodeGoBilling('texto')).toEqual({});
    });
});
