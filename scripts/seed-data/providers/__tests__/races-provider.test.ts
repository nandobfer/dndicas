/**
 * @fileoverview Unit and integration tests for RacesProvider.
 *
 * Pure helpers (mapSize, mapSpeed, cleanText, buildDescriptionHtml, extractTraits)
 * are tested in isolation. processItem and findExisting are tested with mocked
 * external dependencies (translateItem, RaceModel, TraitModel, dbConnect).
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

// ── Mock heavy dependencies before importing the provider ─────────────────────

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return { ...actual };
});

vi.mock('../../../../src/features/races/models/race', () => ({
    RaceModel: {
        findOne: vi.fn(),
        create: vi.fn(),
        findOneAndUpdate: vi.fn(),
    },
}));

vi.mock('../../../../src/features/traits/database/trait', () => ({
    Trait: {
        find: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock('../../../../src/core/database/db', () => ({
    default: vi.fn().mockResolvedValue(undefined),
}));

// Mock terminal-kit used by BaseProvider
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
            }
        ),
    },
}));

// Mock glossary and progress stores used by BaseProvider
vi.mock('../../glossary/glossary-store', () => ({
    loadAllEntries: vi.fn().mockResolvedValue([]),
    saveEntries: vi.fn().mockResolvedValue(undefined),
    applyGlossary: vi.fn((_, text: string) => text),
    parseGlossaryInput: vi.fn(() => ({ entries: [], errors: [] })),
}));

vi.mock('../../progress/progress-store', () => ({
    readProgress: vi.fn().mockResolvedValue(-1),
    saveProgress: vi.fn().mockResolvedValue(undefined),
}));

// ── Now import the tested code ────────────────────────────────────────────────

import {
    RacesProvider,
    mapSize,
    mapSpeed,
    cleanText,
    buildDescriptionHtml,
    buildEntryHtml,
    extractTraits,
} from '../races-provider';
import { RaceModel } from '../../../../src/features/races/models/race';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProvider(): RacesProvider {
    const provider = new RacesProvider();
    // Stub translateItem so tests don't require a real translator
    const spy = vi.spyOn(provider as unknown as { translateItem: (...args: unknown[]) => unknown }, 'translateItem');
    spy.mockImplementation(async (...args: unknown[]) => ({
        name: `[PT] ${args[0] as string}`,
        description: `[PT] ${args[1] as string}`,
    }));
    return provider;
}

// ─────────────────────────────────────────────────────────────────────────────
// mapSize
// ─────────────────────────────────────────────────────────────────────────────

describe('mapSize', () => {
    it('returns "Médio" for undefined', () => {
        expect(mapSize(undefined)).toBe('Médio');
    });

    it('returns "Médio" for empty array', () => {
        expect(mapSize([])).toBe('Médio');
    });

    it('maps M to "Médio"', () => {
        expect(mapSize(['M'])).toBe('Médio');
    });

    it('maps S to "Pequeno"', () => {
        expect(mapSize(['S'])).toBe('Pequeno');
    });

    it('maps L to "Grande"', () => {
        expect(mapSize(['L'])).toBe('Grande');
    });

    it('returns first mappable size when array has multiple entries', () => {
        expect(mapSize(['S', 'M'])).toBe('Pequeno');
    });

    it('falls back to "Médio" for unknown size codes', () => {
        expect(mapSize(['X', 'T'])).toBe('Médio');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapSpeed
// ─────────────────────────────────────────────────────────────────────────────

describe('mapSpeed', () => {
    it('returns "9 metros" for undefined', () => {
        expect(mapSpeed(undefined)).toBe('9 metros');
    });

    it('converts 30 feet to "9 metros"', () => {
        expect(mapSpeed(30)).toBe('9 metros');
    });

    it('converts 25 feet to "7,5 metros"', () => {
        expect(mapSpeed(25)).toBe('7,5 metros');
    });

    it('formats walk + fly object with numeric fly speed', () => {
        expect(mapSpeed({ walk: 30, fly: 50 })).toBe('9 metros (a pé), 15 metros (voando)');
    });

    it('handles fly: true as "voo igual ao deslocamento a pé"', () => {
        expect(mapSpeed({ walk: 30, fly: true })).toBe('9 metros (a pé), voo igual ao deslocamento a pé');
    });

    it('formats walk + swim correctly', () => {
        expect(mapSpeed({ walk: 25, swim: 25 })).toBe('7,5 metros (a pé), 7,5 metros (nadando)');
    });

    it('formats climb speed', () => {
        const result = mapSpeed({ walk: 30, climb: 30 });
        expect(result).toContain('escalando');
    });

    it('returns "9 metros" for empty speed object', () => {
        expect(mapSpeed({})).toBe('9 metros');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanText
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanText', () => {
    it('strips {@damage} tags', () => {
        expect(cleanText('deals {@damage 1d6} damage')).toBe('deals 1d6 damage');
    });

    it('strips {@spell} tags', () => {
        expect(cleanText('cast {@spell fireball}')).toBe('cast fireball');
    });

    it('strips {@condition} tags', () => {
        expect(cleanText('becomes {@condition frightened}')).toBe('becomes frightened');
    });

    it('converts {@dc} to "CD"', () => {
        expect(cleanText('DC {@dc 8}')).toBe('DC CD 8');
    });

    it('strips {@hit} tags with + prefix', () => {
        expect(cleanText('make a {@hit 5} attack')).toBe('make a +5 attack');
    });

    it('handles tags with pipe separators', () => {
        expect(cleanText('{@spell gust of wind|XPHB}')).toBe('gust of wind');
    });

    it('returns plain text unchanged', () => {
        expect(cleanText('You gain darkvision.')).toBe('You gain darkvision.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDescriptionHtml / buildEntryHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDescriptionHtml', () => {
    it('returns "" for undefined', () => {
        expect(buildDescriptionHtml(undefined)).toBe('');
    });

    it('returns "" for empty array', () => {
        expect(buildDescriptionHtml([])).toBe('');
    });

    it('renders a plain string entry', () => {
        expect(buildDescriptionHtml(['A bird-like folk.'])).toBe('<p>A bird-like folk.</p>');
    });
});

describe('buildEntryHtml', () => {
    it('wraps a plain string in <p>', () => {
        expect(buildEntryHtml('Simple text.')).toBe('<p>Simple text.</p>');
    });

    it('renders named entry with sub-entries', () => {
        const entry = {
            type: 'entries',
            name: 'Darkvision',
            entries: ['You can see in dim light.'],
        };
        const html = buildEntryHtml(entry);
        expect(html).toContain('<strong>Darkvision.</strong>');
        expect(html).toContain('You can see in dim light.');
    });

    it('renders list entries as <ul><li>', () => {
        const entry = {
            type: 'list',
            items: ['Item one', 'Item two'],
        };
        const html = buildEntryHtml(entry);
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>Item one</li>');
        expect(html).toContain('<li>Item two</li>');
    });

    it('renders list items with name+entry as bold name', () => {
        const entry = {
            type: 'list',
            items: [{ name: 'Acid', entry: 'Deals acid damage.' }],
        };
        const html = buildEntryHtml(entry);
        expect(html).toContain('<strong>Acid.</strong>');
        expect(html).toContain('Deals acid damage.');
    });

    it('skips table entries without crashing', () => {
        const entry = { type: 'table', rows: [[1, 2]] };
        expect(() => buildEntryHtml(entry)).not.toThrow();
    });

    it('strips 5etools tags in entry text', () => {
        const html = buildEntryHtml('You deal {@damage 1d4} slashing.');
        expect(html).toContain('1d4');
        expect(html).not.toContain('{@');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractTraits
// ─────────────────────────────────────────────────────────────────────────────

describe('extractTraits', () => {
    it('returns [] for undefined entries', () => {
        expect(extractTraits(undefined)).toEqual([]);
    });

    it('returns [] for empty entries array', () => {
        expect(extractTraits([])).toEqual([]);
    });

    it('skips plain string entries', () => {
        const result = extractTraits([{ type: 'entries', name: 'Flight', entries: ['You have a flying speed.'] }]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Flight');
    });

    it('maps named entries to RaceTrait objects', () => {
        const entries = [
            { type: 'entries', name: 'Darkvision', entries: ['You can see in dim light within 60 feet.'] },
            { type: 'entries', name: 'Keen Senses', entries: ['You have proficiency in Perception.'] },
        ];
        const traits = extractTraits(entries);
        expect(traits).toHaveLength(2);
        expect(traits[0].name).toBe('Darkvision');
        expect(traits[0].description).toContain('You can see in dim light');
        expect(traits[1].name).toBe('Keen Senses');
    });

    it('skips entries without a name', () => {
        const entries = [{ type: 'entries', entries: ['Just some text.'] }];
        const traits = extractTraits(entries);
        expect(traits).toHaveLength(0);
    });

    it('strips 5etools tags from trait names', () => {
        const entries = [
            { type: 'entries', name: 'Strike {@damage 1d6}', entries: ['A hit.'] },
        ];
        const traits = extractTraits(entries);
        expect(traits[0].name).toBe('Strike 1d6');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// processItem
// ─────────────────────────────────────────────────────────────────────────────

describe('RacesProvider.processItem', () => {
    let provider: RacesProvider;

    beforeEach(() => {
        provider = makeProvider();
    });

    it('returns null for NPC Race', async () => {
        const result = await provider.processItem({
            name: 'Aarakocra',
            source: 'DMG',
            traitTags: ['NPC Race'],
            size: ['M'],
            speed: 20,
        });
        expect(result).toBeNull();
    });

    it('returns null when reprintedAs is set', async () => {
        const result = await provider.processItem({
            name: 'Aarakocra',
            source: 'EEPC',
            reprintedAs: ['Aarakocra|MPMM'],
            size: ['M'],
            speed: 25,
        });
        expect(result).toBeNull();
    });

    it('maps a valid race to CreateRaceInput with traits from entries', async () => {
        const race = {
            name: 'Aasimar',
            source: 'PHB',
            page: 286,
            size: ['M'] as string[],
            speed: 30,
            entries: [{ type: 'entries', name: 'Celestial Resistance', entries: ['You resist necrotic damage.'] }],
        };

        const result = await provider.processItem(race);

        expect(result).not.toBeNull();
        expect(result!.name).toBe('[PT] Aasimar');
        expect(result!.source).toBe('PHB pág. 286');
        expect(result!.status).toBe('active');
        expect(result!.size).toBe('Médio');
        expect(result!.speed).toBe('9 metros');
        expect(result!.traits).toHaveLength(1);
        expect(result!.traits[0].name).toBe('[PT] Celestial Resistance');
        expect(result!.spells).toEqual([]);
        expect(result!.variations).toEqual([]);
    });

    it('uses fluff description when fluffData is injected', async () => {
        (provider as unknown as { fluffData: Map<string, unknown> }).fluffData = new Map([
            ['Aasimar|PHB', { name: 'Aasimar', source: 'PHB', entries: ['Aasimar are touched by divinity.'] }],
        ]);

        const race = { name: 'Aasimar', source: 'PHB', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);

        expect(result!.description).toContain('Aasimar are touched by divinity');
    });

    it('sets image from fluff data when available', async () => {
        (provider as unknown as { fluffData: Map<string, unknown> }).fluffData = new Map([
            ['Aasimar|MPMM', {
                name: 'Aasimar', source: 'MPMM',
                images: [{ type: 'image', href: { type: 'internal', path: 'races/MPMM/Aasimar.webp' } }],
            }],
        ]);

        const race = { name: 'Aasimar', source: 'MPMM', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);

        expect(result!.image).toBe('https://5e.tools/img/races/MPMM/Aasimar.webp');
    });

    it('sets empty image when no fluff data exists', async () => {
        const race = { name: 'TestRace', source: 'PHB', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);
        expect(result!.image).toBe('');
    });

    it('populates variations from matching subraces', async () => {
        (provider as unknown as { subraces: unknown[] }).subraces = [
            {
                name: 'Fallen',
                source: 'VGM',
                raceName: 'Aasimar',
                raceSource: 'VGM',
                page: 105,
                entries: [{ type: 'entries', name: 'Necrotic Shroud', entries: ['Your eyes turn dark.'] }],
            },
        ];

        const race = { name: 'Aasimar', source: 'VGM', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);

        expect(result!.variations).toHaveLength(1);
        expect(result!.variations[0].name).toBe('[PT] Fallen');
        expect(result!.variations[0].source).toBe('VGM pág. 105');
        expect(result!.variations[0].traits).toHaveLength(1);
        expect(result!.variations[0].traits[0].name).toBe('[PT] Necrotic Shroud');
    });

    it('skips reprinted subraces', async () => {
        (provider as unknown as { subraces: unknown[] }).subraces = [
            {
                name: 'Fallen',
                source: 'VGM',
                raceName: 'Aasimar',
                raceSource: 'VGM',
                reprintedAs: ['Aasimar|MPMM'],
                entries: [],
            },
        ];

        const race = { name: 'Aasimar', source: 'VGM', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);

        expect(result!.variations).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// findExisting
// ─────────────────────────────────────────────────────────────────────────────

describe('RacesProvider.findExisting', () => {
    let provider: RacesProvider;
    let findOneMock: MockInstance;

    beforeEach(() => {
        provider = makeProvider();
        findOneMock = vi.mocked(RaceModel.findOne);
    });

    it('returns null when no matching race exists', async () => {
        findOneMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

        const result = await provider.findExisting({
            name: 'Unknown Race',
            description: '',
            source: 'PHB',
            status: 'active',
            size: 'Médio',
            speed: '9 metros',
            image: '',
            traits: [],
            spells: [],
            variations: [],
        });

        expect(result).toBeNull();
    });

    it('returns mapped CreateRaceInput when race found', async () => {
        const mockDoc = {
            name: 'Aasimar',
            description: '<p>Celestial blood.</p>',
            source: 'PHB pág. 286',
            status: 'active',
            size: 'Médio',
            speed: '9 metros',
            image: '',
            traits: [],
            spells: [],
            variations: [],
        };
        findOneMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockDoc) });

        const result = await provider.findExisting({
            name: 'Aasimar',
            description: '<p>Celestial blood.</p>',
            source: 'PHB pág. 286',
            status: 'active',
            size: 'Médio',
            speed: '9 metros',
            image: '',
            traits: [],
            spells: [],
            variations: [],
        });

        expect(result).not.toBeNull();
        expect(result!.name).toBe('Aasimar');
        expect(result!.source).toBe('PHB pág. 286');
        expect(result!.status).toBe('active');
    });
});
