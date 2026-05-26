import { describe, expect, it, vi, beforeEach } from 'vitest';

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

vi.mock('../../../../src/core/database/db', () => ({
    default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/features/monsters/models/monster', () => ({
    MonsterModel: {
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
        create: vi.fn(),
    },
}));

import {
    MonstersProvider,
    cleanText,
    extractAttackRoll,
    extractHitRoll,
    mapAlignment,
    mapMonsterType,
    mapNpcParams,
    mapSize,
    mapSpeed,
} from '../../../../scripts/seed-data/providers/monsters-provider';
import { createMonsterSchema } from '../../../../src/features/monsters/api/validation';

function makeProvider(): MonstersProvider {
    const provider = new MonstersProvider();
    vi.spyOn(provider as unknown as { translateItem: (...args: unknown[]) => unknown }, 'translateItem')
        .mockImplementation(async (...args: unknown[]) => ({
            name: `[PT] ${args[0] as string}`,
            description: `[PT] ${args[1] as string}`,
        }));
    return provider;
}

describe('monster seed helpers', () => {
    it('keeps numeric AC from form valid while normalizing it to string', () => {
        const parsed = createMonsterSchema.parse({
            name: 'Lobo',
            source: 'LDM',
            description: 'Descrição válida para monstro.',
            type: 'beast',
            size: 'M',
            alignment: 'unaligned',
            armorClass: 13,
            hitPointsFormula: '2d8 + 2',
            attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
            challengeRating: '1/4',
        });

        expect(parsed.armorClass).toBe('13');
    });

    it('accepts special AC and hit points text from XPHB stat blocks', () => {
        const parsed = createMonsterSchema.parse({
            name: 'Aberrant Spirit',
            source: 'LDJ',
            description: 'Descrição válida para espírito invocado.',
            type: 'aberration',
            size: 'M',
            alignment: 'any',
            armorClass: "11 + the spell's level",
            hitPointsFormula: '40 + 10 for each spell level above 4',
            attributes: { strength: 16, dexterity: 10, constitution: 15, intelligence: 16, wisdom: 10, charisma: 6 },
            challengeRating: '',
        });

        expect(parsed.armorClass).toBe("11 + the spell's level");
        expect(parsed.hitPointsFormula).toBe('40 + 10 for each spell level above 4');
        expect(parsed.challengeRating).toBe('0');
    });

    it('maps speed modes from feet to meters', () => {
        expect(mapSpeed({ walk: 30, fly: { number: 50, condition: '(hover)' }, swim: 40, climb: 20, burrow: 10 })).toEqual({
            speed: '9m, escavação 3m',
            flySpeed: '15m (hover)',
            swimSpeed: '12m',
            climbSpeed: '6m',
        });
    });

    it('maps type, size, and alignment variants', () => {
        expect(mapMonsterType({ type: { choose: ['celestial', 'fiend'] } })).toBe('celestial');
        expect(mapSize(['T', 'S', 'M'])).toBe('V');
        expect(mapAlignment(['C', 'E'])).toBe('CE');
        expect(mapAlignment(['U'])).toBe('unaligned');
    });

    it('extracts attack and damage rolls for NpcParam entries', () => {
        const raw = '{@atkr m,r} {@hit 5}, reach 5 ft. {@h}7 ({@damage 1d8 + 3}) Bludgeoning damage plus 11 ({@damage 2d10}) Lightning damage.';

        expect(extractAttackRoll(raw)).toBe(5);
        expect(extractHitRoll(raw)).toBe('1d8 + 3 concussão + 2d10 elétrico');

        const params = mapNpcParams([{ name: 'Wind Staff', entries: [raw] }]);
        expect(params[0]).toMatchObject({
            label: 'Wind Staff',
            attackRoll: 5,
            hitRoll: '1d8 + 3 concussão + 2d10 elétrico',
        });
        expect(params[0].description).toContain('Ataque corpo a corpo ou à distância');
        expect(cleanText('{@spell Gust of Wind|XPHB} at {@dc 13}')).toBe('Gust of Wind at CD 13');
    });
});

describe('MonstersProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('processes a concrete XMM monster with actions, defenses, saves, and skills', async () => {
        const provider = makeProvider();
        const output = await provider.processItem({
            name: 'Aarakocra Aeromancer',
            source: 'XMM',
            page: 10,
            size: ['M'],
            type: 'elemental',
            alignment: ['N'],
            ac: [16],
            hp: { average: 66, formula: '12d8 + 12' },
            speed: { walk: 20, fly: 50 },
            str: 10,
            dex: 16,
            con: 12,
            int: 13,
            wis: 17,
            cha: 12,
            save: { dex: '+5', wis: '+5' },
            skill: { arcana: '+3', nature: '+5', perception: '+7' },
            passive: 17,
            languages: ['Aarakocra', 'Primordial (Auran)'],
            cr: '4',
            immune: ['lightning'],
            action: [
                {
                    name: 'Wind Staff',
                    entries: ['{@atkr m,r} {@hit 5}, reach 5 ft. {@h}7 ({@damage 1d8 + 3}) Bludgeoning damage plus 11 ({@damage 2d10}) Lightning damage.'],
                },
            ],
        });

        expect(output).toMatchObject({
            name: '[PT] Aarakocra Aeromancer',
            originalName: 'Aarakocra Aeromancer',
            source: 'XMM pág. 10',
            type: 'elemental',
            size: 'M',
            alignment: 'N',
            armorClass: '16',
            hitPointsFormula: '12d8 + 12',
            speed: '6m',
            flySpeed: '15m',
            challengeRating: '4',
            damageImmunities: ['lightning'],
        });
        expect(output?.savingThrows.dexterity?.override).toBe(5);
        expect(output?.skills.Percepção?.override).toBe(7);
        expect(output?.actions[0]).toMatchObject({ label: '[PT] Wind Staff', attackRoll: 5, hitRoll: '1d8 + 3 concussão + 2d10 elétrico' });
    });

    it('processes an XPHB special stat block with textual AC, HP, and missing CR', async () => {
        const provider = makeProvider();
        const output = await provider.processItem({
            name: 'Aberrant Spirit',
            source: 'XPHB',
            size: ['M'],
            type: 'aberration',
            alignment: [{ special: 'any alignment' }],
            ac: [{ special: "11 + the spell's level" }],
            hp: { special: '40 + 10 for each spell level above 4' },
            speed: { walk: 30, fly: { number: 30, condition: '(hover)' } },
            str: 16,
            dex: 10,
            con: 15,
            int: 16,
            wis: 10,
            cha: 6,
            passive: 10,
            cr: null,
        });

        expect(output).toMatchObject({
            armorClass: "11 + the spell's level",
            hitPointsFormula: '40 + 10 for each spell level above 4',
            challengeRating: '0',
            experience: 0,
            alignment: 'any',
            flySpeed: '9m (hover)',
        });
    });
});
