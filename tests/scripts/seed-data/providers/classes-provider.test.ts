/**
 * @fileoverview Unit tests for ClassesProvider.
 */

import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import termKit from 'terminal-kit';

vi.mock('../../../../src/features/classes/models/character-class', () => ({
    CharacterClass: {
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

import {
    ClassesProvider,
    buildClassProgressionTable,
    buildDescriptionHtml,
    buildFluffImageUrl,
    cleanText,
    formatProgressionValue,
    mapArmorProficiencies,
    mapHitDice,
    mapPrimaryAttributes,
    mapSavingThrows,
    mapSkills,
    mapWeaponProficiencies,
    parseClassFeatureRef,
} from '../../../../scripts/seed-data/providers/classes-provider';
import { CharacterClass } from '../../../../src/features/classes/models/character-class';
import { Trait } from '../../../../src/features/traits/database/trait';
import { Spell } from '../../../../src/features/spells/models/spell';

function makeProvider(): ClassesProvider {
    const provider = new ClassesProvider();
    vi.spyOn(provider as unknown as { translateItem: (...args: unknown[]) => unknown }, 'translateItem')
        .mockImplementation(async (...args: unknown[]) => ({
            name: `[PT] ${args[0] as string}`,
            description: `[PT] ${args[1] as string}`,
        }));
    return provider;
}

function seedClassFixture(provider: ClassesProvider): void {
    (provider as unknown as { featureData: Map<string, unknown> }).featureData = new Map([
        [
            'second wind|fighter|xphb|xphb|1',
            {
                name: 'Second Wind',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                level: 1,
                entries: ['Regain {@dice 1d10} + your fighter level hit points.'],
            },
        ],
        [
            'action surge|fighter|xphb|xphb|2',
            {
                name: 'Action Surge',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                level: 2,
                entries: ['You can push yourself beyond your normal limits for a moment.'],
            },
        ],
    ]);
    (provider as unknown as { fluffData: Map<string, unknown> }).fluffData = new Map([
        [
            'Fighter|XPHB',
            {
                name: 'Fighter',
                source: 'XPHB',
                entries: ['Fighters master weapons and armor.'],
                images: [{ type: 'image', href: { type: 'internal', path: 'classes/XPHB/Fighter.webp' } }],
            },
        ],
    ]);
}

function seedSubclassFixture(provider: ClassesProvider, options?: { withFluffText?: boolean; withAdditionalSpells?: boolean }): void {
    const withFluffText = options?.withFluffText ?? true;
    const withAdditionalSpells = options?.withAdditionalSpells ?? false;
    (provider as unknown as { subclassFeatureData: Map<string, unknown> }).subclassFeatureData = new Map([
        [
            'eldritch knight|fighter|xphb|eldritch knight|xphb|xphb|3',
            {
                name: 'Eldritch Knight',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                subclassShortName: 'Eldritch Knight',
                subclassSource: 'XPHB',
                level: 3,
                entries: [
                    'Eldritch Knights blend spell and steel.',
                    {
                        type: 'refSubclassFeature',
                        subclassFeature: 'Weapon Bond|Fighter|XPHB|Eldritch Knight|XPHB|3',
                    },
                ],
            },
        ],
        [
            'weapon bond|fighter|xphb|eldritch knight|xphb|xphb|3',
            {
                name: 'Weapon Bond',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                subclassShortName: 'Eldritch Knight',
                subclassSource: 'XPHB',
                level: 3,
                entries: ['Bond magically with a weapon.'],
            },
        ],
        [
            'war magic|fighter|xphb|eldritch knight|xphb|xphb|7',
            {
                name: 'War Magic',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                subclassShortName: 'Eldritch Knight',
                subclassSource: 'XPHB',
                level: 7,
                entries: ['Replace one attack with a cantrip.'],
            },
        ],
    ]);
    (provider as unknown as { subclassFluffData: Map<string, unknown> }).subclassFluffData = new Map([
        [
            'fighter|eldritch knight|xphb',
            {
                name: 'Eldritch Knight',
                shortName: 'Eldritch Knight',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                entries: withFluffText ? ['Eldritch Knights blend spell and steel.'] : undefined,
                images: [{ type: 'image', href: { type: 'internal', path: 'classes/XPHB/Eldritch Knight.webp' } }],
            },
        ],
    ]);
    (provider as unknown as { subclassData: Map<string, unknown[]> }).subclassData = new Map([
        [
            'fighter|xphb',
            [
                {
                    name: 'Eldritch Knight',
                    shortName: 'Eldritch Knight',
                    source: 'PHB',
                    className: 'Fighter',
                    classSource: 'PHB',
                    subclassFeatures: ['Eldritch Knight|Fighter||Eldritch Knight||3'],
                },
                {
                    name: 'Eldritch Knight',
                    shortName: 'Eldritch Knight',
                    source: 'XPHB',
                    page: 96,
                    className: 'Fighter',
                    classSource: 'XPHB',
                    casterProgression: '1/3',
                    spellcastingAbility: 'int',
                    additionalSpells: withAdditionalSpells
                        ? [
                            {
                                prepared: {
                                    3: ['magic missile|xphb'],
                                },
                            },
                        ]
                        : undefined,
                    subclassTableGroups: [
                        {
                            colLabels: ['{@filter Cantrips|spells|level=0|subclass=Fighter: Eldritch Knight}'],
                            rows: Array.from({ length: 20 }, (_, index) => [index < 2 ? 0 : 2]),
                        },
                    ],
                    subclassFeatures: [
                        'Eldritch Knight|Fighter|XPHB|Eldritch Knight|XPHB|3',
                        'War Magic|Fighter|XPHB|Eldritch Knight|XPHB|7',
                    ],
                },
            ],
        ],
    ]);
}

function seedCompositeSubclassFixture(provider: ClassesProvider): void {
    (provider as unknown as { subclassFeatureData: Map<string, unknown> }).subclassFeatureData = new Map([
        [
            'armorer|artificer|efa|armorer|efa|efa|3',
            {
                name: 'Armorer',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                subclassShortName: 'Armorer',
                subclassSource: 'EFA',
                level: 3,
                entries: [
                    'Armorers turn armor into a second skin.',
                    {
                        type: 'refSubclassFeature',
                        subclassFeature: 'Armor Model|Artificer|EFA|Armorer|EFA|3',
                    },
                ],
            },
        ],
        [
            'armor model|artificer|efa|armorer|efa|efa|3',
            {
                name: 'Armor Model',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                subclassShortName: 'Armorer',
                subclassSource: 'EFA',
                level: 3,
                entries: [
                    'Choose one of the following armor models.',
                    {
                        type: 'refSubclassFeature',
                        subclassFeature: 'Dreadnaught|Artificer|EFA|Armorer|EFA|3',
                    },
                    {
                        type: 'refSubclassFeature',
                        subclassFeature: 'Guardian|Artificer|EFA|Armorer|EFA|3',
                    },
                    {
                        type: 'refSubclassFeature',
                        subclassFeature: 'Infiltrator|Artificer|EFA|Armorer|EFA|3',
                    },
                ],
            },
        ],
        [
            'dreadnaught|artificer|efa|armorer|efa|efa|3',
            {
                name: 'Dreadnaught',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                subclassShortName: 'Armorer',
                subclassSource: 'EFA',
                level: 3,
                entries: [
                    {
                        type: 'item',
                        name: 'Force Demolisher',
                        entries: ['Smash enemies with arcane force.'],
                    },
                ],
            },
        ],
        [
            'guardian|artificer|efa|armorer|efa|efa|3',
            {
                name: 'Guardian',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                subclassShortName: 'Armorer',
                subclassSource: 'EFA',
                level: 3,
                entries: [
                    {
                        type: 'item',
                        name: 'Defensive Field',
                        entries: ['Gain temporary hit points.'],
                    },
                ],
            },
        ],
        [
            'infiltrator|artificer|efa|armorer|efa|efa|3',
            {
                name: 'Infiltrator',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                subclassShortName: 'Armorer',
                subclassSource: 'EFA',
                level: 3,
                entries: [
                    {
                        type: 'item',
                        name: 'Lightning Launcher',
                        entries: ['Launch bolts of lightning.'],
                    },
                ],
            },
        ],
    ]);
    (provider as unknown as { subclassFluffData: Map<string, unknown> }).subclassFluffData = new Map([
        [
            'artificer|armorer|efa',
            {
                name: 'Armorer',
                shortName: 'Armorer',
                source: 'EFA',
                className: 'Artificer',
                classSource: 'EFA',
                entries: ['Armorers turn armor into a second skin.'],
            },
        ],
    ]);
    (provider as unknown as { subclassData: Map<string, unknown[]> }).subclassData = new Map([
        [
            'artificer|efa',
            [
                {
                    name: 'Armorer',
                    shortName: 'Armorer',
                    source: 'EFA',
                    page: 22,
                    className: 'Artificer',
                    classSource: 'EFA',
                    subclassFeatures: ['Armorer|Artificer|EFA|Armorer|EFA|3'],
                },
            ],
        ],
    ]);
}

function getTranslateSpy(provider: ClassesProvider) {
    return vi.mocked((provider as unknown as { translateItem: (...args: unknown[]) => unknown }).translateItem);
}

function mockLeanResult<T>(value: T) {
    return { lean: vi.fn().mockResolvedValue(value) };
}

function mockFindResults<T>(value: T[]) {
    return { limit: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(value) })) };
}

function mockSpellSearch(candidates: Array<{ _id: string; name: string; originalName: string; circle: number }>): void {
    vi.mocked(Spell.find).mockImplementation((query: unknown) => {
        const filters = query as {
            $or?: Array<{
                originalName?: { $regex?: RegExp };
                name?: { $regex?: RegExp };
            }>;
        };
        const regexes = (filters.$or ?? [])
            .map((entry) => entry.originalName?.$regex ?? entry.name?.$regex)
            .filter((regex): regex is RegExp => regex instanceof RegExp);
        const matches = candidates.filter((candidate) =>
            regexes.some((regex) => regex.test(candidate.originalName) || regex.test(candidate.name)),
        );
        return mockFindResults(matches) as never;
    });
}

function mockMenuChoices(...choices: number[]): void {
    const menu = (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
        .terminal.singleColumnMenu;
    menu.mockImplementation((_: unknown, cb: (err: unknown, response: { selectedIndex: number }) => void) => {
        cb(null, { selectedIndex: choices.shift() ?? 4 });
    });
}

describe('ClassesProvider helpers', () => {
    it('strips common 5etools tags from text', () => {
        expect(cleanText('Cast {@spell fireball|PHB} and roll {@dice 8d6}.')).toBe('Cast fireball and roll 8d6.');
    });

    it('builds HTML for prose, nested entries, lists, options, and skips tables', () => {
        const html = buildDescriptionHtml([
            'Opening text.',
            { type: 'entries', name: 'Training', entries: ['You train hard.'] },
            { type: 'list', items: ['One', { name: 'Two', entry: 'Second item.' }] },
            { type: 'options', entries: [{ type: 'refOptionalfeature', optionalfeature: 'Archery' }] },
            { type: 'table', rows: [[1, 2]] },
        ]);

        expect(html).toContain('<p>Opening text.</p>');
        expect(html).toContain('<strong>Training.</strong>');
        expect(html).toContain('<li>One</li>');
        expect(html).toContain('<strong>Two.</strong> Second item.');
        expect(html).toContain('<li>Archery</li>');
        expect(html).not.toContain('<table');
    });

    it('maps class mechanics to local enum values', () => {
        expect(mapHitDice({ faces: 10 })).toBe('d10');
        expect(mapHitDice(undefined)).toBeNull();
        expect(mapSavingThrows(['str', 'con'])).toEqual(['Força', 'Constituição']);
        expect(mapArmorProficiencies(['light', 'medium', 'shield'])).toEqual(['Armaduras Leves', 'Armaduras Médias', 'Escudos']);
        expect(mapWeaponProficiencies(['simple', 'martial', 'longbow'])).toEqual(['Armas Simples', 'Armas Marciais', 'Arcos']);
        expect(mapSkills([{ choose: { from: ['arcana', 'history'], count: 2 } }])).toEqual({
            skillCount: 2,
            availableSkills: ['Arcanismo', 'História'],
        });
    });

    it('maps primary attributes from multiclass requirements with fallback', () => {
        expect(mapPrimaryAttributes({ or: [{ str: 13 }, { dex: 13 }] }, ['Força', 'Constituição'])).toEqual(['Força', 'Destreza']);
        expect(mapPrimaryAttributes(undefined, ['Inteligência', 'Sabedoria'])).toEqual(['Inteligência', 'Sabedoria']);
    });

    it('builds fluff image URLs from internal and external refs', () => {
        expect(buildFluffImageUrl({
            name: 'Fighter',
            source: 'XPHB',
            images: [{ type: 'image', href: { type: 'internal', path: 'classes/XPHB/Fighter.webp' } }],
        })).toBe('https://5e.tools/img/classes/XPHB/Fighter.webp');

        expect(buildFluffImageUrl({
            name: 'Fighter',
            source: 'XPHB',
            images: [{ type: 'image', href: { type: 'external', url: 'https://example.test/fighter.webp' } }],
        })).toBe('https://example.test/fighter.webp');
    });

    it('parses class feature references and uses class source fallback for blank source', () => {
        expect(parseClassFeatureRef('Second Wind|Fighter|XPHB|1', 'PHB')).toEqual({
            featureName: 'Second Wind',
            className: 'Fighter',
            classSource: 'XPHB',
            featureSource: 'XPHB',
            level: 1,
        });

        expect(parseClassFeatureRef({ classFeature: 'Fighting Style|Fighter||1' }, 'PHB')).toEqual({
            featureName: 'Fighting Style',
            className: 'Fighter',
            classSource: 'PHB',
            featureSource: 'PHB',
            level: 1,
        });
    });

    it('formats 5etools progression values for persisted custom columns', () => {
        expect(formatProgressionValue({ type: 'dice', toRoll: [{ number: 1, faces: 6 }] })).toBe('1d6');
        expect(formatProgressionValue({ type: 'dice', toRoll: [{ number: 10, faces: 6 }] })).toBe('10d6');
        expect(formatProgressionValue({ type: 'bonus', value: 2 })).toBe('+2');
        expect(formatProgressionValue({ type: 'bonusSpeed', value: 30 })).toBe('+9 metros');
        expect(formatProgressionValue({ type: 'bonusSpeed', value: 0 })).toBeNull();
        expect(formatProgressionValue('—')).toBe('—');
    });

    it('builds translated custom progression columns without derived UI columns', async () => {
        const progression = await buildClassProgressionTable({
            classTableGroups: [
                {
                    colLabels: ['Rages', 'Rage Damage', 'Weapon Mastery'],
                    rows: Array.from({ length: 20 }, (_, index) => [
                        String(index < 2 ? 2 : 3),
                        { type: 'bonus', value: index < 8 ? 2 : 3 },
                        String(index < 4 ? 2 : 3),
                    ]),
                },
            ],
        });

        expect(progression?.spellSlots).toBeUndefined();
        expect(progression?.customColumns).toEqual([
            {
                id: '5etools-furias',
                label: 'Fúrias',
                values: expect.arrayContaining(['2', '3']),
            },
            {
                id: '5etools-dano-de-furia',
                label: 'Dano de Fúria',
                values: expect.arrayContaining(['+2', '+3']),
            },
            {
                id: '5etools-maestria-com-armas',
                label: 'Maestria com Armas',
                values: expect.arrayContaining(['2', '3']),
            },
        ]);
        expect(progression?.customColumns?.[0].values).toHaveLength(20);
    });

    it('builds spell slots from cantrip/prepared columns and rowsSpellProgression', async () => {
        const progression = await buildClassProgressionTable({
            classTableGroups: [
                {
                    colLabels: [
                        'Bardic Die',
                        '{@filter Cantrips|spells|level=0|class=bard}',
                        '{@filter Prepared Spells|spells|level=!0|class=bard}',
                    ],
                    rows: Array.from({ length: 20 }, (_, index) => [
                        { type: 'dice', toRoll: [{ number: 1, faces: index < 4 ? 6 : 8 }] },
                        index < 3 ? 2 : 3,
                        index + 4,
                    ]),
                },
                {
                    title: 'Spell Slots per Spell Level',
                    colLabels: [
                        '{@filter 1st|spells|level=1|class=bard}',
                        '{@filter 2nd|spells|level=2|class=bard}',
                    ],
                    rowsSpellProgression: Array.from({ length: 20 }, (_, index) => [
                        index === 0 ? 2 : 3,
                        index >= 2 ? 2 : 0,
                    ]),
                },
            ],
        });

        expect(progression?.customColumns).toEqual([
            {
                id: '5etools-dado-de-inspiracao',
                label: 'Dado de Inspiração',
                values: expect.arrayContaining(['1d6', '1d8']),
            },
        ]);
        expect(progression?.spellSlots?.[1]).toEqual({
            cantrips: 2,
            preparedSpells: 4,
            slots: { 1: 2 },
        });
        expect(progression?.spellSlots?.[3]).toEqual({
            cantrips: 2,
            preparedSpells: 6,
            slots: { 1: 3, 2: 2 },
        });
    });

    it('maps warlock pact slots without duplicating slot columns as custom columns', async () => {
        const progression = await buildClassProgressionTable({
            classTableGroups: [
                {
                    colLabels: [
                        '{@filter Invocations|optionalfeatures|feature type=ei}',
                        '{@filter Cantrips|spells|level=0|class=Warlock}',
                        '{@filter Prepared Spells|spells|level=!0|class=Warlock}',
                        'Spell Slots',
                        'Slot Level',
                    ],
                    rows: Array.from({ length: 20 }, (_, index) => [
                        index < 1 ? 1 : 3,
                        2,
                        index + 2,
                        index < 2 ? 1 : 2,
                        index < 2 ? 1 : 2,
                    ]),
                },
            ],
        });

        expect(progression?.customColumns).toEqual([
            {
                id: '5etools-invocacoes',
                label: 'Invocações',
                values: expect.arrayContaining(['1', '3']),
            },
        ]);
        expect(progression?.spellSlots?.[1]).toEqual({
            cantrips: 2,
            preparedSpells: 2,
            slots: { 1: 1 },
        });
        expect(progression?.spellSlots?.[3]).toEqual({
            cantrips: 2,
            preparedSpells: 4,
            slots: { 2: 2 },
        });
    });

    it('uses translation fallback only for unknown custom labels', async () => {
        const translateLabel = vi.fn(async (label: string) => `[PT] ${label}`);

        const progression = await buildClassProgressionTable({
            classTableGroups: [
                {
                    colLabels: ['Unknown Meter', 'Sneak Attack'],
                    rows: Array.from({ length: 20 }, (_, index) => [index + 1, {
                        type: 'dice',
                        toRoll: [{ number: index + 1, faces: 6 }],
                    }]),
                },
            ],
        }, translateLabel);

        expect(translateLabel).toHaveBeenCalledTimes(1);
        expect(translateLabel).toHaveBeenCalledWith('Unknown Meter');
        expect(progression?.customColumns?.map((column) => column.label)).toEqual([
            '[PT] Unknown Meter',
            'Ataque Furtivo',
        ]);
    });
});

describe('ClassesProvider.processItem', () => {
    let provider: ClassesProvider;

    beforeEach(() => {
        provider = makeProvider();
        seedClassFixture(provider);
    });

    it('returns null for reprinted classes', async () => {
        const result = await provider.processItem({
            name: 'Fighter',
            source: 'PHB',
            reprintedAs: ['Fighter|XPHB'],
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
        });

        expect(result).toBeNull();
    });

    it('returns null for classes missing required mechanics', async () => {
        const result = await provider.processItem({
            name: 'Expert Sidekick',
            source: 'TCE',
        });

        expect(result).toBeNull();
    });

    it('maps a class with fluff and stores pending features outside visible traits', async () => {
        const result = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light', 'medium', 'heavy', 'shield'],
                weapons: ['simple', 'martial'],
                skills: [{ choose: { from: ['acrobatics', 'athletics'], count: 2 } }],
            },
            multiclassing: { requirements: { or: [{ str: 13 }, { dex: 13 }] } },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
            classTableGroups: [
                {
                    colLabels: ['Second Wind', 'Weapon Mastery'],
                    rows: Array.from({ length: 20 }, (_, index) => [
                        String(index < 3 ? 2 : 3),
                        String(index < 4 ? 3 : 4),
                    ]),
                },
            ],
        });

        expect(result).not.toBeNull();
        expect(result!.name).toBe('[PT] Fighter');
        expect(result!.originalName).toBe('Fighter');
        expect(result!.description).toContain('Fighters master weapons and armor.');
        expect(result!.image).toBe('https://5e.tools/img/classes/XPHB/Fighter.webp');
        expect(result!.source).toBe('LDJ pág. 89');
        expect(result!.hitDice).toBe('d10');
        expect(result!.primaryAttributes).toEqual(['Força', 'Destreza']);
        expect(result!.savingThrows).toEqual(['Força', 'Constituição']);
        expect(result!.armorProficiencies).toContain('Armaduras Pesadas');
        expect(result!.weaponProficiencies).toEqual(['Armas Simples', 'Armas Marciais']);
        expect(result!.skillCount).toBe(2);
        expect(result!.availableSkills).toEqual(['Acrobacia', 'Atletismo']);
        expect(result!.subclasses).toEqual([]);
        expect(result!.traits).toEqual([]);
        expect(result!.progressionTable).toEqual({
            customColumns: [
                {
                    id: '5etools-retomar-o-folego',
                    label: 'Retomar o Fôlego',
                    values: expect.arrayContaining(['2', '3']),
                },
                {
                    id: '5etools-maestria-com-armas',
                    label: 'Maestria com Armas',
                    values: expect.arrayContaining(['3', '4']),
                },
            ],
        });
        expect('__pendingClassFeatures' in result!).toBe(false);
        expect(getTranslateSpy(provider)).toHaveBeenCalledTimes(1);
        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Fighter', '<p>Fighters master weapons and armor.</p>');
    });

    it('stores importable subclasses internally without showing them in the initial class summary', async () => {
        seedSubclassFixture(provider);

        const result = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        });

        const pending = (provider as unknown as { pendingSubclassesByClassKey: Map<string, unknown[]> })
            .pendingSubclassesByClassKey.get('fighter|ldj pág. 89');

        expect(result!.subclasses).toEqual([]);
        expect(pending).toHaveLength(1);
        expect(pending?.[0]).toEqual(expect.objectContaining({
            original: expect.objectContaining({
                source: 'XPHB',
                classSource: 'XPHB',
                shortName: 'Eldritch Knight',
            }),
            descriptionHtml: '<p>Eldritch Knights blend spell and steel.</p>',
            features: expect.arrayContaining([
                expect.objectContaining({ originalName: 'Weapon Bond', level: 3 }),
                expect.objectContaining({ originalName: 'War Magic', level: 7 }),
            ]),
        }));
        expect(pending?.[0]?.features).toHaveLength(2);
        expect(getTranslateSpy(provider)).toHaveBeenCalledTimes(1);
    });

    it('falls back to the homonymous subclass feature for description when fluff text is missing', async () => {
        seedSubclassFixture(provider, { withFluffText: false });

        await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        });

        const pending = (provider as unknown as {
            pendingSubclassesByClassKey: Map<string, Array<{ descriptionHtml?: string; features: Array<{ originalName: string }> }>>;
            buildSubclassForReview: (pendingSubclass: { original: unknown; descriptionHtml?: string; features: Array<{ originalName: string }> }, index: number) => Promise<{ description: string }>;
        }).pendingSubclassesByClassKey.get('fighter|ldj pág. 89');

        expect(pending).toHaveLength(1);
        expect(pending?.[0]?.descriptionHtml).toBe('<p>Eldritch Knights blend spell and steel.</p>');
        expect(pending?.[0]?.features).toEqual([
            expect.objectContaining({ originalName: 'Weapon Bond', level: 3 }),
            expect.objectContaining({ originalName: 'War Magic' }),
        ]);

        const subclass = await (provider as unknown as {
            buildSubclassForReview: (pendingSubclass: NonNullable<typeof pending>[number], index: number) => Promise<{ description: string }>;
        }).buildSubclassForReview(pending![0], 0);

        expect(subclass.description).toBe('[PT] <p>Eldritch Knights blend spell and steel.</p>');
        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Eldritch Knight', '<p>Eldritch Knights blend spell and steel.</p>');
    });

    it('composes nested subclass feature refs inline for compound subclass traits', async () => {
        seedCompositeSubclassFixture(provider);

        await provider.processItem({
            name: 'Artificer',
            source: 'EFA',
            page: 22,
            hd: { faces: 8 },
            proficiency: ['con', 'int'],
            startingProficiencies: {
                armor: ['light', 'medium', 'shield'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['arcana'], count: 1 } }],
            },
        });

        const pendingGroups = [
            ...(provider as unknown as {
                pendingSubclassesByClassKey: Map<string, Array<{
                    descriptionHtml?: string;
                    features: Array<{ originalName: string; descriptionHtml: string }>;
                }>>;
            }).pendingSubclassesByClassKey.values(),
        ];
        const pending = pendingGroups[0];
        const armorModel = pending?.[0]?.features.find((feature) => feature.originalName === 'Armor Model');

        expect(pending).toHaveLength(1);
        expect(armorModel).toEqual(expect.objectContaining({
            originalName: 'Armor Model',
            descriptionHtml: expect.stringContaining('<strong>Dreadnaught.</strong>'),
        }));
        expect(armorModel?.descriptionHtml).toContain('Force Demolisher');
        expect(armorModel?.descriptionHtml).toContain('Defensive Field');
        expect(armorModel?.descriptionHtml).toContain('Lightning Launcher');
        expect(pending?.[0]?.features.map((feature) => feature.originalName)).toEqual(['Armor Model']);
    });
});

describe('ClassesProvider.findExisting', () => {
    let provider: ClassesProvider;
    let findOneMock: MockInstance;

    beforeEach(() => {
        provider = makeProvider();
        seedClassFixture(provider);
        findOneMock = vi.mocked(CharacterClass.findOne);
    });

    it('returns null when no matching class exists', async () => {
        findOneMock.mockReturnValue(mockLeanResult(null));

        const result = await provider.findExisting({
            name: 'Guerreiro',
            originalName: 'Fighter',
            description: '<p>Text.</p>',
            source: 'LDJ',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: [],
            spellcasting: false,
        });

        expect(result).toBeNull();
        expect(findOneMock).toHaveBeenCalledWith({
            $or: [
                { name: /^Guerreiro$/i },
                { originalName: /^Fighter$/i },
            ],
        });
    });

    it('maps an existing document to CreateClassInput shape', async () => {
        findOneMock.mockReturnValue(mockLeanResult({
            name: 'Guerreiro',
            originalName: 'Fighter',
            image: '',
            description: '<p>Text.</p>',
            source: 'LDJ',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: ['Armaduras Leves'],
            weaponProficiencies: ['Armas Simples'],
            skillCount: 2,
            availableSkills: ['Atletismo'],
            spellcasting: false,
            spells: [],
            subclasses: [],
            traits: [{ _id: 'trait-slot-1', level: 1, description: '<span>Second Wind</span>' }],
        }));

        const result = await provider.findExisting({
            name: 'Guerreiro',
            originalName: 'Fighter',
            description: '<p>Text.</p>',
            source: 'LDJ',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: [],
            spellcasting: false,
        });

        expect(result!.name).toBe('Guerreiro');
        expect(result!.traits![0]).toEqual({
            _id: 'trait-slot-1',
            level: 1,
            description: '<span>Second Wind</span>',
        });
    });

    it('returns existing traits even when pending features exist internally before review', async () => {
        const incoming = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });

        findOneMock.mockReturnValue(mockLeanResult({
            name: '[PT] Fighter',
            originalName: 'Fighter',
            image: '',
            description: '[PT] <p>Fighters master weapons and armor.</p>',
            source: 'LDJ pág. 89',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: [],
            spellcasting: false,
            traits: [{ _id: 'trait-slot-1', level: 1, description: '<span>Existing</span>' }],
        }));

        const result = await provider.findExisting(incoming!);

        expect(result!.traits).toEqual([
            {
                _id: 'trait-slot-1',
                level: 1,
                description: '<span>Existing</span>',
            },
        ]);
    });

    it('hides deferred traits and subclasses only in comparable output', async () => {
        seedSubclassFixture(provider);
        const incoming = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });

        const comparable = (provider as unknown as {
            getComparableOutput: (output: {
                name: string;
                originalName: string;
                description: string;
                source: string;
                status: 'active';
                hitDice: 'd10';
                primaryAttributes: ['Força'];
                savingThrows: ['Força', 'Constituição'];
                armorProficiencies: [];
                weaponProficiencies: [];
                skillCount: 1;
                availableSkills: ['Atletismo'];
                spellcasting: false;
                spells: Array<{ id: string; name: string; circle: number }>;
                traits: Array<{ level: number; description: string }>;
                subclasses: Array<{
                    name: string;
                    spellcasting: true;
                    spells: Array<{ id: string; name: string; circle: number }>;
                    traits: Array<{ level: number; description: string }>;
                }>;
            }) => Record<string, unknown>;
        }).getComparableOutput({
            name: incoming!.name,
            originalName: incoming!.originalName!,
            description: incoming!.description,
            source: incoming!.source,
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: ['Atletismo'],
            spellcasting: false,
            spells: [{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }],
            traits: [{ level: 1, description: '<span>Existing</span>' }],
            subclasses: [
                {
                    name: 'Cavaleiro Arcano',
                    spellcasting: true,
                    spells: [{ id: 'spell-2', name: 'Escudo Arcano', circle: 1 }],
                    traits: [{ level: 3, description: '<span>Existing subclass</span>' }],
                },
            ],
        });

        expect(comparable).toEqual(expect.objectContaining({
            traits: [],
            subclasses: [],
        }));
        expect('spells' in comparable).toBe(false);
    });
});

describe('ClassesProvider existing equal actions', () => {
    let provider: ClassesProvider;

    beforeEach(() => {
        provider = makeProvider();
        seedClassFixture(provider);
        vi.mocked(CharacterClass.findOne).mockReset();
        vi.mocked(CharacterClass.findOneAndUpdate).mockReset();
        vi.mocked(Trait.find).mockReset();
        vi.mocked(Trait.create).mockReset();
        vi.mocked(Spell.find).mockReset();
        vi.mocked(CharacterClass.findOneAndUpdate).mockResolvedValue(null as never);
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn>; singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockReset();
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn>; singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockReset();
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockImplementation(
                (_: unknown, cb: (err: unknown, value: string) => void) => cb(null, ''),
            );
    });

    it('shows a compact progression summary in review output without changing persisted data', async () => {
        const output = {
            name: 'Guerreiro',
            originalName: 'Fighter',
            description: '<p>Text.</p>',
            source: 'LDJ pág. 89',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: ['Atletismo'],
            spellcasting: true,
            spells: [{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }],
            subclasses: [
                {
                    name: 'Cavaleiro Arcano',
                    spellcasting: true,
                    spells: [{ id: 'spell-2', name: 'Escudo Arcano', circle: 1 }],
                    traits: [],
                    progressionTable: {
                        customColumns: [
                            { id: 'subclass-col', label: 'Magia de Guerra', values: Array(20).fill(null) },
                        ],
                    },
                },
            ],
            traits: [],
            progressionTable: {
                spellSlots: {
                    1: { cantrips: 2, preparedSpells: 4, slots: { 1: 2 } },
                    3: { slots: { 2: 2 } },
                },
                customColumns: [
                    { id: '5etools-retomar-o-folego', label: 'Retomar o Fôlego', values: Array(20).fill('2') },
                ],
            },
        };

        const display = (provider as unknown as { getReviewDisplayOutput: (output: unknown) => unknown })
            .getReviewDisplayOutput(output);

        expect(display).toEqual(expect.objectContaining({
            subclasses: [
                expect.objectContaining({
                    name: 'Cavaleiro Arcano',
                    progressionTable: {
                        customColumns: ['Magia de Guerra'],
                        spellColumns: [],
                    },
                }),
            ],
            progressionTable: {
                customColumns: ['Retomar o Fôlego'],
                spellColumns: ['Truques', 'Preparadas', '1º', '2º'],
            },
        }));
        expect('spells' in (display as Record<string, unknown>)).toBe(false);
        expect('spells' in ((display as { subclasses: Array<Record<string, unknown>> }).subclasses[0])).toBe(false);
        expect(output.progressionTable.customColumns[0].values).toHaveLength(20);
    });

    it('removes class and subclass spells from comparable output', () => {
        const output = {
            name: 'Guerreiro',
            originalName: 'Fighter',
            description: '<p>Text.</p>',
            status: 'active' as const,
            hitDice: 'd10' as const,
            primaryAttributes: ['Força' as const],
            savingThrows: ['Força' as const, 'Constituição' as const],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: ['Atletismo' as const],
            spellcasting: false,
            spells: [{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }],
            subclasses: [
                {
                    name: 'Cavaleiro Arcano',
                    spellcasting: true,
                    spells: [{ id: 'spell-2', name: 'Escudo Arcano', circle: 1 }],
                    traits: [],
                },
            ],
            traits: [],
        };

        type ComparableFixture = typeof output;
        const comparable = (provider as unknown as { getComparableOutput: (output: ComparableFixture) => unknown })
            .getComparableOutput(output);

        expect(comparable).toEqual(expect.objectContaining({
            subclasses: [
                expect.objectContaining({
                    name: 'Cavaleiro Arcano',
                }),
            ],
        }));
        expect('spells' in (comparable as Record<string, unknown>)).toBe(false);
        expect('spells' in ((comparable as { subclasses: Array<Record<string, unknown>> }).subclasses[0])).toBe(false);
    });

    it('resolves features for an existing equal class instead of skipping automatically', async () => {
        const incoming = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });
        getTranslateSpy(provider).mockClear();
        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult({
            ...incoming,
            traits: [{ _id: 'existing-trait', level: 1, description: '<span>Existing</span>' }],
            spells: [],
        }) as never);
        vi.mocked(Trait.find).mockReturnValue(mockFindResults([]) as never);
        vi.mocked(Trait.create).mockResolvedValue({ _id: 'trait-1' } as never);
        (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockImplementationOnce(
                (_: unknown, cb: (err: unknown, response: { selectedIndex: number }) => void) => cb(null, { selectedIndex: 0 }),
            );

        const result = await (
            provider as unknown as {
                handleExistingEqual: (
                    existing: unknown,
                    incoming: unknown,
                    originalItem: unknown,
                ) => Promise<string>;
            }
        ).handleExistingEqual(incoming, incoming, {
            name: 'Fighter',
            source: 'XPHB',
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });

        expect(result).toBe('updated');
        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object),
            {
                $set: expect.objectContaining({
                    traits: [
                        { _id: 'existing-trait', level: 1, description: '<span>Existing</span>' },
                        {
                            level: 1,
                            description: '<span data-type="mention" data-id="trait-1" data-entity-type="Habilidade" class="mention">[PT] Second Wind</span>',
                        },
                    ],
                }),
            },
            { runValidators: true },
        );
    });

    it('resolves class spells from spell-sources for an existing equal class', async () => {
        const incoming = {
            name: '[PT] Wizard',
            originalName: 'Wizard',
            description: '<p>Text.</p>',
            source: 'LDJ pág. 100',
            status: 'active',
            hitDice: 'd6',
            primaryAttributes: ['Inteligência'],
            savingThrows: ['Inteligência', 'Sabedoria'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 2,
            availableSkills: ['Arcanismo'],
            spellcasting: true,
            spells: [],
            traits: [],
        };
        (provider as unknown as { spellSources: unknown }).spellSources = {
            XPHB: {
                Fireball: { class: [{ name: 'Wizard', source: 'XPHB' }] },
                CureWounds: { class: [{ name: 'Cleric', source: 'XPHB' }] },
            },
        };
        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult(incoming) as never);
        vi.mocked(Spell.find).mockReturnValue(mockFindResults([
            { _id: 'spell-1', name: 'Bola de Fogo', originalName: 'Fireball', circle: 3 },
        ]) as never);
        (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockImplementationOnce(
                (_: unknown, cb: (err: unknown, response: { selectedIndex: number }) => void) => cb(null, { selectedIndex: 1 }),
            );

        const result = await (
            provider as unknown as {
                handleExistingEqual: (
                    existing: unknown,
                    incoming: unknown,
                    originalItem: unknown,
                ) => Promise<string>;
            }
        ).handleExistingEqual(incoming, incoming, {
            name: 'Wizard',
            source: 'XPHB',
        });

        expect(result).toBe('updated');
        expect(Spell.find).toHaveBeenCalledTimes(1);
        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object),
            {
                $set: expect.objectContaining({
                    spells: [{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }],
                }),
            },
            { runValidators: true },
        );
    });

    it('resolves subclasses for an existing equal class from the existing-class menu', async () => {
        seedSubclassFixture(provider);
        (provider as unknown as { spellSources: unknown }).spellSources = {};
        const incoming = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        });
        getTranslateSpy(provider).mockClear();
        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult({
            ...incoming,
            subclasses: [],
            traits: [],
            spells: [],
        }) as never);
        vi.mocked(Trait.find).mockReturnValue(mockFindResults([]) as never);
        vi.mocked(Trait.create)
            .mockResolvedValueOnce({ _id: 'subclass-trait-1' } as never)
            .mockResolvedValueOnce({ _id: 'subclass-trait-2' } as never);
        (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockImplementationOnce(
                (_: unknown, cb: (err: unknown, response: { selectedIndex: number }) => void) => cb(null, { selectedIndex: 2 }),
            );

        const result = await (
            provider as unknown as {
                handleExistingEqual: (
                    existing: unknown,
                    incoming: unknown,
                    originalItem: unknown,
                ) => Promise<string>;
            }
        ).handleExistingEqual(incoming, incoming, {
            name: 'Fighter',
            source: 'XPHB',
        });

        expect(result).toBe('updated');
        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object),
            {
                $set: expect.objectContaining({
                    subclasses: [
                        expect.objectContaining({
                            name: '[PT] Eldritch Knight',
                            traits: [
                                expect.objectContaining({ level: 3 }),
                                expect.objectContaining({ level: 7 }),
                            ],
                        }),
                    ],
                }),
            },
            { runValidators: true },
        );
    });

    it('skips existing equal class when user chooses skip', async () => {
        const incoming = {
            name: 'Guerreiro',
            originalName: 'Fighter',
            description: '<p>Text.</p>',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: ['Atletismo'],
            spellcasting: false,
            traits: [],
        };
        (termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockImplementationOnce(
                (_: unknown, cb: (err: unknown, response: { selectedIndex: number }) => void) => cb(null, { selectedIndex: 5 }),
            );

        const result = await (
            provider as unknown as {
                handleExistingEqual: (
                    existing: unknown,
                    incoming: unknown,
                    originalItem: unknown,
                ) => Promise<string>;
            }
        ).handleExistingEqual(incoming, incoming, {
            name: 'Fighter',
            source: 'XPHB',
        });

        expect(result).toBe('exists');
        expect(CharacterClass.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('reviews an existing equal class and opens the post-review resolver menu before advancing', async () => {
        const incoming = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        });
        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult(incoming) as never);
        mockMenuChoices(4);

        const result = await (
            provider as unknown as {
                runInteractiveItem: (item: unknown, index: number, isDryRun: boolean) => Promise<string>;
            }
        ).runInteractiveItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        }, 0, false);

        expect(result).toBe('exists');
        expect((termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } }).terminal.inputField)
            .toHaveBeenCalled();
        expect((termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } }).terminal.singleColumnMenu)
            .toHaveBeenCalled();
    });

    it('preserves existing class and subclass arrays when updating a reviewed payload with empty arrays', async () => {
        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult({
            name: 'Artífice',
            originalName: 'Artificer',
            image: '',
            description: '<p>Existente</p>',
            source: 'Eberron: Forge of the Artificer',
            status: 'active',
            hitDice: 'd8',
            primaryAttributes: ['Constituição', 'Inteligência'],
            savingThrows: ['Constituição', 'Inteligência'],
            armorProficiencies: ['Armaduras Leves'],
            weaponProficiencies: ['Armas Simples'],
            skillCount: 2,
            availableSkills: ['Arcanismo'],
            spellcasting: true,
            spellcastingAttribute: 'Inteligência',
            spells: [{ id: 'spell-1', name: 'Mísseis Mágicos', circle: 1 }],
            traits: [{ _id: 'trait-1', level: 1, description: '<span>Existing</span>' }],
            subclasses: [
                {
                    _id: 'sub-1',
                    name: 'Alquimista',
                    source: 'Eberron: Forge of the Artificer',
                    color: '#10B981',
                    spellcasting: true,
                    spells: [{ id: 'spell-2', name: 'Palavra Curativa', circle: 1 }],
                    traits: [{ level: 3, description: '<span>Existing subclass</span>' }],
                },
            ],
        }) as never);

        await provider.update({
            name: 'Artífice',
            originalName: 'Artificer',
            image: 'https://example.test/artificer.webp',
            description: '<p>Novo resumo</p>',
            source: 'Eberron: Forge of the Artificer',
            status: 'active',
            hitDice: 'd8',
            primaryAttributes: ['Constituição', 'Inteligência'],
            savingThrows: ['Constituição', 'Inteligência'],
            armorProficiencies: ['Armaduras Leves'],
            weaponProficiencies: ['Armas Simples'],
            skillCount: 2,
            availableSkills: ['Arcanismo'],
            spellcasting: true,
            spellcastingAttribute: 'Inteligência',
            spells: [],
            traits: [],
            subclasses: [
                {
                    name: 'Alquimista',
                    source: 'Eberron: Forge of the Artificer',
                    color: '#10B981',
                    spellcasting: false,
                    spells: [],
                    traits: [],
                    description: '<p>Novo texto</p>',
                },
            ],
        });

        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object),
            {
                $set: expect.objectContaining({
                    image: 'https://example.test/artificer.webp',
                    description: '<p>Novo resumo</p>',
                    spells: [{ id: 'spell-1', name: 'Mísseis Mágicos', circle: 1 }],
                    traits: [{ _id: 'trait-1', level: 1, description: '<span>Existing</span>' }],
                    subclasses: [
                        expect.objectContaining({
                            name: 'Alquimista',
                            description: '<p>Novo texto</p>',
                            spells: [{ id: 'spell-2', name: 'Palavra Curativa', circle: 1 }],
                            traits: [{ level: 3, description: '<span>Existing subclass</span>' }],
                        }),
                    ],
                }),
            },
            { runValidators: true },
        );
    });
});

describe('ClassesProvider.afterReview', () => {
    let provider: ClassesProvider;

    beforeEach(() => {
        provider = makeProvider();
        seedClassFixture(provider);
        vi.mocked(CharacterClass.findOne).mockReset();
        vi.mocked(Trait.find).mockReset();
        vi.mocked(Trait.create).mockReset();
        vi.mocked(Spell.find).mockReset();
        vi.mocked(CharacterClass.findOneAndUpdate).mockReset();
        vi.mocked(Trait.find).mockReturnValue(mockFindResults([]) as never);
        vi.mocked(Trait.create).mockResolvedValue({ _id: 'trait-1' } as never);
        vi.mocked(CharacterClass.findOneAndUpdate).mockResolvedValue(null as never);
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn>; singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockReset();
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn>; singleColumnMenu: ReturnType<typeof vi.fn> } })
            .terminal.singleColumnMenu.mockReset();
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockImplementation(
                (_: unknown, cb: (err: unknown, value: string) => void) => {
                    cb(null, '');
                },
            );
        mockMenuChoices(4);
    });

    it('translates and resolves each pending feature before moving to the next one', async () => {
        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1', 'Action Surge|Fighter|XPHB|2'],
        });
        getTranslateSpy(provider).mockClear();
        vi.mocked(Trait.create)
            .mockResolvedValueOnce({ _id: 'trait-1' } as never)
            .mockResolvedValueOnce({ _id: 'trait-2' } as never);
        mockMenuChoices(0, 4);

        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ traits: Array<{ level: number; description: string }> }>;
            }
        ).afterReview(processed, false);

        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Second Wind', '<p>Regain 1d10 + your fighter level hit points.</p>');
        expect(Trait.create).toHaveBeenCalledWith({
            name: '[PT] Second Wind',
            originalName: 'Second Wind',
            description: '[PT] <p>Regain 1d10 + your fighter level hit points.</p>',
            source: 'LDJ pág. 89',
            status: 'active',
        });
        expect(Trait.create).toHaveBeenCalledWith({
            name: '[PT] Action Surge',
            originalName: 'Action Surge',
            description: '[PT] <p>You can push yourself beyond your normal limits for a moment.</p>',
            source: 'LDJ pág. 89',
            status: 'active',
        });

        const translateCallOrder = getTranslateSpy(provider).mock.invocationCallOrder;
        const findCallOrder = vi.mocked(Trait.find).mock.invocationCallOrder;
        const reviewCallOrder = (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mock.invocationCallOrder;
        const createCallOrder = vi.mocked(Trait.create).mock.invocationCallOrder;
        expect(translateCallOrder[0]).toBeLessThan(findCallOrder[0]);
        expect(findCallOrder[0]).toBeLessThan(reviewCallOrder[0]);
        expect(reviewCallOrder[0]).toBeLessThan(createCallOrder[0]);
        expect(createCallOrder[0]).toBeLessThan(translateCallOrder[1]);
        expect(translateCallOrder[1]).toBeLessThan(findCallOrder[1]);
        expect(findCallOrder[1]).toBeLessThan(reviewCallOrder[1]);
        expect(reviewCallOrder[1]).toBeLessThan(createCallOrder[1]);
        expect(vi.mocked(CharacterClass.findOneAndUpdate)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(CharacterClass.findOneAndUpdate).mock.calls[0]?.[1]).toEqual({
            $set: expect.objectContaining({
                traits: [
                    {
                        level: 1,
                        description: '<span data-type="mention" data-id="trait-1" data-entity-type="Habilidade" class="mention">[PT] Second Wind</span>',
                    },
                ],
            }),
        });
        expect(vi.mocked(CharacterClass.findOneAndUpdate).mock.calls[1]?.[1]).toEqual({
            $set: expect.objectContaining({
                traits: [
                    {
                        level: 1,
                        description: '<span data-type="mention" data-id="trait-1" data-entity-type="Habilidade" class="mention">[PT] Second Wind</span>',
                    },
                    {
                        level: 2,
                        description: '<span data-type="mention" data-id="trait-2" data-entity-type="Habilidade" class="mention">[PT] Action Surge</span>',
                    },
                ],
            }),
        });

        expect(result.traits).toEqual([
            {
                level: 1,
                description: '<span data-type="mention" data-id="trait-1" data-entity-type="Habilidade" class="mention">[PT] Second Wind</span>',
            },
            {
                level: 2,
                description: '<span data-type="mention" data-id="trait-2" data-entity-type="Habilidade" class="mention">[PT] Action Surge</span>',
            },
        ]);
        expect('__pendingClassFeatures' in result).toBe(false);
        expect((termKit as unknown as { terminal: { singleColumnMenu: ReturnType<typeof vi.fn> } }).terminal.singleColumnMenu)
            .toHaveBeenCalledTimes(2);
    });

    it('reviews and persists subclasses after class features and class spells', async () => {
        seedSubclassFixture(provider);
        (provider as unknown as { spellSources: unknown }).spellSources = {};
        vi.mocked(Trait.create)
            .mockResolvedValueOnce({ _id: 'subclass-trait-1' } as never)
            .mockResolvedValueOnce({ _id: 'subclass-trait-2' } as never);

        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
        });
        getTranslateSpy(provider).mockClear();
        mockMenuChoices(2, 4);

        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ subclasses: Array<{ name: string; traits: Array<{ level: number; description: string }> }> }>;
            }
        ).afterReview(processed, false);

        expect(result.subclasses).toHaveLength(1);
        expect(result.subclasses[0]).toEqual(expect.objectContaining({
            name: '[PT] Eldritch Knight',
            source: 'LDJ pág. 96',
            image: 'https://5e.tools/img/classes/XPHB/Eldritch Knight.webp',
            color: '#10B981',
            spellcasting: true,
            spellcastingAttribute: 'Inteligência',
            progressionTable: {
                spellSlots: expect.objectContaining({
                    3: { cantrips: 2 },
                    20: { cantrips: 2 },
                }),
            },
            traits: [
                {
                    level: 3,
                    description: '<span data-type="mention" data-id="subclass-trait-1" data-entity-type="Habilidade" class="mention">[PT] Weapon Bond</span>',
                },
                {
                    level: 7,
                    description: '<span data-type="mention" data-id="subclass-trait-2" data-entity-type="Habilidade" class="mention">[PT] War Magic</span>',
                },
            ],
        }));
        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledTimes(3);
        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Eldritch Knight', '<p>Eldritch Knights blend spell and steel.</p>');
        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Weapon Bond', '<p>Bond magically with a weapon.</p>');
        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('War Magic', '<p>Replace one attack with a cantrip.</p>');
    });

    it('resolves subclass spells from additionalSpells and merges spell-sources without duplicates', async () => {
        seedSubclassFixture(provider, { withAdditionalSpells: true });
        (provider as unknown as { spellSources: unknown }).spellSources = {
            XPHB: {
                Shield: {
                    subclass: [
                        {
                            subclass: { name: 'Eldritch Knight', source: 'XPHB' },
                            class: { name: 'Fighter', source: 'XPHB' },
                        },
                    ],
                },
                'Magic Missile': {
                    subclass: [
                        {
                            subclass: { name: 'Eldritch Knight', source: 'XPHB' },
                            class: { name: 'Fighter', source: 'XPHB' },
                        },
                    ],
                },
            },
        };
        mockSpellSearch([
            { _id: 'spell-1', name: 'Mísseis Mágicos', originalName: 'Magic Missile', circle: 1 },
            { _id: 'spell-2', name: 'Escudo', originalName: 'Shield', circle: 1 },
        ]);

        const updated = await (
            provider as unknown as {
                resolveSubclassSpellsForClass: (
                    output: unknown,
                    subclassName: string,
                    originalSubclass: unknown,
                ) => Promise<{ subclasses: Array<{ name: string; spells: Array<{ id: string; name: string; circle: number }> }> }>;
            }
        ).resolveSubclassSpellsForClass(
            {
                name: 'Guerreiro',
                originalName: 'Fighter',
                description: '<p>Texto.</p>',
                source: 'LDJ pág. 89',
                status: 'active',
                hitDice: 'd10',
                primaryAttributes: ['Força'],
                savingThrows: ['Força', 'Constituição'],
                armorProficiencies: [],
                weaponProficiencies: [],
                skillCount: 1,
                availableSkills: ['Atletismo'],
                spellcasting: false,
                spells: [],
                traits: [],
                subclasses: [
                    {
                        name: '[PT] Eldritch Knight',
                        originalName: 'Eldritch Knight',
                        description: '<p>Texto.</p>',
                        source: 'LDJ pág. 96',
                        color: '#10B981',
                        spellcasting: false,
                        traits: [],
                        spells: [{ id: 'spell-1', name: 'Mísseis Mágicos', circle: 1 }],
                    },
                ],
            },
            '[PT] Eldritch Knight',
            {
                name: 'Eldritch Knight',
                shortName: 'Eldritch Knight',
                source: 'XPHB',
                className: 'Fighter',
                classSource: 'XPHB',
                additionalSpells: [
                    {
                        prepared: {
                            3: ['magic missile|xphb'],
                        },
                        innate: {
                            7: {
                                daily: {
                                    int: ['shield|xphb'],
                                },
                            },
                        },
                    },
                ],
            },
        );

        expect(Spell.find).toHaveBeenCalledTimes(2);
        expect(updated.subclasses[0]?.spells).toEqual([
            { id: 'spell-2', name: 'Escudo', circle: 1 },
            { id: 'spell-1', name: 'Mísseis Mágicos', circle: 1 },
        ]);
        expect(updated.subclasses[0]?.spellcasting).toBe(true);
        expect(CharacterClass.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object),
            {
                $set: expect.objectContaining({
                    subclasses: [
                        expect.objectContaining({
                            name: '[PT] Eldritch Knight',
                            spellcasting: true,
                            spells: [
                                { id: 'spell-2', name: 'Escudo', circle: 1 },
                                { id: 'spell-1', name: 'Mísseis Mágicos', circle: 1 },
                            ],
                        }),
                    ],
                }),
            },
            { runValidators: true },
        );
    });

    it('skips only the new trait when trait review is canceled', async () => {
        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });
        getTranslateSpy(provider).mockClear();
        mockMenuChoices(0, 4);
        (termKit as unknown as { terminal: { inputField: ReturnType<typeof vi.fn> } })
            .terminal.inputField.mockImplementationOnce(
                (_: unknown, cb: (err: unknown, value: undefined) => void) => {
                    cb(null, undefined);
                },
            );

        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ traits: Array<{ level: number; description: string }> }>;
            }
        ).afterReview(processed, false);

        expect(getTranslateSpy(provider)).toHaveBeenCalledWith('Second Wind', '<p>Regain 1d10 + your fighter level hit points.</p>');
        expect(Trait.create).not.toHaveBeenCalled();
        expect(vi.mocked(CharacterClass.findOneAndUpdate)).not.toHaveBeenCalled();
        expect(result.traits).toEqual([]);
        expect('__pendingClassFeatures' in result).toBe(false);
    });

    it('renders trait review with original feature data and formatted result output', async () => {
        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });
        mockMenuChoices(0, 4);

        await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ traits: Array<{ level: number; description: string }> }>;
            }
        ).afterReview(processed, false);

        expect((termKit as unknown as { terminal: { brightRed: ReturnType<typeof vi.fn> } }).terminal.brightRed)
            .toHaveBeenCalledWith(expect.stringContaining('"name": "Second Wind"'));
        expect((termKit as unknown as { terminal: { bold: ReturnType<typeof vi.fn> } }).terminal.bold)
            .toHaveBeenCalledWith('─── Original (EN) ──────────────────────────────────────────\n');
        expect((termKit as unknown as { terminal: { bold: ReturnType<typeof vi.fn> } }).terminal.bold)
            .toHaveBeenCalledWith('─── Resultado ─────────────────────────────────────────────\n');
    });

    it('does not translate or save traits in dry-run mode', async () => {
        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });
        getTranslateSpy(provider).mockClear();

        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ traits: Array<{ level: number; description: string }> }>;
            }
        ).afterReview(processed, true);

        expect(getTranslateSpy(provider)).not.toHaveBeenCalled();
        expect(Trait.create).not.toHaveBeenCalled();
        expect(result.traits).toEqual([]);
        expect('__pendingClassFeatures' in result).toBe(false);
    });

    it('preserves existing class and subclass arrays when leaving post-review resolution without changes', async () => {
        seedSubclassFixture(provider);
        (provider as unknown as { spellSources: unknown }).spellSources = {};

        const processed = await provider.processItem({
            name: 'Fighter',
            source: 'XPHB',
            page: 89,
            hd: { faces: 10 },
            proficiency: ['str', 'con'],
            startingProficiencies: {
                armor: ['light'],
                weapons: ['simple'],
                skills: [{ choose: { from: ['athletics'], count: 1 } }],
            },
            classFeatures: ['Second Wind|Fighter|XPHB|1'],
        });

        vi.mocked(CharacterClass.findOne).mockReturnValue(mockLeanResult({
            name: '[PT] Fighter',
            originalName: 'Fighter',
            image: '',
            description: '[PT] <p>Fighters master weapons and armor.</p>',
            source: 'LDJ pág. 89',
            status: 'active',
            hitDice: 'd10',
            primaryAttributes: ['Força'],
            savingThrows: ['Força', 'Constituição'],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 1,
            availableSkills: [],
            spellcasting: false,
            spells: [{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }],
            traits: [{ _id: 'trait-slot-1', level: 1, description: '<span>Existing</span>' }],
            subclasses: [
                {
                    _id: 'sub-1',
                    name: '[PT] Eldritch Knight',
                    source: 'LDJ pág. 96',
                    color: '#10B981',
                    spellcasting: true,
                    spells: [{ id: 'spell-2', name: 'Escudo Arcano', circle: 1 }],
                    traits: [{ level: 3, description: '<span>Existing subclass</span>' }],
                },
            ],
        }) as never);
        mockMenuChoices(4);

        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{
                    spells: Array<{ id: string; name: string; circle: number }>;
                    traits: Array<{ level: number; description: string }>;
                    subclasses: Array<{ spells: Array<{ id: string; name: string; circle: number }>; traits: Array<{ level: number; description: string }> }>;
                }>;
            }
        ).afterReview(processed!, false);

        expect(result.spells).toEqual([{ id: 'spell-1', name: 'Bola de Fogo', circle: 3 }]);
        expect(result.traits).toEqual([{ _id: 'trait-slot-1', level: 1, description: '<span>Existing</span>' }]);
        expect(result.subclasses[0]?.spells).toEqual([{ id: 'spell-2', name: 'Escudo Arcano', circle: 1 }]);
        expect(result.subclasses[0]?.traits).toEqual([{ level: 3, description: '<span>Existing subclass</span>' }]);
    });
});
