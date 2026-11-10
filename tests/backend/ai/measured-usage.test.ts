import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), findOne: vi.fn() }));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/db/models/AiConsumption', () => ({ AiConsumption: { aggregate: mocks.aggregate, findOne: mocks.findOne } }));

import { getOpencodeUsage } from '@/features/ai/server/opencode-usage';

const firstRecord = (createdAt: Date | null) => ({ sort: () => ({ select: () => ({ lean: async () => (createdAt ? { createdAt } : null) }) }) });

describe('consumo medido por provedor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.aggregate.mockResolvedValue([
            { _id: 'opex-agent', requests: 2, inputTokens: 70, outputTokens: 26, totalTokens: 96, costUsd: 0.00001566, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
        ]);
        mocks.findOne.mockReturnValue(firstRecord(new Date('2026-11-09T00:00:00Z')));
    });

    it('OpenCode Go: filtra os registros do provedor e soma o custo informado', async () => {
        const summary = await getOpencodeUsage({}, 'opencode-go');

        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: 'opencode-go' } });
        expect(mocks.findOne).toHaveBeenCalledWith({ provider: 'opencode-go' });
        expect(summary.origins[0]).toMatchObject({ origin: 'opex-agent', label: 'Agente Opex', costUsd: 0.00001566 });
        expect(summary.total.costUsd).toBe(0.00001566);
    });

    it('sem provedor continua medindo o OpenCode de sessão', async () => {
        await getOpencodeUsage({ from: '2026-11-01T00:00:00.000Z' });

        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: 'opencode', createdAt: { $gte: new Date('2026-11-01T00:00:00.000Z') } } });
    });
});
