/**
 * @fileoverview Unit tests for ClassesProvider.
 */

import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

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
    buildDescriptionHtml,
    buildFluffImageUrl,
    cleanText,
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

function makeProvider(): ClassesProvider {
    const provider = new ClassesProvider();
    vi.spyOn(provider as unknown as { translateItem: (...args: unknown[]) => unknown }, 'translateItem')
        .mockImplementation(async (...args: unknown[]) => ({
            name: `[PT] ${args[0] as string}`,
            description: `[PT] ${args[1] as string}`,
        }));
    return provider;
}

function mockLeanResult<T>(value: T) {
    return { lean: vi.fn().mockResolvedValue(value) };
}

function mockFindResults<T>(value: T[]) {
    return { limit: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(value) })) };
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
});

describe('ClassesProvider.processItem', () => {
    let provider: ClassesProvider;

    beforeEach(() => {
        provider = makeProvider();
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

    it('maps a class with fluff and feature traits', async () => {
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
        expect(result!.traits).toHaveLength(1);
        expect((result!.traits![0] as unknown as { name: string }).name).toBe('[PT] Second Wind');
        expect((result!.traits![0] as unknown as { originalName: string }).originalName).toBe('Second Wind');
        expect(result!.traits![0].level).toBe(1);
    });
});

describe('ClassesProvider.findExisting', () => {
    let provider: ClassesProvider;
    let findOneMock: MockInstance;

    beforeEach(() => {
        provider = makeProvider();
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
});

describe('ClassesProvider.afterReview', () => {
    let provider: ClassesProvider;

    beforeEach(() => {
        provider = makeProvider();
        vi.mocked(Trait.find).mockReturnValue(mockFindResults([]) as never);
        vi.mocked(Trait.create).mockResolvedValue({ _id: 'trait-1' } as never);
    });

    it('creates missing Trait documents and stores mention HTML in class traits', async () => {
        const result = await (
            provider as unknown as {
                afterReview: (output: unknown, isDryRun: boolean) => Promise<{ traits: Array<{ level: number; description: string }> }>;
            }
        ).afterReview({
            name: 'Guerreiro',
            originalName: 'Fighter',
            source: 'LDJ',
            traits: [
                {
                    level: 1,
                    name: 'Retomar o Fôlego',
                    originalName: 'Second Wind',
                    description: '<p>Recover hit points.</p>',
                },
            ],
        }, false);

        expect(Trait.create).toHaveBeenCalledWith({
            name: 'Retomar o Fôlego',
            originalName: 'Second Wind',
            description: '<p>Recover hit points.</p>',
            source: 'LDJ',
            status: 'active',
        });
        expect(result.traits).toEqual([
            {
                level: 1,
                description: '<span data-type="mention" data-id="trait-1" data-entity-type="Habilidade" class="mention">Retomar o Fôlego</span>',
            },
        ]);
    });
});
