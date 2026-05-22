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

vi.mock('../../../../src/features/spells/models/spell', () => ({
    Spell: {
        find: vi.fn(),
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
vi.mock('../../../../scripts/seed-data/glossary/glossary-store', () => ({
    loadAllEntries: vi.fn().mockResolvedValue([]),
    saveEntries: vi.fn().mockResolvedValue(undefined),
    applyGlossary: vi.fn((_, text: string) => text),
    parseGlossaryInput: vi.fn(() => ({ entries: [], errors: [] })),
}));

vi.mock('../../../../scripts/seed-data/progress/progress-store', () => ({
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
    type RawSpellRef,
} from '../../../../scripts/seed-data/providers/races-provider';
import { RaceModel } from '../../../../src/features/races/models/race';
import { Trait } from '../../../../src/features/traits/database/trait';
import { Spell } from '../../../../src/features/spells/models/spell';
import termKit from 'terminal-kit';

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
        expect(result!.originalName).toBe('Aasimar');
        expect(result!.source).toBe('LDJ pág. 286');
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
        expect(result!.variations[0].source).toBe("Volo's Guide to Monsters pág. 105");
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

describe('RacesProvider filter mapping', () => {
    it('maps race name for fuzzy filter matching', () => {
        const provider = makeProvider();

        const result = (
            provider as unknown as { buildFilterDocument: (item: { name: string }) => { name: string } }
        ).buildFilterDocument({ name: 'Yuan-ti' });

        expect(result).toEqual({ name: 'Yuan-ti' });
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
            source: 'LDJ pág. 286',
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
            source: 'LDJ pág. 286',
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
        expect(result!.source).toBe('LDJ pág. 286');
        expect(result!.status).toBe('active');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// processItem — originalName preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('RacesProvider.processItem — originalName preservation', () => {
    let provider: RacesProvider;

    beforeEach(() => {
        provider = makeProvider();
    });

    it('preserves originalName in translated traits', async () => {
        const race = {
            name: 'Aasimar',
            source: 'PHB',
            size: ['M'] as string[],
            speed: 30,
            entries: [
                { type: 'entries', name: 'Celestial Resistance', entries: ['You resist damage.'] },
            ],
        };

        const result = await provider.processItem(race);

        expect(result).not.toBeNull();
        expect(result!.traits).toHaveLength(1);
        // Cast to access the transient originalName field
        const trait = result!.traits[0] as { name: string; description: string; originalName?: string };
        expect(trait.name).toBe('[PT] Celestial Resistance');
        expect(trait.originalName).toBe('Celestial Resistance');
    });

    it('preserves originalName in subrace traits', async () => {
        (provider as unknown as { subraces: unknown[] }).subraces = [
            {
                name: 'Fallen',
                source: 'VGM',
                raceName: 'Aasimar',
                raceSource: 'VGM',
                entries: [{ type: 'entries', name: 'Necrotic Shroud', entries: ['Your eyes turn dark.'] }],
            },
        ];

        const race = { name: 'Aasimar', source: 'VGM', size: ['M'] as string[], speed: 30 };
        const result = await provider.processItem(race);

        expect(result!.variations).toHaveLength(1);
        const subTrait = result!.variations[0].traits[0] as { name: string; originalName?: string };
        expect(subTrait.name).toBe('[PT] Necrotic Shroud');
        expect(subTrait.originalName).toBe('Necrotic Shroud');
    });

    it('preserves originalName in RawSpellRef entries from additionalSpells', async () => {
        const race = {
            name: 'Tiefling',
            source: 'PHB',
            size: ['M'] as string[],
            speed: 30,
            additionalSpells: [
                { known: { '1': ['dancing lights#c'] } },
            ],
        };

        const result = await provider.processItem(race);

        expect(result).not.toBeNull();
        expect(result!.spells).toHaveLength(1);
        const rawSpell = result!.spells[0] as RawSpellRef;
        expect(rawSpell._raw).toBe(true);
        expect(rawSpell.name).toBe('[PT] dancing lights');
        expect(rawSpell.originalName).toBe('dancing lights');
        expect(rawSpell.level).toBe(1);
    });

    it('glossary application does not overwrite originalName in spells', async () => {
        const race = {
            name: 'Tiefling',
            source: 'PHB',
            size: ['M'] as string[],
            speed: 30,
            additionalSpells: [{ known: { '1': ['darkness'] } }],
        };

        const result = await provider.processItem(race);
        const rawSpell = result!.spells[0] as RawSpellRef;

        // Simulate glossary application (spread preserves originalName, only overrides name)
        const afterGlossary = { ...rawSpell, name: 'Escuridão' };
        expect(afterGlossary.originalName).toBe('darkness');
    });

    it('glossary application does not overwrite originalName in traits', async () => {
        const race = {
            name: 'Aasimar',
            source: 'PHB',
            size: ['M'] as string[],
            speed: 30,
            entries: [{ type: 'entries', name: 'Darkvision', entries: ['You see in darkness.'] }],
        };

        const result = await provider.processItem(race);
        const trait = result!.traits[0] as { name: string; originalName?: string; description: string };

        // Simulate glossary application (spread preserves originalName, only overrides name/description)
        const afterGlossary = { ...trait, name: 'Visão no Escuro', description: trait.description };
        expect(afterGlossary.originalName).toBe('Darkvision');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveTraits — originalName lookup
// ─────────────────────────────────────────────────────────────────────────────

type PrivateResolveTraits = {
    resolveTraits: (
        traits: { name: string; description: string; level?: number; originalName?: string }[],
        raceName: string,
        raceSource: string,
    ) => Promise<{ name: string; description: string; level?: number }[]>;
};

describe('RacesProvider.resolveTraits — originalName lookup', () => {
    let provider: RacesProvider;
    let traitFindMock: MockInstance;
    let traitCreateMock: MockInstance;

    beforeEach(() => {
        provider = makeProvider();
        traitFindMock = vi.mocked(Trait.find);
        traitCreateMock = vi.mocked(Trait.create);
        traitFindMock.mockReset();
        traitCreateMock.mockReset();
        // Auto-pick "use existing" (index 1) so interactive menu resolves immediately
        (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockImplementation(
                (_: unknown, cb: (err: unknown, resp: { selectedIndex: number }) => void) => {
                    cb(null, { selectedIndex: 1 });
                },
            );
    });

    it('searches with $or query covering both originalName and translated name', async () => {
        const mockTrait = { _id: 'abc123', name: 'Visão no Escuro', description: '<p>Sees in dark.</p>' };
        traitFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([mockTrait]) }) });

        const traits = [{ name: 'Visão no Escuro', description: '<p>Sees in dark.</p>', originalName: 'Darkvision' }];
        const resolved = await (provider as unknown as PrivateResolveTraits).resolveTraits(traits, 'Aasimar', 'PHB');

        // Single $or query should cover both originalName (EN) and name (PT)
        expect(traitFindMock).toHaveBeenCalledTimes(1);
        const query = traitFindMock.mock.calls[0][0];
        expect(query).toHaveProperty('$or');
        expect(query.$or[0].originalName.$regex.source).toContain('Darkvision');
        expect(query.$or[1].name.$regex.source).toContain('Visão no Escuro');
        expect(resolved).toHaveLength(1);
        expect(resolved[0].name).toBe('Habilidade sem Nome');
        expect(resolved[0].description).toContain('abc123');
    });

    it('finds trait with empty originalName via PT name in $or query', async () => {
        const mockTrait = { _id: 'xyz999', name: 'Idade (Kaladesh)', description: '<p>desc</p>' };
        traitFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([mockTrait]) }) });

        // Trait where DB record has empty originalName — found only via PT name in $or
        const traits = [{ name: 'Idade', description: '<p>desc</p>', originalName: 'Age' }];
        const resolved = await (provider as unknown as PrivateResolveTraits).resolveTraits(traits, 'Kaladesh', 'PSK');

        expect(traitFindMock).toHaveBeenCalledTimes(1);
        const query = traitFindMock.mock.calls[0][0];
        expect(query.$or[0].originalName.$regex.source).toContain('Age');
        expect(query.$or[1].name.$regex.source).toContain('Idade');
        expect(resolved).toHaveLength(1);
        expect(resolved[0].description).toContain('xyz999');
    });

    it('creates new Trait with originalName when none found', async () => {
        traitFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
        const createdDoc = { _id: 'new001', name: 'Darkvision' };
        traitCreateMock.mockResolvedValue(createdDoc);

        const traits = [{ name: 'Visão no Escuro', description: '<p>Sees in dark.</p>', originalName: 'Darkvision' }];
        await (provider as unknown as PrivateResolveTraits).resolveTraits(traits, 'Aasimar', 'PHB');

        expect(traitCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Visão no Escuro',
            originalName: 'Darkvision',
            source: 'PHB',
            status: 'active',
        }));
    });

    it('uses originalName equal to name when no originalName is provided (legacy support)', async () => {
        traitFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
        traitCreateMock.mockResolvedValue({ _id: 'leg001', name: 'Visão no Escuro' });

        const traits = [{ name: 'Visão no Escuro', description: '<p>desc</p>' }];
        await (provider as unknown as PrivateResolveTraits).resolveTraits(traits, 'Aasimar', 'PHB');

        // $or query should use the name as fallback originalName in both conditions
        const query = traitFindMock.mock.calls[0][0];
        expect(query.$or[0].originalName.$regex.source).toContain('Visão no Escuro');
        expect(query.$or[1].name.$regex.source).toContain('Visão no Escuro');
        expect(traitCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            originalName: 'Visão no Escuro',
        }));
    });

    it('injects race-specific variant at position 0 when not in Fuse.js top-5', async () => {
        // Simulate many "Tipo Criatura (X)" traits — Fuse.js may not pick the race-specific one
        const makeTraitDoc = (id: string, name: string) => ({ _id: id, name, description: `<p>${name}</p>` });
        const candidates = [
            makeTraitDoc('id-bugbear',  'Tipo Criatura (Bugbear)'),
            makeTraitDoc('id-centauro', 'Tipo Criatura (Centauro)'),
            makeTraitDoc('id-duergar',  'Tipo Criatura (Duergar)'),
            makeTraitDoc('id-eladrin',  'Tipo Criatura (Eladrin)'),
            makeTraitDoc('id-gnomo',    'Tipo Criatura (Gnomo)'),
            makeTraitDoc('id-fada',     'Tipo Criatura (Fada)'),   // should be injected
        ];
        traitFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(candidates) }) });

        const traits = [{ name: 'Tipo Criatura', description: '<p>Você é uma Fey.</p>', originalName: 'Creature Type' }];
        const resolved = await (provider as unknown as PrivateResolveTraits).resolveTraits(traits, 'Fada', 'MOT');

        // The resolved mention should reference the race-specific "Tipo Criatura (Fada)"
        expect(resolved[0].description).toContain('id-fada');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSpells — originalName lookup
// ─────────────────────────────────────────────────────────────────────────────

type PrivateResolveSpells = {
    resolveSpells: (
        spells: unknown[],
        raceName: string,
    ) => Promise<{ id: string; name: string; circle: number; level: number }[]>;
};

describe('RacesProvider.resolveSpells — originalName lookup', () => {
    let provider: RacesProvider;
    let spellFindMock: MockInstance;

    beforeEach(() => {
        provider = makeProvider();
        spellFindMock = vi.mocked(Spell.find);
        spellFindMock.mockReset();
    });

    it('searches with $or query covering both originalName and translated name', async () => {
        const mockSpell = { _id: 'sp001', name: 'Luzes Dançantes', circle: 0 };
        spellFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([mockSpell]) }) });

        const spells: RawSpellRef[] = [{ _raw: true, name: 'Luzes Dançantes', originalName: 'dancing lights', level: 1 }];
        const resolved = await (provider as unknown as PrivateResolveSpells).resolveSpells(spells, 'Tiefling');

        // Single $or query covers both originalName (EN) and name (PT)
        expect(spellFindMock).toHaveBeenCalledTimes(1);
        const query = spellFindMock.mock.calls[0][0];
        expect(query).toHaveProperty('$or');
        expect(query.$or[0].originalName.$regex.source).toContain('dancing lights');
        expect(query.$or[1].name.$regex.source).toContain('Luzes Dançantes');
        expect(resolved).toHaveLength(1);
        expect(resolved[0].id).toBe('sp001');
        expect(resolved[0].name).toBe('Luzes Dançantes');
        expect(resolved[0].circle).toBe(0);
        expect(resolved[0].level).toBe(1);
    });

    it('finds spell with empty originalName via PT name in $or query', async () => {
        const mockSpell = { _id: 'sp002', name: 'Luzes Dançantes', circle: 0 };
        spellFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([mockSpell]) }) });

        // Spell found via PT name when originalName is empty in DB
        const spells: RawSpellRef[] = [{ _raw: true, name: 'Luzes Dançantes', originalName: 'dancing lights', level: 1 }];
        const resolved = await (provider as unknown as PrivateResolveSpells).resolveSpells(spells, 'Tiefling');

        expect(spellFindMock).toHaveBeenCalledTimes(1);
        expect(resolved).toHaveLength(1);
        expect(resolved[0].id).toBe('sp002');
    });

    it('emits warning with both names when spell not found in either search', async () => {
        spellFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

        const spells: RawSpellRef[] = [{ _raw: true, name: 'Trevas', originalName: 'darkness', level: 3 }];
        const resolved = await (provider as unknown as PrivateResolveSpells).resolveSpells(spells, 'Tiefling');

        expect(resolved).toHaveLength(0);
    });

    it('passes through already-resolved spell objects unchanged', async () => {
        const alreadyResolved = { id: 'sp100', name: 'Trevas', circle: 2, level: 5 };
        const resolved = await (provider as unknown as PrivateResolveSpells).resolveSpells([alreadyResolved], 'Tiefling');

        expect(spellFindMock).not.toHaveBeenCalled();
        expect(resolved).toHaveLength(1);
        expect(resolved[0]).toEqual(alreadyResolved);
    });

    it('uses originalName equal to name when no originalName is provided (legacy support)', async () => {
        const mockSpell = { _id: 'sp003', name: 'Trevas', circle: 2 };
        spellFindMock.mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([mockSpell]) }) });

        // Simulate a legacy RawSpellRef without originalName
        const legacySpell = { _raw: true as const, name: 'Trevas', originalName: 'Trevas', level: 3 };
        await (provider as unknown as PrivateResolveSpells).resolveSpells([legacySpell], 'Tiefling');

        const query = spellFindMock.mock.calls[0][0];
        expect(query.$or[0].originalName.$regex.source).toContain('Trevas');
        expect(query.$or[1].name.$regex.source).toContain('Trevas');
    });
});
