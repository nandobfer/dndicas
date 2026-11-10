import { beforeEach, describe, expect, it, vi } from 'vitest';

// Os provedores e a SDK `ai` entram sob demanda em `stream.ts`: o mock vale para o `import()`
// dinâmico do mesmo jeito que para o import estático.
const mocks = vi.hoisted(() => ({
    anthropicFactory: vi.fn(),
    geminiFactory: vi.fn(),
    openaiFactory: vi.fn(),
    deepseekFactory: vi.fn(),
    opencodeFactory: vi.fn(),
    opencodeGoFactory: vi.fn(),
    streamText: vi.fn(),
    recordAiConsumption: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ai/anthropic', () => ({ createAnthropicProvider: mocks.anthropicFactory }));
vi.mock('@/lib/ai/gemini', () => ({ createGeminiProvider: mocks.geminiFactory }));
vi.mock('@/lib/ai/openai', () => ({ createOpenaiProvider: mocks.openaiFactory }));
vi.mock('@/lib/ai/deepseek', () => ({ createDeepseekProvider: mocks.deepseekFactory }));
vi.mock('@/lib/ai/opencode', () => ({ createOpencodeProvider: mocks.opencodeFactory }));
vi.mock('@/lib/ai/opencode-go', () => ({ createOpencodeGoProvider: mocks.opencodeGoFactory }));
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.recordAiConsumption }));
vi.mock('ai', () => ({ streamText: mocks.streamText }));

import { AiProviderError } from '@/lib/ai/errors';
import { describeAiError, prepareModel, stepCostUsd, streamAi, type AiStreamEvent } from '@/lib/ai/stream';

async function collect(generator: AsyncGenerator<AiStreamEvent>): Promise<AiStreamEvent[]> {
    const events: AiStreamEvent[] = [];
    for await (const event of generator) events.push(event);
    return events;
}

describe('lib/ai/stream — provedores sob demanda', () => {
    beforeEach(() => {
        mocks.anthropicFactory.mockResolvedValue((modelId: string) => ({ provider: 'anthropic', modelId }));
        mocks.geminiFactory.mockResolvedValue((modelId: string) => ({ provider: 'gemini', modelId }));
    });

    it('carrega só o provedor pedido e repassa o nível de raciocínio', async () => {
        const prepared = await prepareModel({ provider: 'anthropic', model: 'claude-x', variant: 'high' });

        expect(prepared.model).toEqual({ provider: 'anthropic', modelId: 'claude-x' });
        expect(prepared.reasoning).toBe('high');
        expect(mocks.anthropicFactory).toHaveBeenCalledTimes(1);
        expect(mocks.geminiFactory).not.toHaveBeenCalled();
        expect(mocks.openaiFactory).not.toHaveBeenCalled();
        expect(mocks.deepseekFactory).not.toHaveBeenCalled();
        expect(mocks.opencodeFactory).not.toHaveBeenCalled();
    });

    it('monta o thinking do Gemini a partir da variante', async () => {
        const prepared = await prepareModel({ provider: 'gemini', model: 'gemini-x', variant: 'low' });

        expect(prepared.model).toEqual({ provider: 'gemini', modelId: 'gemini-x' });
        expect(prepared.providerOptions).toEqual({ google: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } } });
    });

    it('recusa o JEV, que não gera texto', async () => {
        await expect(prepareModel({ provider: 'jev', model: 'jev' })).rejects.toBeInstanceOf(AiProviderError);
    });

    it('vira evento de erro (sem lançar) quando o provedor falha ao carregar', async () => {
        mocks.anthropicFactory.mockRejectedValue(new AiProviderError('Anthropic sem API key'));

        const events = await collect(streamAi({ provider: 'anthropic', model: 'claude-x', instructions: '', prompt: 'oi' }));

        expect(events).toEqual([{ type: 'error', message: 'Anthropic sem API key' }]);
        expect(mocks.streamText).not.toHaveBeenCalled();
    });

    it('gera pelo streamText carregado sob demanda e mede o consumo', async () => {
        mocks.streamText.mockReturnValue({
            fullStream: (async function* () {
                yield { type: 'text-delta', text: 'Olá' };
                yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
            })(),
        });

        const events = await collect(
            streamAi({ provider: 'anthropic', model: 'claude-x', instructions: 'i', prompt: 'oi', consumption: { origin: 'teste' } }),
        );

        expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({ instructions: 'i', prompt: 'oi' }));
        expect(events[0]).toEqual({ type: 'delta', text: 'Olá' });
        expect(events[1]).toMatchObject({ type: 'done', finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, costUsd: null } });
        expect(mocks.recordAiConsumption).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', origin: 'teste', totalTokens: 5 }));
    });

    describe('sessão fixa do OpenCode e conversa (Maddox)', () => {
        const opencodeModel = vi.fn((modelId: string, options: Record<string, unknown>) => ({ provider: 'opencode', modelId, options }));
        const dispose = vi.fn(async () => undefined);

        beforeEach(() => {
            opencodeModel.mockClear();
            dispose.mockClear();
            mocks.opencodeFactory.mockResolvedValue({ provider: Object.assign(opencodeModel, { dispose }), directory: '/srv/mesa' });
        });

        it('sessão fixa: reaproveita a sessão (modo existing) e não cria outra', async () => {
            await prepareModel({ provider: 'opencode', model: 'anthropic/claude', agent: 'maddox', title: 'Maddox', opencodeSessionId: 'ses_fixa' });

            const options = opencodeModel.mock.calls[0]![1];
            expect(options).toMatchObject({ sessionId: 'ses_fixa', sessionMode: 'existing', createNewSession: false, agent: 'maddox', location: { directory: '/srv/mesa' } });
        });

        it('sem sessão fixa: cria uma sessão nova e não fixa sessionId', async () => {
            await prepareModel({ provider: 'opencode', model: 'anthropic/claude', title: 'Opex' });

            const options = opencodeModel.mock.calls[0]![1];
            expect(options).toMatchObject({ createNewSession: true });
            expect(options).not.toHaveProperty('sessionId');
            expect(options).not.toHaveProperty('sessionMode');
        });

        it('messages substitui prompt; sem messages, vai o prompt', async () => {
            const finished = () => ({
                fullStream: (async function* () {
                    yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
                })(),
            });
            mocks.streamText.mockReset().mockImplementation(finished);
            const messages = [
                { role: 'user' as const, content: 'Comece' },
                { role: 'assistant' as const, content: 'Olá' },
                { role: 'user' as const, content: 'Fantasia sombria' },
            ];

            await collect(streamAi({ provider: 'anthropic', model: 'claude-x', instructions: 'i', prompt: 'ignorado', messages }));
            const withMessages = mocks.streamText.mock.calls[0]![0];
            expect(withMessages.messages).toEqual(messages);
            expect(withMessages).not.toHaveProperty('prompt');

            await collect(streamAi({ provider: 'anthropic', model: 'claude-x', instructions: 'i', prompt: 'oi', messages: [] }));
            const withPrompt = mocks.streamText.mock.calls[1]![0];
            expect(withPrompt.prompt).toBe('oi');
            expect(withPrompt).not.toHaveProperty('messages');
        });

        const failedStep = (error: Record<string, unknown>) => ({
            fullStream: (async function* () {
                yield { type: 'finish-step', providerMetadata: { opencode: { cost: 0, error } } };
                yield { type: 'finish', finishReason: 'error', totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
            })(),
        });

        it('erro de cota/plano do OpenCode (provider.quota) diz qual modelo foi recusado e o que fazer', async () => {
            mocks.streamText.mockReset().mockReturnValue(failedStep({ type: 'provider.quota', status: 402, message: 'Upstream request failed: Endpoint is unavailable.' }));

            const events = await collect(streamAi({ provider: 'opencode', model: 'opencode-go/hy4', instructions: 'i', prompt: 'oi', opencodeSessionId: 'ses_x' }));

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                type: 'error',
                message:
                    'O provedor recusou o modelo opencode-go/hy4 por cota ou plano (HTTP 402): Upstream request failed: Endpoint is unavailable. Troque o modelo nas configurações do agente ou confira o plano do provedor no OpenCode.',
            });
        });

        it('outros erros do passo mantêm a mensagem original do OpenCode', async () => {
            mocks.streamText.mockReset().mockReturnValue(failedStep({ type: 'provider.transport', status: 200, message: 'Connection lost while reading the response' }));

            const events = await collect(streamAi({ provider: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', instructions: 'i', prompt: 'oi' }));

            expect(events).toEqual([{ type: 'error', message: 'Connection lost while reading the response' }]);
        });
    });

    describe('OpenCode Go (gateway por API key, sem sessão no host)', () => {
        const goModel = vi.fn((modelId: string) => ({ provider: 'opencode-go', modelId }));
        const apiError = (statusCode: number) => Object.assign(new Error('Invalid credential oc_sk_segredo'), { name: 'AI_APICallError', statusCode });

        beforeEach(() => {
            goModel.mockClear();
            mocks.opencodeFactory.mockReset();
            mocks.opencodeGoFactory.mockReset().mockResolvedValue(goModel);
            mocks.recordAiConsumption.mockClear();
        });

        it('gera em streaming com deepseek-v4.1-flash, sem abrir sessão no OpenCode, e registra o custo do Go', async () => {
            mocks.streamText.mockReset().mockReturnValue({
                fullStream: (async function* () {
                    yield { type: 'text-delta', text: 'ok' };
                    yield { type: 'finish-step', providerMetadata: { 'opencode-go': { cost: 0, allowance: 0.00000783, listCost: 0.00001305, billingSource: 'go', costUsd: 0.00000783 } } };
                    yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 35, outputTokens: 13, totalTokens: 48 } };
                })(),
            });

            const events = await collect(
                streamAi({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', instructions: 'i', prompt: 'oi', sessionKey: 'opex:s1', consumption: { origin: 'opex-agent', subject: 's1' } }),
            );

            expect(mocks.opencodeGoFactory).toHaveBeenCalledWith({ sessionKey: 'opex:s1' });
            expect(goModel).toHaveBeenCalledWith('deepseek-v4.1-flash');
            expect(mocks.opencodeFactory).not.toHaveBeenCalled();
            expect(events[0]).toEqual({ type: 'delta', text: 'ok' });
            expect(events[1]).toMatchObject({ type: 'done', finishReason: 'stop', usage: { totalTokens: 48, costUsd: 0.00000783 } });
            expect(mocks.recordAiConsumption).toHaveBeenCalledWith(
                expect.objectContaining({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', origin: 'opex-agent', costUsd: 0.00000783 }),
            );
        });

        it('repassa o nível de raciocínio e aceita amostragem', async () => {
            const prepared = await prepareModel({ provider: 'opencode-go', model: 'deepseek-v4-pro', variant: 'high' });
            expect(prepared.reasoning).toBe('high');
            expect(mocks.opencodeGoFactory).toHaveBeenCalledWith({ sessionKey: undefined });
        });

        it('chave ausente vira erro acionável em pt-BR', async () => {
            mocks.opencodeGoFactory.mockRejectedValue(new AiProviderError('OpenCode Go sem API key: configure em Integrações › Provedores de IA › OpenCode Go'));

            const events = await collect(streamAi({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', instructions: '', prompt: 'oi' }));

            expect(events).toEqual([{ type: 'error', message: 'OpenCode Go sem API key: configure em Integrações › Provedores de IA › OpenCode Go' }]);
        });

        it('chave inválida (401) vira mensagem pt-BR pelo status, sem repetir o texto do provedor nem a chave', async () => {
            mocks.streamText.mockReset().mockReturnValue({
                fullStream: (async function* () {
                    yield { type: 'error', error: apiError(401) };
                })(),
            });

            const events = await collect(streamAi({ provider: 'opencode-go', model: 'deepseek-v4.1-flash', instructions: '', prompt: 'oi' }));

            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({ type: 'error', message: expect.stringContaining('O OpenCode Go recusou a API key') });
            expect(JSON.stringify(events)).not.toContain('oc_sk_segredo');
        });

        it('403 explica modelos grátis e a região Global; 429 o limite da assinatura (também via RetryError)', () => {
            expect(describeAiError(apiError(403), { provider: 'opencode-go', model: 'deepseek-v4-pro' })).toContain('região Global');
            expect(describeAiError(apiError(403), { provider: 'opencode-go', model: 'deepseek-v4-pro' })).toContain('deepseek-v4-pro');
            const retry = Object.assign(new Error('Failed after 3 attempts'), { lastError: apiError(429) });
            expect(describeAiError(retry, { provider: 'opencode-go' })).toContain('Limite da assinatura OpenCode Go');
        });

        it('outros provedores mantêm a mensagem genérica', () => {
            expect(describeAiError(apiError(401), { provider: 'deepseek' })).toBe('Invalid credential oc_sk_segredo');
            expect(describeAiError(apiError(500), { provider: 'opencode-go' })).toBe('Invalid credential oc_sk_segredo');
        });

        it('stepCostUsd soma o custo do OpenCode e do Go e devolve null sem custo', () => {
            expect(stepCostUsd({ opencode: { cost: 0.5 } })).toBe(0.5);
            expect(stepCostUsd({ 'opencode-go': { costUsd: 0.25 } })).toBe(0.25);
            expect(stepCostUsd({ 'opencode-go': { costUsd: null } })).toBeNull();
            expect(stepCostUsd(undefined)).toBeNull();
        });
    });
});
