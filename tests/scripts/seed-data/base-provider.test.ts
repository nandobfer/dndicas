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
                brightRed: vi.fn(),
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

vi.mock('../../../scripts/seed-data/glossary/glossary-store', () => ({
    loadAllEntries: vi.fn().mockResolvedValue([]),
    saveEntries: vi.fn().mockResolvedValue(undefined),
    applyGlossary: vi.fn((_, text: string) => text),
    parseGlossaryInput: vi.fn(() => ({ entries: [], errors: [] })),
}));

vi.mock('../../../scripts/seed-data/progress/progress-store', () => ({
    readProgress: vi.fn().mockResolvedValue(4),
    saveProgress: vi.fn().mockResolvedValue(undefined),
}));

import { BaseProvider, type ProviderFilterDocument } from '../../../scripts/seed-data/base-provider';
import { readProgress, saveProgress } from '../../../scripts/seed-data/progress/progress-store';
import termKit from 'terminal-kit';

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

    async findExisting(_item: TestItem): Promise<TestItem | null> {
        void _item;
        return null;
    }

    async create(): Promise<void> {}
}

class ExistingEqualProvider extends TestProvider {
    async findExisting(item: TestItem): Promise<TestItem | null> {
        return item;
    }
}

class DisplayProvider extends TestProvider {
    protected override getReviewDisplayOutput(output: unknown): unknown {
        return { ...(output as TestItem), displayOnly: true };
    }
}

class ComparableProvider extends TestProvider {
    protected override getComparableOutput(output: TestItem): TestItem {
        const { ignored: _ignored, ...comparable } = output as TestItem & { ignored?: string };
        void _ignored;
        return comparable;
    }
}

class TwoPhaseProvider extends BaseProvider<TestItem, TestItem> {
    readonly name = 'TwoPhase';
    readonly dataFilePath = 'unused.json';
    readonly dataKey = 'unused';
    readonly calls: string[] = [];
    private stored: TestItem | null = null;

    override readDataFile(): TestItem[] {
        return [];
    }

    protected override buildFilterDocument(item: TestItem): ProviderFilterDocument {
        return { name: item.name };
    }

    async processItem(item: TestItem): Promise<TestItem | null> {
        return item;
    }

    async findExisting(item: TestItem): Promise<TestItem | null> {
        this.calls.push(`find:${item.name}`);
        return this.stored;
    }

    async create(item: TestItem): Promise<void> {
        this.calls.push(`create:${item.name}`);
        this.stored = item;
    }

    protected override shouldPersistBeforeAfterReview(): boolean {
        return true;
    }

    protected override async afterReview(output: TestItem): Promise<TestItem> {
        this.calls.push(`after:${output.name}`);
        return output;
    }
}

describe('BaseProvider filter support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readProgress).mockResolvedValue(4);
        vi.mocked(saveProgress).mockResolvedValue(undefined);
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockImplementation(
                (_: unknown, cb: (err: unknown, value: string) => void) => {
                    cb(null, '');
                },
            );
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

    it('keeps default existing-equal behavior as skip without review', async () => {
        const provider = new ExistingEqualProvider([]);

        const result = await (
            provider as unknown as {
                runInteractiveItem: (item: TestItem, index: number, isDryRun: boolean) => Promise<string>;
            }
        ).runInteractiveItem({ name: 'Fighter' }, 0, false);

        expect(result).toBe('exists');
        expect((termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } }).terminal.inputField)
            .not.toHaveBeenCalled();
        expect(saveProgress).toHaveBeenCalledWith('Test', 0);
    });

    it('uses display hook only for review output rendering', () => {
        const provider = new DisplayProvider([]);

        (provider as unknown as { renderReviewState: (current: unknown) => void })
            .renderReviewState({ name: 'Fighter' });

        const term = (termKit as unknown as { terminal: { yellow: ReturnType<typeof vi.fn>; blue: ReturnType<typeof vi.fn> } }).terminal;
        expect(term.yellow).toHaveBeenCalledWith('"displayOnly"');
        expect(term.blue).toHaveBeenCalledWith('true');
    });

    it('uses comparable hook only for diff comparison', () => {
        const provider = new ComparableProvider([]);

        const diffs = (
            provider as unknown as {
                diffObjects: (
                    existing: TestItem & { ignored?: string },
                    incoming: TestItem & { ignored?: string },
                ) => Array<{ field: string }>;
            }
        ).diffObjects(
            { name: 'Fighter', ignored: 'old' },
            { name: 'Fighter', ignored: 'new' },
        );

        expect(diffs).toEqual([]);
    });

    it('persists reviewed output before afterReview when provider opts into two-phase flow', async () => {
        const provider = new TwoPhaseProvider();

        const result = await (
            provider as unknown as {
                runInteractiveItem: (item: TestItem, index: number, isDryRun: boolean) => Promise<string>;
            }
        ).runInteractiveItem({ name: 'Fighter' }, 0, false);

        expect(result).toBe('exists');
        expect(provider.calls).toEqual([
            'find:Fighter',
            'create:Fighter',
            'find:Fighter',
            'after:Fighter',
        ]);
    });
});
