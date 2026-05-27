import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    generateText: vi.fn(),
    stderrWrite: vi.fn(() => true),
}));

vi.mock('../../../../src/core/ai/genai', () => ({
    defaultModel: 'gemini-test',
    generateText: (...args: unknown[]) => mocks.generateText(...args),
}));

import { GenAITranslator } from '../../../../scripts/seed-data/translation/genai-translator';

describe('GenAITranslator invalid JSON recovery', () => {
    beforeEach(() => {
        mocks.generateText.mockReset();
        mocks.stderrWrite.mockClear();
        vi.spyOn(process.stderr, 'write').mockImplementation(mocks.stderrWrite as never);
    });

    it('retries invalid JSON and returns the next valid translation', async () => {
        mocks.generateText
            .mockResolvedValueOnce('```json\n{ "name": "Dragão", "description": "<p>texto truncado"')
            .mockResolvedValueOnce('{ "name": "Dragão Prateado Adulto", "description": "<p>Descrição válida.</p>" }');

        const translator = new GenAITranslator();
        const result = await translator.translateItem('Adult Silver Dragon', '<p>Adult silver dragon.</p>');

        expect(result).toEqual({
            name: 'Dragão Prateado Adulto',
            description: '<p>Descrição válida.</p>',
        });
        expect(mocks.generateText).toHaveBeenCalledTimes(2);
        expect(mocks.generateText.mock.calls[1][0]).toContain('previous response was invalid JSON');
    });

    it('parses JSON inside markdown fences', async () => {
        mocks.generateText.mockResolvedValueOnce('```json\n{ "name": "Lobo", "description": "<p>Um lobo.</p>" }\n```');

        const translator = new GenAITranslator();
        const result = await translator.translateItem('Wolf', '<p>A wolf.</p>');

        expect(result.name).toBe('Lobo');
        expect(result.description).toBe('<p>Um lobo.</p>');
    });

    it('extracts a JSON object surrounded by extra text', async () => {
        mocks.generateText.mockResolvedValueOnce('Here is the JSON:\n{ "name": "Urso", "description": "<p>Um urso.</p>" }\nDone.');

        const translator = new GenAITranslator();
        const result = await translator.translateItem('Bear', '<p>A bear.</p>');

        expect(result.name).toBe('Urso');
        expect(result.description).toBe('<p>Um urso.</p>');
    });

    it('keeps retrying invalid JSON until a valid response arrives', async () => {
        mocks.generateText
            .mockResolvedValueOnce('{ "name": "A"')
            .mockResolvedValueOnce('{ "name": "B"')
            .mockResolvedValueOnce('{ "name": "C"')
            .mockResolvedValueOnce('{ "name": "Ancião", "description": "<p>Texto válido.</p>" }');

        const translator = new GenAITranslator();
        const result = await translator.translateItem('Broken', '<p>Broken.</p>');

        expect(result).toEqual({
            name: 'Ancião',
            description: '<p>Texto válido.</p>',
        });
        expect(mocks.generateText).toHaveBeenCalledTimes(4);
        expect(mocks.generateText.mock.calls[1][0]).toContain('previous response was invalid JSON');
        expect(mocks.generateText.mock.calls[2][0]).toContain('previous response was invalid JSON');
        expect(mocks.generateText.mock.calls[3][0]).toContain('previous response was invalid JSON');
        expect(mocks.stderrWrite).toHaveBeenCalledWith(expect.stringContaining('attempt 3'));
    });
});
