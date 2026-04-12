import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('terminal-kit', () => ({
    default: {
        terminal: Object.assign(
            vi.fn(),
            {
                green: vi.fn(),
                red: vi.fn(),
                yellow: vi.fn(),
                gray: vi.fn(),
                cyan: vi.fn(),
                dim: vi.fn(),
                bold: Object.assign(vi.fn(), { cyan: vi.fn(), white: vi.fn() }),
                blue: vi.fn(),
                progressBar: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
                grabInput: vi.fn(),
                on: vi.fn(),
                removeListener: vi.fn(),
                inputField: vi.fn(),
                singleColumnMenu: vi.fn(),
            },
        ),
    },
}));

vi.mock('../glossary/glossary-store', () => ({
    loadAllEntries: vi.fn().mockResolvedValue([]),
    saveEntries: vi.fn().mockResolvedValue(undefined),
    applyGlossary: vi.fn((_, text: string) => text),
    parseGlossaryInput: vi.fn(() => ({ entries: [], errors: [] })),
}));

vi.mock('../progress/progress-store', () => ({
    readProgress: vi.fn().mockResolvedValue(4),
    saveProgress: vi.fn().mockResolvedValue(undefined),
}));

import { BaseProvider, type ProviderFilterDocument } from '../base-provider';
import { readProgress, saveProgress } from '../progress/progress-store';

interface TestItem {
    name: string;
}

class TestProvider extends BaseProvider<TestItem, TestItem> {
    readonly name = 'Test';
    readonly dataFilePath = 'unused.json';
    readonly dataKey = 'unused';

    constructor(private readonly items: TestItem[]) {
        super();
    }

    override readDataFile(): TestItem[] {
        return this.items;
    }

    protected override buildFilterDocument(item: TestItem): ProviderFilterDocument {
        return { name: item.name };
    }

    async processItem(item: TestItem): Promise<TestItem | null> {
        return item;
    }

    async findExisting(): Promise<TestItem | null> {
        return null;
    }

    async create(): Promise<void> {}
}

describe('BaseProvider filter support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readProgress).mockResolvedValue(4);
        vi.mocked(saveProgress).mockResolvedValue(undefined);
    });

    it('returns all items when filter is not active', () => {
        const provider = new TestProvider([
            { name: 'Yuan-ti' },
            { name: 'Elf' },
        ]);

        const result = (provider as unknown as { filterItems: (items: TestItem[]) => TestItem[] }).filterItems(provider.readDataFile());

        expect(result).toEqual([
            { name: 'Yuan-ti' },
            { name: 'Elf' },
        ]);
    });

    it('applies fuzzy matching when filter is active', () => {
        const provider = new TestProvider([
            { name: 'Yuan-ti' },
            { name: 'Elf' },
        ]);
        provider.setFilter('yan-ti');

        const result = (provider as unknown as { filterItems: (items: TestItem[]) => TestItem[] }).filterItems(provider.readDataFile());

        expect(result).toEqual([{ name: 'Yuan-ti' }]);
    });

    it('treats blank filter as disabled', () => {
        const provider = new TestProvider([
            { name: 'Yuan-ti' },
            { name: 'Elf' },
        ]);
        provider.setFilter('   ');

        const result = (provider as unknown as { filterItems: (items: TestItem[]) => TestItem[] }).filterItems(provider.readDataFile());

        expect(result).toHaveLength(2);
    });

    it('does not read or save progress when filter is active', async () => {
        const provider = new TestProvider([
            { name: 'Yuan-ti' },
            { name: 'Elf' },
        ]);
        provider.setAutoMode(true);
        provider.setFilter('yan-ti');

        await provider.run();

        expect(readProgress).not.toHaveBeenCalled();
        expect(saveProgress).not.toHaveBeenCalled();
    });
});
