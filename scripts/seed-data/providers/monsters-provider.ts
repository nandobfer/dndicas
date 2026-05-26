/**
 * @fileoverview MonstersProvider — seeds monsters from 5etools bestiary data.
 *
 * Reads:
 *  - src/lib/5etools-data/bestiary/bestiary-xmm.json
 *  - src/lib/5etools-data/bestiary/bestiary-xphb.json
 *  - src/lib/5etools-data/bestiary/fluff-bestiary-*.json
 *  - src/lib/5etools-data/bestiary/legendarygroups.json
 */

import fs from 'fs';
import path from 'path';
import { BaseProvider, convertFeetToMeters, formatSource } from '../base-provider';
import dbConnect from '../../../src/core/database/db';
import { MonsterModel } from '../../../src/features/monsters/models/monster';
import type { CreateMonsterInput, MonsterAlignment, MonsterSize, MonsterType, NpcParam } from '../../../src/features/monsters/types/monsters.types';
import type { AttributeType, SkillName } from '../../../src/features/character-sheets/types/character-sheet.types';
import type { DamageTypeKey } from '../../../src/lib/config/damage-types-hex';
import { getMonsterXp } from '../../../src/features/monsters/utils/monster-calculations';

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const BESTIARY_DIR = 'src/lib/5etools-data/bestiary';

type RawEntry = string | {
    type?: string;
    name?: string;
    entry?: string;
    entries?: RawEntry[];
    items?: RawEntry[];
};

interface FiveEToolsMonster {
    name: string;
    source: string;
    page?: number;
    size?: string[];
    type?: string | { type?: string | { choose?: string[] }; tags?: string[] };
    alignment?: unknown[];
    ac?: Array<number | { ac?: number; special?: string; from?: string[] }>;
    hp?: { average?: number; formula?: string; special?: string };
    speed?: Record<string, unknown>;
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
    save?: Record<string, string>;
    skill?: Record<string, string>;
    senses?: string[];
    passive?: number;
    languages?: string[];
    cr?: string | { cr?: string; xp?: number; xpLair?: number } | null;
    vulnerable?: unknown[];
    resist?: unknown[];
    immune?: unknown[];
    conditionImmune?: unknown[];
    trait?: FiveEToolsActionEntry[] | null;
    action?: FiveEToolsActionEntry[] | null;
    bonus?: FiveEToolsActionEntry[] | null;
    reaction?: FiveEToolsActionEntry[] | null;
    legendary?: FiveEToolsActionEntry[] | null;
    spellcasting?: FiveEToolsSpellcasting[] | null;
    legendaryGroup?: { name: string; source: string };
    hasFluffImages?: boolean;
}

interface FiveEToolsActionEntry {
    name?: string;
    entries?: RawEntry[];
    entry?: string;
}

interface FiveEToolsSpellcasting {
    name?: string;
    headerEntries?: string[];
    will?: string[];
    daily?: Record<string, string[]>;
    spells?: Record<string, { spells?: string[]; slots?: number }>;
    legendary?: Record<string, string[]>;
    footerEntries?: string[];
    displayAs?: 'action' | 'bonus' | 'reaction' | 'legendary';
}

interface MonsterFluff {
    name: string;
    source: string;
    entries?: RawEntry[];
    images?: Array<{ href?: { type?: string; path?: string; url?: string } }>;
    _copy?: {
        name: string;
        source: string;
        _mod?: {
            entries?: { mode?: string; items?: RawEntry[] };
            images?: { mode?: string; items?: Array<{ href?: { type?: string; path?: string; url?: string } }> };
        };
    };
}

interface LegendaryGroup {
    name: string;
    source: string;
    lairActions?: RawEntry[];
    regionalEffects?: RawEntry[];
}

const VALID_MONSTER_TYPES: MonsterType[] = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];
const VALID_SIZES: MonsterSize[] = ['F', 'D', 'T', 'S', 'M', 'L', 'H', 'G', 'C', 'V'];

const ATTRIBUTE_MAP: Record<string, AttributeType> = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma',
};

const SKILL_MAP: Record<string, SkillName> = {
    acrobatics: 'Acrobacia',
    arcana: 'Arcanismo',
    athletics: 'Atletismo',
    performance: 'Atuação',
    deception: 'Enganação',
    stealth: 'Furtividade',
    history: 'História',
    intimidation: 'Intimidação',
    insight: 'Intuição',
    investigation: 'Investigação',
    animalHandling: 'Lidar com Animais',
    medicine: 'Medicina',
    nature: 'Natureza',
    perception: 'Percepção',
    persuasion: 'Persuasão',
    sleightOfHand: 'Prestidigitação',
    religion: 'Religião',
    survival: 'Sobrevivência',
};

const DAMAGE_MAP: Record<string, DamageTypeKey> = {
    acid: 'acid',
    cold: 'cold',
    fire: 'fire',
    force: 'force',
    lightning: 'lightning',
    necrotic: 'necrotic',
    poison: 'poison',
    radiant: 'radiant',
    thunder: 'thunder',
    psychic: 'psychic',
    bludgeoning: 'physical',
    piercing: 'physical',
    slashing: 'physical',
};

const DAMAGE_PT: Record<string, string> = {
    acid: 'ácido',
    cold: 'frio',
    fire: 'fogo',
    force: 'energia',
    lightning: 'elétrico',
    necrotic: 'necrótico',
    poison: 'veneno',
    radiant: 'radiante',
    thunder: 'trovejante',
    psychic: 'psíquico',
    bludgeoning: 'concussão',
    piercing: 'perfurante',
    slashing: 'cortante',
};

const CONDITION_MAP = new Set([
    'blinded',
    'charmed',
    'deafened',
    'exhaustion',
    'frightened',
    'grappled',
    'incapacitated',
    'invisible',
    'paralyzed',
    'petrified',
    'poisoned',
    'prone',
    'restrained',
    'stunned',
    'unconscious',
]);

const TAG_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\{@actSaveFail\}/g, 'Falha:'],
    [/\{@actSaveSuccess\}/g, 'Sucesso:'],
    [/\{@actSaveSuccessOrFail\}/g, 'Sucesso ou falha:'],
    [/\{@h\}/g, 'Acerto: '],
    [/\{@atkr\s+m,r\}/g, 'Ataque corpo a corpo ou à distância:'],
    [/\{@atkr\s+m\}/g, 'Ataque corpo a corpo:'],
    [/\{@atkr\s+r\}/g, 'Ataque à distância:'],
    [/\{@actSave\s+str\}/g, 'Salvaguarda de Força'],
    [/\{@actSave\s+dex\}/g, 'Salvaguarda de Destreza'],
    [/\{@actSave\s+con\}/g, 'Salvaguarda de Constituição'],
    [/\{@actSave\s+int\}/g, 'Salvaguarda de Inteligência'],
    [/\{@actSave\s+wis\}/g, 'Salvaguarda de Sabedoria'],
    [/\{@actSave\s+cha\}/g, 'Salvaguarda de Carisma'],
];

function readJsonFile<T>(relativePath: string): T {
    return JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), 'utf-8')) as T;
}

function metersFromFeet(feet: number): string {
    const meters = feet * 0.3;
    return `${Number.isInteger(meters) ? meters : meters.toFixed(1).replace('.', ',')}m`;
}

function formatSpeedValue(value: unknown): string | undefined {
    if (typeof value === 'number') return metersFromFeet(value);
    if (typeof value === 'object' && value !== null) {
        const obj = value as { number?: number; condition?: string };
        if (typeof obj.number === 'number') return `${metersFromFeet(obj.number)}${obj.condition ? ` ${cleanText(obj.condition)}` : ''}`;
    }
    if (value === true) return 'igual ao deslocamento';
    return undefined;
}

export function mapSpeed(speed?: Record<string, unknown>) {
    const walk = formatSpeedValue(speed?.walk) ?? '9m';
    const burrow = formatSpeedValue(speed?.burrow);
    return {
        speed: burrow ? `${walk}, escavação ${burrow}` : walk,
        flySpeed: formatSpeedValue(speed?.fly),
        swimSpeed: formatSpeedValue(speed?.swim),
        climbSpeed: formatSpeedValue(speed?.climb),
    };
}

export function cleanText(text: string): string {
    let result = text;
    for (const [regex, replacement] of TAG_REPLACEMENTS) result = result.replace(regex, replacement);
    return convertFeetToMeters(result)
        .replace(/\{@recharge\s+(\d+)\}/gi, '(Recarga $1-6)')
        .replace(/\{@damage\s+([^}]+)\}/gi, '$1')
        .replace(/\{@dice\s+([^}]+)\}/gi, '$1')
        .replace(/\{@hit\s+([^}]+)\}/gi, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/gi, 'CD $1')
        .replace(/\{@[a-zA-Z]+\s+([^}|]+)(?:\|[^}]*)?\}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildEntryHtml(entry: RawEntry): string {
    if (typeof entry === 'string') return `<p>${cleanText(entry)}</p>`;
    if (entry.entry) return `<p>${entry.name ? `<strong>${cleanText(entry.name)}.</strong> ` : ''}${cleanText(entry.entry)}</p>`;
    if (entry.items?.length) {
        const items = entry.items.map((item) => `<li>${stripParagraph(buildEntryHtml(item))}</li>`).join('');
        return `<ul>${items}</ul>`;
    }
    if (entry.entries?.length) {
        const content = entry.entries.map(buildEntryHtml).join('');
        return entry.name ? `<p><strong>${cleanText(entry.name)}.</strong></p>${content}` : content;
    }
    return '';
}

function stripParagraph(html: string): string {
    return html.replace(/^<p>/, '').replace(/<\/p>$/, '');
}

function buildEntriesHtml(entries?: RawEntry[]): string {
    return (entries ?? []).map(buildEntryHtml).join('');
}

export function mapMonsterType(type: FiveEToolsMonster['type']): MonsterType {
    if (typeof type === 'string' && VALID_MONSTER_TYPES.includes(type as MonsterType)) return type as MonsterType;
    if (typeof type === 'object' && type) {
        if (typeof type.type === 'string' && VALID_MONSTER_TYPES.includes(type.type as MonsterType)) return type.type as MonsterType;
        if (typeof type.type === 'object') {
            const chosen = type.type.choose?.find((item) => VALID_MONSTER_TYPES.includes(item as MonsterType));
            if (chosen) return chosen as MonsterType;
        }
    }
    return 'monstrosity';
}

export function mapSize(size?: string[]): MonsterSize {
    if (!size?.length) return 'M';
    if (size.length > 1) return 'V';
    return VALID_SIZES.includes(size[0] as MonsterSize) ? size[0] as MonsterSize : 'M';
}

export function mapAlignment(alignment?: unknown[]): MonsterAlignment {
    if (!alignment?.length) return 'unaligned';
    if (alignment.some((item) => item === 'U')) return 'unaligned';
    if (alignment.some((item) => item === 'A' || typeof item === 'object')) return 'any';
    const joined = alignment.filter((item): item is string => typeof item === 'string').join('');
    if (['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'].includes(joined)) return joined as MonsterAlignment;
    return 'any';
}

function mapArmorClass(ac?: FiveEToolsMonster['ac']): string {
    const first = ac?.[0];
    if (typeof first === 'number') return String(first);
    if (first?.ac !== undefined) return String(first.ac);
    if (first?.special) return cleanText(first.special);
    return '10';
}

function mapHitPoints(hp?: FiveEToolsMonster['hp']): string {
    if (hp?.formula) return hp.formula;
    if (hp?.special) return cleanText(hp.special);
    if (hp?.average !== undefined) return String(hp.average);
    return '1';
}

function mapChallengeRating(cr: FiveEToolsMonster['cr']): string {
    if (typeof cr === 'string') return cr;
    if (cr?.cr) return cr.cr;
    return '0';
}

function parseSigned(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value.replace('+', '').trim());
    return Number.isFinite(parsed) ? parsed : undefined;
}

function mapSavingThrows(save?: Record<string, string>): CreateMonsterInput['savingThrows'] {
    return Object.fromEntries(
        Object.entries(save ?? {})
            .map(([key, value]) => {
                const attribute = ATTRIBUTE_MAP[key];
                const override = parseSigned(value);
                return attribute && override !== undefined ? [attribute, { proficient: false, override }] : null;
            })
            .filter((item): item is [AttributeType, { proficient: boolean; override: number }] => item !== null),
    );
}

function mapSkills(skill?: Record<string, string>): CreateMonsterInput['skills'] {
    return Object.fromEntries(
        Object.entries(skill ?? {})
            .map(([key, value]) => {
                const skillName = SKILL_MAP[key];
                const override = parseSigned(value);
                return skillName && override !== undefined ? [skillName, { proficient: false, expertise: false, override }] : null;
            })
            .filter((item): item is [SkillName, { proficient: boolean; expertise: boolean; override: number }] => item !== null),
    );
}

function flattenStrings(values: unknown[] | undefined): string[] {
    const result: string[] = [];
    for (const value of values ?? []) {
        if (typeof value === 'string') result.push(value);
        else if (typeof value === 'object' && value !== null) {
            const obj = value as Record<string, unknown>;
            for (const nested of ['resist', 'immune', 'vulnerable', 'conditionImmune']) {
                if (Array.isArray(obj[nested])) result.push(...flattenStrings(obj[nested] as unknown[]));
            }
        }
    }
    return result;
}

function mapDamageList(values: unknown[] | undefined): DamageTypeKey[] {
    return Array.from(new Set(flattenStrings(values).map((value) => DAMAGE_MAP[value.toLowerCase()]).filter(Boolean)));
}

function mapConditionImmunities(values: unknown[] | undefined) {
    const names = flattenStrings(values).filter((value) => CONDITION_MAP.has(value));
    const notes = (values ?? [])
        .filter((value) => typeof value === 'object' && value !== null && typeof (value as { note?: unknown }).note === 'string')
        .map((value) => cleanText(String((value as { note: string }).note)));
    return {
        conditionImmunities: Array.from(new Set(names)) as CreateMonsterInput['conditionImmunities'],
        conditionImmunityNotes: notes.join('; ') || undefined,
    };
}

export function extractAttackRoll(text: string): number | undefined {
    const match = text.match(/\{@hit\s+([+-]?\d+)\}/i);
    return match ? Number(match[1]) : undefined;
}

export function extractHitRoll(text: string): string | undefined {
    const parts: string[] = [];
    const regex = /\{@(?:damage|dice)\s+([^}]+)\}/gi;
    const matches = Array.from(text.matchAll(regex));
    matches.forEach((match, index) => {
        const dice = cleanText(match[1]);
        const nextIndex = matches[index + 1]?.index;
        const tail = text.slice((match.index ?? 0) + match[0].length, nextIndex ?? undefined);
        const damage = Object.keys(DAMAGE_PT).find((type) => new RegExp(`\\b${type}\\b`, 'i').test(tail));
        parts.push(damage ? `${dice} ${DAMAGE_PT[damage]}` : dice);
    });
    return parts.length > 0 ? parts.join(' + ') : undefined;
}

function extractRecharge(name?: string): string | undefined {
    const match = name?.match(/\{@recharge\s+(\d+)\}/i);
    return match ? `${match[1]}-6` : undefined;
}

export function mapNpcParams(entries?: FiveEToolsActionEntry[] | null): NpcParam[] {
    return (entries ?? []).map((entry, index) => {
        const rawText = [entry.name ?? '', ...(entry.entries ?? []), entry.entry ?? ''].map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join(' ');
        return {
            label: cleanText(entry.name || `Opção ${index + 1}`),
            description: buildEntriesHtml(entry.entries ?? (entry.entry ? [entry.entry] : [])) || `<p>${cleanText(entry.name || `Opção ${index + 1}`)}</p>`,
            attackRoll: extractAttackRoll(rawText),
            hitRoll: extractHitRoll(rawText),
            recharge: extractRecharge(entry.name),
        };
    });
}

function mapLegendaryEntries(entries?: RawEntry[]): NpcParam[] {
    if (!entries?.length) return [];
    const params: NpcParam[] = [];
    let intro: string[] = [];
    entries.forEach((entry) => {
        if (typeof entry === 'string') {
            intro.push(entry);
            return;
        }
        if (entry.items?.length) {
            entry.items.forEach((item, index) => {
                if (typeof item === 'object' && item.name) {
                    params.push({ label: cleanText(item.name), description: buildEntriesHtml([...intro, item]) });
                } else {
                    params.push({ label: `Opção ${params.length + index + 1}`, description: buildEntriesHtml([...intro, item]) });
                }
            });
            intro = [];
            return;
        }
        params.push({ label: cleanText(entry.name || `Opção ${params.length + 1}`), description: buildEntriesHtml([...intro, entry]) });
        intro = [];
    });
    if (intro.length) params.push({ label: 'Descrição', description: buildEntriesHtml(intro) });
    return params;
}

function spellcastingToParam(spellcasting: FiveEToolsSpellcasting): NpcParam {
    const entries: RawEntry[] = [...(spellcasting.headerEntries ?? [])];
    if (spellcasting.will?.length) entries.push({ type: 'list', name: 'À vontade', items: spellcasting.will });
    for (const [uses, spells] of Object.entries(spellcasting.daily ?? {})) entries.push({ type: 'list', name: `${uses}/dia`, items: spells });
    for (const [level, data] of Object.entries(spellcasting.spells ?? {})) entries.push({ type: 'list', name: `Círculo ${level}`, items: data.spells ?? [] });
    for (const [uses, spells] of Object.entries(spellcasting.legendary ?? {})) entries.push({ type: 'list', name: `${uses} ação lendária`, items: spells });
    entries.push(...(spellcasting.footerEntries ?? []));
    return {
        label: cleanText(spellcasting.name || 'Spellcasting'),
        description: buildEntriesHtml(entries),
        attackRoll: extractAttackRoll(entries.join(' ')),
    };
}

function buildImageUrl(fluff?: MonsterFluff): string {
    const image = fluff?.images?.[0];
    if (image?.href?.type === 'internal' && image.href.path) return `https://5e.tools/img/${image.href.path}`;
    if (image?.href?.url) return image.href.url;
    return '';
}

export class MonstersProvider extends BaseProvider<FiveEToolsMonster, CreateMonsterInput> {
    readonly name = 'Monsters';
    readonly dataFilePath = `${BESTIARY_DIR}/bestiary-xmm.json`;
    readonly dataKey = 'monster';

    private fluff = new Map<string, MonsterFluff>();
    private legendaryGroups = new Map<string, LegendaryGroup>();

    constructor() {
        super();
        this.loadSupplementalData();
    }

    override readDataFile(): FiveEToolsMonster[] {
        const files = ['bestiary-xmm.json', 'bestiary-xphb.json'];
        return files.flatMap((file) => readJsonFile<{ monster?: FiveEToolsMonster[] }>(`${BESTIARY_DIR}/${file}`).monster ?? []);
    }

    protected override buildFilterDocument(monster: FiveEToolsMonster) {
        return { name: monster.name };
    }

    private loadSupplementalData() {
        const fluffFiles = ['fluff-bestiary-xmm.json', 'fluff-bestiary-xphb.json'];
        for (const file of fluffFiles) {
            const data = readJsonFile<{ monsterFluff?: MonsterFluff[] }>(`${BESTIARY_DIR}/${file}`);
            for (const item of data.monsterFluff ?? []) this.fluff.set(this.key(item.name, item.source), item);
        }
        const legendary = readJsonFile<{ legendaryGroup?: LegendaryGroup[] }>(`${BESTIARY_DIR}/legendarygroups.json`);
        for (const item of legendary.legendaryGroup ?? []) this.legendaryGroups.set(this.key(item.name, item.source), item);
    }

    private key(name: string, source: string) {
        return `${name.toLowerCase()}|${source.toLowerCase()}`;
    }

    private resolveFluff(monster: FiveEToolsMonster): MonsterFluff | undefined {
        const direct = this.fluff.get(this.key(monster.name, monster.source));
        if (!direct?._copy) return direct;
        const base = this.fluff.get(this.key(direct._copy.name, direct._copy.source));
        const mod = direct._copy._mod;
        return {
            ...direct,
            entries: [...(mod?.entries?.items ?? []), ...(direct.entries ?? []), ...(base?.entries ?? [])],
            images: [...(mod?.images?.items ?? []), ...(direct.images ?? []), ...(base?.images ?? [])],
        };
    }

    private async translateParams(params: NpcParam[]): Promise<NpcParam[]> {
        const translated: NpcParam[] = [];
        for (const param of params) {
            const { name, description } = await this.translateItem(param.label, param.description);
            translated.push({ ...param, label: name, description });
        }
        return translated;
    }

    async processItem(monster: FiveEToolsMonster): Promise<CreateMonsterInput | null> {
        const fluff = this.resolveFluff(monster);
        const descriptionHtml = buildEntriesHtml(fluff?.entries) || `<p>${monster.name}</p>`;
        const { name, description } = await this.translateItem(monster.name, descriptionHtml);

        const spellcasting = monster.spellcasting ?? [];
        const spellParams = spellcasting.map(spellcastingToParam);
        const actionSpells = spellParams.filter((_, index) => (spellcasting[index].displayAs ?? 'action') === 'action');
        const bonusSpells = spellParams.filter((_, index) => spellcasting[index].displayAs === 'bonus');
        const reactionSpells = spellParams.filter((_, index) => spellcasting[index].displayAs === 'reaction');
        const legendarySpells = spellParams.filter((_, index) => spellcasting[index].displayAs === 'legendary');
        const legendaryGroup = monster.legendaryGroup ? this.legendaryGroups.get(this.key(monster.legendaryGroup.name, monster.legendaryGroup.source)) : undefined;
        const challengeRating = mapChallengeRating(monster.cr);
        const { conditionImmunities, conditionImmunityNotes } = mapConditionImmunities(monster.conditionImmune);
        const speeds = mapSpeed(monster.speed);

        return {
            name,
            originalName: monster.name,
            source: formatSource(monster.source, monster.page),
            description,
            image: buildImageUrl(fluff),
            status: 'active',
            type: mapMonsterType(monster.type),
            size: mapSize(monster.size),
            alignment: mapAlignment(monster.alignment),
            armorClass: mapArmorClass(monster.ac),
            initiative: undefined,
            hitPointsFormula: mapHitPoints(monster.hp),
            ...speeds,
            attributes: {
                strength: monster.str ?? 10,
                dexterity: monster.dex ?? 10,
                constitution: monster.con ?? 10,
                intelligence: monster.int ?? 10,
                wisdom: monster.wis ?? 10,
                charisma: monster.cha ?? 10,
            },
            savingThrows: mapSavingThrows(monster.save),
            skills: mapSkills(monster.skill),
            senses: { passivePerception: monster.passive },
            sensesAndLanguages: await this.translateParams([
                ...(monster.senses?.length ? [{ label: 'Senses', description: `<p>${cleanText(monster.senses.join(', '))}</p>` }] : []),
                { label: 'Passive Perception', description: `<p>${monster.passive ?? 10}</p>` },
                { label: 'Languages', description: `<p>${cleanText(monster.languages?.join(', ') || '—')}</p>` },
            ]),
            challengeRating,
            experience: monster.cr ? getMonsterXp(challengeRating) : 0,
            languages: cleanText(monster.languages?.join(', ') || '—'),
            damageVulnerabilities: mapDamageList(monster.vulnerable),
            damageResistances: mapDamageList(monster.resist),
            damageImmunities: mapDamageList(monster.immune),
            conditionImmunities,
            conditionImmunityNotes,
            traits: await this.translateParams(mapNpcParams(monster.trait)),
            actions: await this.translateParams([...mapNpcParams(monster.action), ...actionSpells]),
            bonusActions: await this.translateParams([...mapNpcParams(monster.bonus), ...bonusSpells]),
            reactions: await this.translateParams([...mapNpcParams(monster.reaction), ...reactionSpells]),
            legendaryActions: await this.translateParams([...mapNpcParams(monster.legendary), ...legendarySpells]),
            legendaryActionUses: monster.legendary?.length || legendarySpells.length ? 3 : undefined,
            lairActions: await this.translateParams(mapLegendaryEntries(legendaryGroup?.lairActions)),
            lairActionInitiative: legendaryGroup?.lairActions?.length ? 20 : undefined,
            regionalEffects: await this.translateParams(mapLegendaryEntries(legendaryGroup?.regionalEffects)),
        };
    }

    async findExisting(monster: CreateMonsterInput): Promise<CreateMonsterInput | null> {
        await dbConnect();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const orClauses: Record<string, unknown>[] = [{ name: new RegExp(`^${escape(monster.name)}$`, 'i') }];
        if (monster.originalName) orClauses.push({ originalName: new RegExp(`^${escape(monster.originalName)}$`, 'i') });
        const doc = await MonsterModel.findOne({ $or: orClauses }).lean();
        if (!doc) return null;
        return doc as unknown as CreateMonsterInput;
    }

    async update(monster: CreateMonsterInput): Promise<void> {
        await dbConnect();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await MonsterModel.findOneAndUpdate(
            { name: new RegExp(`^${escape(monster.name)}$`, 'i') },
            { $set: monster },
            { runValidators: true },
        );
    }

    async create(monster: CreateMonsterInput): Promise<void> {
        await dbConnect();
        await MonsterModel.create(monster);
    }

    override getItemLabel(item: CreateMonsterInput): string {
        return item.name;
    }
}
