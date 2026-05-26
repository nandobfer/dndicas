import fs from 'fs';
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
    shouldTranslateSpecialStatText,
} from '../../../../scripts/seed-data/providers/monsters-provider';
import { createMonsterSchema } from '../../../../src/features/monsters/api/validation';

function makeProvider(): { provider: MonstersProvider; translateSpy: ReturnType<typeof vi.spyOn> } {
    const provider = new MonstersProvider();
    const translateSpy = vi.spyOn(provider as unknown as { translateItem: (...args: unknown[]) => unknown }, 'translateItem')
        .mockImplementation(async (...args: unknown[]) => ({
            name: `[PT] ${args[0] as string}`,
            description: `[PT] ${args[1] as string}`,
        }));
    return { provider, translateSpy };
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

    it('detects when special AC or HP text still needs translation', () => {
        expect(shouldTranslateSpecialStatText('17')).toBe(false);
        expect(shouldTranslateSpecialStatText('12d8 + 24')).toBe(false);
        expect(shouldTranslateSpecialStatText("11 + the spell's level")).toBe(true);
        expect(shouldTranslateSpecialStatText('30 (Ghostly and Putrid only) or 20 (Skeletal only) + 10 for each spell level above 3')).toBe(true);
    });
});

describe('MonstersProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('processes a concrete XMM monster with actions, defenses, saves, and skills', async () => {
        const { provider } = makeProvider();
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

    it('translates special AC and HP text when they contain prose', async () => {
        const { provider, translateSpy } = makeProvider();
        const output = await provider.processItem({
            name: 'Summoned Undead',
            source: 'XMM',
            size: ['M'],
            type: 'undead',
            alignment: [{ special: 'any alignment' }],
            ac: [{ special: '30 (Ghostly and Putrid only) or 20 (Skeletal only) + 10 for each spell level above 3' }],
            hp: { special: "40 + 10 for each spell level above 4" },
            speed: { walk: 30, fly: { number: 30, condition: '(hover)' } },
            str: 12,
            dex: 10,
            con: 15,
            int: 6,
            wis: 10,
            cha: 6,
            passive: 10,
            cr: null,
        });

        expect(output).toMatchObject({
            armorClass: '[PT] 30 (Ghostly and Putrid only) or 20 (Skeletal only) + 10 for each spell level above 3',
            hitPointsFormula: "[PT] 40 + 10 for each spell level above 4",
            challengeRating: '0',
            experience: 0,
            alignment: 'any',
            flySpeed: '9m (hover)',
        });
        expect(translateSpy).toHaveBeenCalledWith(
            '30 (Ghostly and Putrid only) or 20 (Skeletal only) + 10 for each spell level above 3',
            '<p>30 (Ghostly and Putrid only) or 20 (Skeletal only) + 10 for each spell level above 3</p>',
        );
        expect(translateSpy).toHaveBeenCalledWith(
            '40 + 10 for each spell level above 4',
            '<p>40 + 10 for each spell level above 4</p>',
        );
    });

    it('keeps formula-only special AC and HP text without extra translation', async () => {
        const { provider, translateSpy } = makeProvider();
        const output = await provider.processItem({
            name: 'Clockwork Guardian',
            source: 'XMM',
            size: ['L'],
            type: 'construct',
            alignment: ['U'],
            ac: [{ special: '17' }],
            hp: { special: '12d8 + 24' },
            speed: { walk: 30 },
            str: 18,
            dex: 10,
            con: 14,
            int: 3,
            wis: 10,
            cha: 1,
            passive: 10,
            cr: '4',
        });

        expect(output).toMatchObject({
            armorClass: '17',
            hitPointsFormula: '12d8 + 24',
        });
        const translatedLabels = translateSpy.mock.calls.map((call) => call[0]);
        expect(translatedLabels).not.toContain('17');
        expect(translatedLabels).not.toContain('12d8 + 24');
    });

    it('loads all bestiary files, pairs matching fluff files, and keeps legendary groups static', () => {
        const originalReadDir = fs.readdirSync;
        const originalReadFile = fs.readFileSync;

        vi.spyOn(fs, 'readdirSync').mockImplementation((filePath, options) => {
            if (String(filePath).includes('/src/lib/5etools-data/bestiary')) {
                return [
                    'bestiary-alpha.json',
                    'bestiary-beta.json',
                    'fluff-bestiary-alpha.json',
                    'fluff-bestiary-unused.json',
                    'legendarygroups.json',
                    'readme.txt',
                ] as unknown as ReturnType<typeof originalReadDir>;
            }
            return originalReadDir(filePath, options as never);
        });
        const readFileSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
            const file = String(filePath);
            if (file.endsWith('fluff-bestiary-alpha.json')) return JSON.stringify({ monsterFluff: [{ name: 'Alpha Beast', source: 'ALPHA', entries: ['Alpha lore'] }] }) as never;
            if (file.endsWith('legendarygroups.json')) return JSON.stringify({ legendaryGroup: [{ name: 'Alpha Lair', source: 'ALPHA' }] }) as never;
            if (file.endsWith('bestiary-alpha.json')) return JSON.stringify({ monster: [{ name: 'Alpha Beast', source: 'ALPHA' }] }) as never;
            if (file.endsWith('bestiary-beta.json')) return JSON.stringify({ monster: [{ name: 'Beta Beast', source: 'BETA' }] }) as never;
            return originalReadFile(filePath, options as never);
        });

        const provider = new MonstersProvider();
        const monsters = provider.readDataFile();
        const alphaFluff = (
            provider as unknown as {
                resolveFluff: (monster: { name: string; source: string }) => { entries?: string[] } | undefined;
            }
        ).resolveFluff({ name: 'Alpha Beast', source: 'ALPHA' });

        expect(monsters).toEqual([
            { name: 'Alpha Beast', source: 'ALPHA' },
            { name: 'Beta Beast', source: 'BETA' },
        ]);
        expect(alphaFluff?.entries).toEqual(['Alpha lore']);
        const readPaths = readFileSpy.mock.calls.map((call) => String(call[0]));
        expect(readPaths.some((file) => file.includes('legendarygroups.json'))).toBe(true);
        expect(readPaths.some((file) => file.includes('fluff-bestiary-alpha.json'))).toBe(true);
        expect(readPaths.some((file) => file.includes('fluff-bestiary-unused.json'))).toBe(false);
    });
});
