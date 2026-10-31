import { beforeEach, describe, expect, it, vi } from 'vitest';

// Os provedores e a SDK `ai` entram sob demanda em `stream.ts`: o mock vale para o `import()`
// dinâmico do mesmo jeito que para o import estático.
const mocks = vi.hoisted(() => ({
    anthropicFactory: vi.fn(),
    geminiFactory: vi.fn(),
    openaiFactory: vi.fn(),
    deepseekFactory: vi.fn(),
    opencodeFactory: vi.fn(),
    streamText: vi.fn(),
    recordAiConsumption: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ai/anthropic', () => ({ createAnthropicProvider: mocks.anthropicFactory }));
vi.mock('@/lib/ai/gemini', () => ({ createGeminiProvider: mocks.geminiFactory }));
vi.mock('@/lib/ai/openai', () => ({ createOpenaiProvider: mocks.openaiFactory }));
vi.mock('@/lib/ai/deepseek', () => ({ createDeepseekProvider: mocks.deepseekFactory }));
vi.mock('@/lib/ai/opencode', () => ({ createOpencodeProvider: mocks.opencodeFactory }));
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.recordAiConsumption }));
vi.mock('ai', () => ({ streamText: mocks.streamText }));

import { AiProviderError } from '@/lib/ai/errors';
import { prepareModel, streamAi, type AiStreamEvent } from '@/lib/ai/stream';

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
    });
});
