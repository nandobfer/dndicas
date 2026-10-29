import { beforeEach, describe, expect, it, vi } from 'vitest';

// A SDK `ai` e os provedores entram sob demanda em `image.ts`: o mock vale para o `import()`
// dinâmico do mesmo jeito que para o import estático.
const mocks = vi.hoisted(() => ({
    geminiFactory: vi.fn(),
    openaiFactory: vi.fn(),
    generateImage: vi.fn(),
    recordAiConsumption: vi.fn(async () => undefined),
    getIntegrationConfig: vi.fn(),
    debugFetch: vi.fn(),
}));

vi.mock('@/lib/ai/gemini', () => ({ createGeminiProvider: mocks.geminiFactory, GEMINI_API_URL: 'https://gemini.test/v1beta' }));
vi.mock('@/lib/ai/openai', () => ({ createOpenaiProvider: mocks.openaiFactory, OPENAI_API_URL: 'https://openai.test/v1' }));
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.recordAiConsumption }));
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.getIntegrationConfig }));
vi.mock('@/lib/integrations/debug', () => ({ debugFetch: mocks.debugFetch, integrationDebug: vi.fn(() => false) }));
vi.mock('ai', () => ({ generateImage: mocks.generateImage }));

import { AiProviderError } from '@/lib/ai/errors';
import { IMAGE_MODEL_LISTERS, generateAiImage } from '@/lib/ai/image';

const providerFor = (provider: string) => ({ image: (modelId: string) => ({ provider, modelId }) });
const imageResult = { image: { uint8Array: new Uint8Array([1, 2, 3]), mediaType: 'image/webp' }, usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 } };

describe('lib/ai/image — provedores sob demanda', () => {
    beforeEach(() => {
        mocks.geminiFactory.mockResolvedValue(providerFor('gemini'));
        mocks.openaiFactory.mockResolvedValue(providerFor('openai'));
        mocks.generateImage.mockResolvedValue(imageResult);
    });

    it('gera pelo Gemini carregando só o Gemini e repassa modelo, prompt e proporção', async () => {
        const result = await generateAiImage({ provider: 'gemini', model: 'imagen-x', prompt: 'um dragão', aspectRatio: '16:9', consumption: { origin: 'teste' } });

        expect(mocks.geminiFactory).toHaveBeenCalledTimes(1);
        expect(mocks.openaiFactory).not.toHaveBeenCalled();
        expect(mocks.generateImage).toHaveBeenCalledWith(
            expect.objectContaining({ model: { provider: 'gemini', modelId: 'imagen-x' }, prompt: 'um dragão', n: 1, aspectRatio: '16:9' }),
        );
        expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
        expect(result.mimeType).toBe('image/webp');
        expect(mocks.recordAiConsumption).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini', origin: 'teste', model: 'imagen-x', totalTokens: 5 }));
    });

    it('gera pela OpenAI carregando só a OpenAI, sem proporção', async () => {
        await generateAiImage({ provider: 'openai', model: 'gpt-image-1', prompt: 'um elfo', aspectRatio: '1:1' });

        expect(mocks.openaiFactory).toHaveBeenCalledTimes(1);
        expect(mocks.geminiFactory).not.toHaveBeenCalled();
        const options = mocks.generateImage.mock.calls[0][0];
        expect(options).toMatchObject({ model: { provider: 'openai', modelId: 'gpt-image-1' }, prompt: 'um elfo' });
        expect(options).not.toHaveProperty('aspectRatio');
        expect(mocks.recordAiConsumption).not.toHaveBeenCalled();
    });

    it('converte a falha do provedor em AiProviderError com mensagem pt-BR', async () => {
        mocks.generateImage.mockRejectedValue(new Error('HTTP 500'));

        const error = await generateAiImage({ provider: 'openai', model: 'gpt-image-1', prompt: 'x' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AiProviderError);
        expect((error as Error).message).toBe('O OpenAI não gerou a imagem: HTTP 500');
    });

    it('mantém o AiProviderError da criação do provedor', async () => {
        mocks.geminiFactory.mockRejectedValue(new AiProviderError('Gemini sem API key'));

        await expect(generateAiImage({ provider: 'gemini', model: 'imagen-x', prompt: 'x' })).rejects.toThrow('Gemini sem API key');
        expect(mocks.generateImage).not.toHaveBeenCalled();
    });

    it('lista os modelos de imagem usando a URL do provedor carregada sob demanda', async () => {
        mocks.getIntegrationConfig.mockResolvedValue({ apiKey: 'k' });
        mocks.debugFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({ models: [{ name: 'models/imagen-4.0-generate-001' }, { name: 'models/gemini-2.5-pro' }] }), { status: 200 }),
        );
        mocks.debugFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'gpt-image-1' }, { id: 'gpt-5' }] }), { status: 200 }));

        await expect(IMAGE_MODEL_LISTERS.gemini()).resolves.toEqual([expect.objectContaining({ id: 'imagen-4.0-generate-001' })]);
        await expect(IMAGE_MODEL_LISTERS.openai()).resolves.toEqual([expect.objectContaining({ id: 'gpt-image-1' })]);
        expect(mocks.debugFetch.mock.calls[0][2]).toMatch(/^https:\/\/gemini\.test\/v1beta\/models\?/);
        expect(mocks.debugFetch.mock.calls[1][2]).toBe('https://openai.test/v1/models');
    });
});
