import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prepareModel: vi.fn(),
    streamText: vi.fn(),
    recordAiConsumption: vi.fn(async () => undefined),
}));

vi.mock('ai', () => ({ streamText: mocks.streamText, stepCountIs: (count: number) => count }));
vi.mock('@/lib/ai/stream', () => ({
    prepareModel: mocks.prepareModel,
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: mocks.recordAiConsumption }));
vi.mock('@/features/ai/server/memory-block', () => ({ memoryBlock: vi.fn(async () => '') }));
vi.mock('@/features/ai/server/settings', () => ({ availabilityOfEntityUnderstanding: vi.fn(), loadEntityUnderstandingSettings: vi.fn() }));
vi.mock('@/features/entity-understanding/services/entity-understanding-tools', () => ({ createEntityUnderstandingTools: () => ({}) }));
vi.mock('@/features/entity-understanding/services/entity-understanding-prompt', () => ({
    buildEntityUnderstandingHistory: () => [],
    buildEntityUnderstandingSystemInstruction: () => 'instruções',
    toEntityUnderstandingModelMessages: () => [{ role: 'user', content: 'oi' }],
}));

import { streamEntityUnderstanding } from '@/features/ai/server/entity-understanding';

const prepared = {
    provider: 'opencode-go' as const,
    model: 'deepseek-v4.1-flash',
    settings: { instructions: '', maxToolRounds: 2, main: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', variant: null, temperature: null, maxOutputTokens: null } },
} as unknown as Parameters<typeof streamEntityUnderstanding>[1];
const input = { entityType: 'spell', entityId: 'bola-de-fogo', entity: {}, mode: 'conversation' as const, messages: [] };

async function drain(options: { userId?: string } = {}) {
    for await (const chunk of streamEntityUnderstanding(input, prepared, options)) void chunk;
}

describe('Entender com IA — custo do OpenCode Go e chave de conversa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.prepareModel.mockResolvedValue({ model: {}, dispose: async () => undefined });
        mocks.streamText.mockReturnValue({
            fullStream: (async function* () {
                yield { type: 'text-delta', text: 'A Bola de Fogo…' };
                yield { type: 'finish-step', providerMetadata: { 'opencode-go': { cost: 0, allowance: 0.002, costUsd: 0.002 } } };
                yield { type: 'finish-step', providerMetadata: { 'opencode-go': { cost: 0.001, allowance: 0.002, costUsd: 0.003 } } };
                yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
            })(),
        });
    });

    it('soma o custo dos passos no consumo e usa a chave usuário + entidade', async () => {
        await drain({ userId: 'u1' });

        expect(mocks.prepareModel).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: 'entity-understanding:u1:spell:bola-de-fogo' }));
        expect(mocks.recordAiConsumption).toHaveBeenCalledTimes(1);
        const record = (mocks.recordAiConsumption.mock.calls[0] as unknown as [{ costUsd: number; provider: string; subject: string }])[0];
        expect(record).toMatchObject({ provider: 'opencode-go', subject: 'spell:bola-de-fogo' });
        expect(record.costUsd).toBeCloseTo(0.005, 10);
    });

    it('sem usuário: sem chave de conversa (id novo por geração)', async () => {
        await drain();

        expect(mocks.prepareModel).toHaveBeenCalledWith(expect.objectContaining({ sessionKey: null }));
    });
});
