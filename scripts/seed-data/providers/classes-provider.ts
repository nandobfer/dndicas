/**
 * @fileoverview ClassesProvider — seeds base character classes from 5etools data.
 *
 * Reads:
 *  - src/lib/5etools-data/classes/class-*.json — class mechanics/features
 *  - src/lib/5etools-data/classes/fluff-class-*.json — lore descriptions/artwork
 * Creates: CharacterClass documents via CharacterClass; Trait documents on demand.
 * Subclasses are stored embedded in the CharacterClass document.
 */

import fs from 'fs';
import path from 'path';
import termKit from 'terminal-kit';
import { BaseProvider, convertFeetToMeters, formatSource } from '../base-provider';
import type { GlossaryEntry } from '../glossary/glossary-store';
import { applyGlossary, loadAllEntries, parseGlossaryInput, saveEntries } from '../glossary/glossary-store';
import dbConnect from '../../../src/core/database/db';
import { applyFuzzySearch } from '../../../src/core/utils/search-engine';
import { CharacterClass } from '../../../src/features/classes/models/character-class';
import type {
    ArmorProficiency,
    ClassTrait,
    ClassProgressionData,
    CreateClassInput,
    HitDiceType,
    ProgressionCustomColumn,
    SpellSlotsTable,
    SkillType,
    Subclass,
    WeaponProficiency,
} from '../../../src/features/classes/types/classes.types';
import { Trait } from '../../../src/features/traits/database/trait';
import type { CreateTraitInput } from '../../../src/features/traits/types/traits.types';
import { Spell } from '../../../src/features/spells/models/spell';
import type { AttributeType } from '../../../src/lib/config/colors';

const term = termKit.terminal;
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// ─── 5etools input types ─────────────────────────────────────────────────────

export interface FiveEToolsEntry {
    type?: string;
    name?: string;
    entries?: (string | FiveEToolsEntry)[];
    items?: (string | FiveEToolsEntry)[];
    entry?: string;
    caption?: string;
    rows?: unknown[][];
    optionalfeature?: string;
    subclassFeature?: string;
    classFeature?: string;
}

interface FiveEToolsClassFeatureRef {
    classFeature?: string;
    gainSubclassFeature?: boolean;
}

interface FiveEToolsSkillChoice {
    choose?: {
        from?: string[];
        count?: number;
    };
}

interface FiveEToolsClassTableGroup {
    title?: string;
    subclasses?: Array<{ name?: string; source?: string }>;
    colLabels?: unknown[];
    rows?: unknown[][];
    rowsSpellProgression?: unknown[][];
}

export interface FiveEToolsClass {
    name: string;
    source: string;
    page?: number;
    hd?: { number?: number; faces?: number };
    proficiency?: string[];
    startingProficiencies?: {
        armor?: string[];
        weapons?: string[];
        skills?: FiveEToolsSkillChoice[];
    };
    multiclassing?: {
        requirements?: Record<string, unknown>;
    };
    casterProgression?: string | null;
    spellcastingAbility?: string | null;
    classTableGroups?: FiveEToolsClassTableGroup[];
    classFeatures?: (string | FiveEToolsClassFeatureRef)[];
    hasFluff?: boolean;
    hasFluffImages?: boolean;
    reprintedAs?: string[];
}

interface FiveEToolsSubclass {
    name: string;
    shortName?: string;
    source: string;
    page?: number | null;
    className: string;
    classSource?: string;
    casterProgression?: string | null;
    spellcastingAbility?: string | null;
    subclassTableGroups?: FiveEToolsClassTableGroup[] | null;
    additionalSpells?: Record<string, unknown>[] | null;
    subclassFeatures?: string[] | null;
    hasFluff?: boolean;
    hasFluffImages?: boolean;
    reprintedAs?: string[];
}

export interface FiveEToolsClassFeature {
    name: string;
    source: string;
    page?: number;
    className: string;
    classSource?: string;
    level: number;
    entries?: (string | FiveEToolsEntry)[];
}

interface FiveEToolsSubclassFeature {
    name: string;
    source: string;
    page?: number;
    className: string;
    classSource?: string;
    subclassShortName: string;
    subclassSource?: string;
    level: number;
    entries?: (string | FiveEToolsEntry)[];
}

interface FluffImageHref {
    type: 'internal' | 'external';
    path?: string;
    url?: string;
}

interface FluffImage {
    type: string;
    href: FluffImageHref;
}

interface FluffClassEntry {
    name: string;
    shortName?: string;
    source: string;
    className?: string;
    classSource?: string;
    entries?: (string | FiveEToolsEntry)[];
    images?: FluffImage[];
}

interface ClassesDataFile {
    class?: FiveEToolsClass[];
    classFeature?: FiveEToolsClassFeature[];
    subclass?: FiveEToolsSubclass[];
    subclassFeature?: FiveEToolsSubclassFeature[];
}

interface ClassesFluffFile {
    classFluff?: FluffClassEntry[];
    subclassFluff?: FluffClassEntry[];
}

interface SpellSourceClassRef {
    name: string;
    source: string;
}

interface SpellSourceEntry {
    class?: SpellSourceClassRef[];
    subclass?: unknown[];
}

type SpellSourcesFile = Record<string, Record<string, SpellSourceEntry>>;

interface RawClassSpellRef {
    _raw: true;
    name: string;
    source: string;
}

interface ResolvedClassSpell {
    id: string;
    name: string;
    circle: number;
}

interface ClassFeatureLookup {
    className: string;
    classSource: string;
    featureName: string;
    featureSource: string;
    level: number;
}

interface SubclassFeatureLookup {
    className: string;
    classSource: string;
    subclassName: string;
    subclassSource: string;
    featureName: string;
    featureSource: string;
    level: number;
}

interface ProcessingClassTrait extends ClassTrait {
    name: string;
    originalName: string;
}

interface PendingClassFeature {
    originalName: string;
    level: number;
    descriptionHtml: string;
}

interface PendingSubclass {
    original: FiveEToolsSubclass;
    features: PendingClassFeature[];
    descriptionHtml?: string;
}

// ─── Mapping tables ──────────────────────────────────────────────────────────

const ATTRIBUTE_MAP: Record<string, AttributeType> = {
    str: 'Força',
    dex: 'Destreza',
    con: 'Constituição',
    int: 'Inteligência',
    wis: 'Sabedoria',
    cha: 'Carisma',
};

const ARMOR_MAP: Record<string, ArmorProficiency | undefined> = {
    light: 'Armaduras Leves',
    medium: 'Armaduras Médias',
    heavy: 'Armaduras Pesadas',
    shield: 'Escudos',
};

const WEAPON_MAP: Record<string, WeaponProficiency | undefined> = {
    simple: 'Armas Simples',
    martial: 'Armas Marciais',
    firearm: 'Armas de Fogo',
    firearms: 'Armas de Fogo',
    'light crossbow': 'Besta Leve',
    'heavy crossbow': 'Besta Pesada',
    crossbow: 'Balestras',
    longbow: 'Arcos',
    shortbow: 'Arcos',
    dagger: 'Adagas',
    longsword: 'Espadas Longas',
    shortsword: 'Espadas Curtas',
};

const SKILL_MAP: Record<string, SkillType | undefined> = {
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
    'animal handling': 'Lidar com Animais',
    medicine: 'Medicina',
    nature: 'Natureza',
    perception: 'Percepção',
    persuasion: 'Persuasão',
    'sleight of hand': 'Prestidigitação',
    religion: 'Religião',
    survival: 'Sobrevivência',
};

const PROGRESSION_LABEL_MAP: Record<string, string> = {
    'Plans Known': 'Planos Conhecidos',
    'Magic Items': 'Itens Mágicos',
    Rages: 'Fúrias',
    'Rage Damage': 'Dano de Fúria',
    'Weapon Mastery': 'Maestria com Armas',
    'Bardic Die': 'Dado de Inspiração',
    'Channel Divinity': 'Canalizar Divindade',
    'Wild Shape': 'Forma Selvagem',
    'Second Wind': 'Retomar o Fôlego',
    'Martial Arts': 'Artes Marciais',
    'Focus Points': 'Pontos de Foco',
    'Unarmored Movement': 'Movimento sem Armadura',
    'Talents Known': 'Talentos Conhecidos',
    'Disciplines Known': 'Disciplinas Conhecidas',
    'Psi Points': 'Pontos de Psi',
    'Psi Limit': 'Limite de Psi',
    'Favored Enemy': 'Inimigo Favorito',
    'Sneak Attack': 'Ataque Furtivo',
    'Sorcery Points': 'Pontos de Feitiçaria',
    Invocations: 'Invocações',
};

const SUBCLASS_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#9CA3AF'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip 5etools inline tag syntax from text before sending to AI. */
export function cleanText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, '$2')
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        .replace(/\{@hit\s+([^}]+)\}/g, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/g, 'CD $1')
        .replace(/\{@[a-z0-9]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
        .trim();
}

export function buildEntryHtml(entry: FiveEToolsEntry | string): string {
    if (typeof entry === 'string') {
        return `<p>${cleanText(entry)}</p>`;
    }

    const parts: string[] = [];

    if (entry.type === 'list' && Array.isArray(entry.items)) {
        const listItems = entry.items
            .map((item) => {
                if (typeof item === 'string') return `<li>${cleanText(item)}</li>`;
                if (item.name && item.entry) return `<li><strong>${cleanText(item.name)}.</strong> ${cleanText(item.entry)}</li>`;
                if (item.entry) return `<li>${cleanText(item.entry)}</li>`;
                if (item.entries) return `<li>${item.entries.map((e) => cleanText(typeof e === 'string' ? e : e.entry ?? e.name ?? '')).filter(Boolean).join(' ')}</li>`;
                return '';
            })
            .filter(Boolean);
        parts.push(`<ul>${listItems.join('')}</ul>`);
    } else if (entry.type === 'options' && Array.isArray(entry.entries)) {
        const items = entry.entries
            .map((option) => {
                if (typeof option === 'string') return `<li>${cleanText(option)}</li>`;
                const label = option.optionalfeature ?? option.classFeature ?? option.subclassFeature ?? option.name ?? option.entry;
                return label ? `<li>${cleanText(label)}</li>` : '';
            })
            .filter(Boolean);
        if (items.length > 0) parts.push(`<ul>${items.join('')}</ul>`);
    } else if (entry.type === 'quote' && Array.isArray(entry.entries)) {
        const quote = entry.entries.map((e) => cleanText(typeof e === 'string' ? e : e.entry ?? '')).filter(Boolean).join(' ');
        if (quote) parts.push(`<blockquote>${quote}</blockquote>`);
    } else if (entry.type === 'table') {
        // Tables are often roll tables or dense progression data; omit them from prose descriptions.
    } else if (entry.entry) {
        parts.push(`<p>${entry.name ? `<strong>${cleanText(entry.name)}.</strong> ` : ''}${cleanText(entry.entry)}</p>`);
    } else if (Array.isArray(entry.entries)) {
        const texts = entry.entries.map(buildEntryHtml).join('');
        if (entry.name) {
            parts.push(`<p><strong>${cleanText(entry.name)}.</strong></p>${texts}`);
        } else {
            parts.push(texts);
        }
    }

    return parts.join('');
}

export function buildDescriptionHtml(entries: (string | FiveEToolsEntry)[] | undefined): string {
    if (!entries || entries.length === 0) return '';
    return entries.map(buildEntryHtml).join('');
}

function collectSubclassFeatureRefs(entries: (string | FiveEToolsEntry)[] | undefined): string[] {
    if (!entries?.length) return [];

    const refs: string[] = [];

    const visit = (entry: FiveEToolsEntry | string): void => {
        if (typeof entry === 'string') return;
        if (entry.subclassFeature) refs.push(entry.subclassFeature);
        for (const child of entry.entries ?? []) visit(child);
        for (const child of entry.items ?? []) visit(child);
    };

    entries.forEach(visit);
    return refs;
}

export function mapAttribute(key: string | undefined): AttributeType | undefined {
    return key ? ATTRIBUTE_MAP[key] : undefined;
}

export function mapHitDice(hd: FiveEToolsClass['hd']): HitDiceType | null {
    if (!hd?.faces) return null;
    const value = `d${hd.faces}`;
    return value === 'd6' || value === 'd8' || value === 'd10' || value === 'd12'
        ? value
        : null;
}

export function mapArmorProficiencies(armor: string[] | undefined): ArmorProficiency[] {
    const mapped = (armor ?? []).map((entry) => ARMOR_MAP[entry]).filter((entry): entry is ArmorProficiency => Boolean(entry));
    return [...new Set(mapped)];
}

export function mapWeaponProficiencies(weapons: string[] | undefined): WeaponProficiency[] {
    const mapped = (weapons ?? []).map((entry) => WEAPON_MAP[entry]).filter((entry): entry is WeaponProficiency => Boolean(entry));
    return [...new Set(mapped)];
}

export function mapSkills(skills: FiveEToolsSkillChoice[] | undefined): { skillCount: number; availableSkills: SkillType[] } {
    const firstChoice = skills?.find((entry) => entry.choose?.from?.length);
    const skillCount = firstChoice?.choose?.count ?? 1;
    const availableSkills = (firstChoice?.choose?.from ?? [])
        .map((skill) => SKILL_MAP[skill])
        .filter((skill): skill is SkillType => Boolean(skill));

    return {
        skillCount,
        availableSkills,
    };
}

export function mapSavingThrows(proficiency: string[] | undefined): AttributeType[] {
    return (proficiency ?? [])
        .map(mapAttribute)
        .filter((attribute): attribute is AttributeType => Boolean(attribute))
        .slice(0, 2);
}

export function mapPrimaryAttributes(
    requirements: FiveEToolsClass['multiclassing'] extends { requirements?: infer R } ? R : Record<string, unknown> | undefined,
    fallback: AttributeType[],
): AttributeType[] {
    const found = new Set<AttributeType>();

    const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        const obj = value as Record<string, unknown>;
        for (const [key, raw] of Object.entries(obj)) {
            if (key === 'or' && Array.isArray(raw)) {
                raw.forEach(visit);
                continue;
            }
            if (typeof raw === 'number') {
                const mapped = mapAttribute(key);
                if (mapped) found.add(mapped);
            }
        }
    };

    visit(requirements);
    return found.size > 0 ? [...found] : fallback;
}

export function buildFluffImageUrl(fluff: FluffClassEntry | undefined): string {
    const img = fluff?.images?.[0];
    if (!img) return '';
    if (img.href.type === 'internal' && img.href.path) return `https://5e.tools/img/${img.href.path}`;
    if (img.href.type === 'external' && img.href.url) return img.href.url;
    return '';
}

export function cleanProgressionLabel(label: unknown): string {
    const raw = typeof label === 'string' ? label : JSON.stringify(label);
    return cleanText(raw).replace(/\s+/g, ' ').trim();
}

export function formatProgressionValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;

    if (typeof value !== 'object') return String(value);

    const entry = value as { type?: string; value?: number; toRoll?: Array<{ number?: number; faces?: number }> };
    if (entry.type === 'dice' && Array.isArray(entry.toRoll)) {
        const dice = entry.toRoll
            .map((die) => `${die.number ?? 1}d${die.faces ?? ''}`)
            .filter((die) => !die.endsWith('d'));
        return dice.length > 0 ? dice.join(' + ') : null;
    }

    if (entry.type === 'bonus' && typeof entry.value === 'number') {
        return `${entry.value >= 0 ? '+' : ''}${entry.value}`;
    }

    if (entry.type === 'bonusSpeed' && typeof entry.value === 'number') {
        if (entry.value === 0) return null;
        return convertFeetToMeters(`+${entry.value} ft`);
    }

    return JSON.stringify(value);
}

function getSpellCircleFromLabel(label: unknown): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null {
    const raw = typeof label === 'string' ? label : '';
    const match = raw.match(/level=(\d)/i);
    if (!match) return null;
    const circle = parseInt(match[1], 10);
    return circle >= 1 && circle <= 9 ? circle as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 : null;
}

function isCantripLabel(label: unknown): boolean {
    const raw = typeof label === 'string' ? label : '';
    return /level=0/i.test(raw) && /cantrips?/i.test(cleanProgressionLabel(label));
}

function isPreparedSpellsLabel(label: unknown): boolean {
    const raw = typeof label === 'string' ? label : '';
    return /level=!0/i.test(raw) && /(prepared spells|spells known)/i.test(cleanProgressionLabel(label));
}

function isSpellSlotsCountLabel(label: unknown): boolean {
    return /^Spell Slots$/i.test(cleanProgressionLabel(label));
}

function isSlotLevelLabel(label: unknown): boolean {
    return /^Slot Level$/i.test(cleanProgressionLabel(label));
}

function isSpellSlotGroup(group: FiveEToolsClassTableGroup): boolean {
    const labels = group.colLabels ?? [];
    return Boolean(group.title?.toLowerCase().includes('spell slots'))
        || (labels.length > 0 && labels.every((label) => getSpellCircleFromLabel(label) !== null));
}

function ensureSpellLevel(spellSlots: SpellSlotsTable, level: number): NonNullable<SpellSlotsTable[number]> {
    const current = spellSlots[level] ?? {};
    spellSlots[level] = current;
    return current;
}

function setSpellCount(spellSlots: SpellSlotsTable, level: number, field: 'cantrips' | 'preparedSpells', value: unknown): void {
    if (typeof value !== 'number' || value < 0) return;
    ensureSpellLevel(spellSlots, level)[field] = value;
}

function setSpellSlot(spellSlots: SpellSlotsTable, level: number, circle: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, value: unknown): void {
    if (typeof value !== 'number' || value <= 0) return;
    const levelData = ensureSpellLevel(spellSlots, level);
    levelData.slots = {
        ...(levelData.slots ?? {}),
        [circle]: value,
    };
}

function hasSpellLevelData(levelData: NonNullable<SpellSlotsTable[number]>): boolean {
    return levelData.cantrips !== undefined
        || levelData.preparedSpells !== undefined
        || Object.keys(levelData.slots ?? {}).length > 0;
}

function normalizeSpellSlots(spellSlots: SpellSlotsTable): SpellSlotsTable | undefined {
    for (const [level, levelData] of Object.entries(spellSlots)) {
        if (!levelData || !hasSpellLevelData(levelData)) delete spellSlots[Number(level)];
    }
    return Object.keys(spellSlots).length > 0 ? spellSlots : undefined;
}

function slugifyProgressionId(label: string): string {
    return label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function translateProgressionLabel(
    label: unknown,
    translateLabel?: (label: string) => Promise<string>,
): Promise<string> {
    const cleaned = cleanProgressionLabel(label);
    const mapped = PROGRESSION_LABEL_MAP[cleaned];
    if (mapped) return mapped;
    if (!translateLabel) return cleaned;
    const translated = await translateLabel(cleaned);
    return translated.trim() || cleaned;
}

export async function buildClassProgressionTable(
    cls: Pick<FiveEToolsClass, 'classTableGroups'> | Pick<FiveEToolsSubclass, 'subclassTableGroups'>,
    translateLabel?: (label: string) => Promise<string>,
): Promise<ClassProgressionData | undefined> {
    const groups: FiveEToolsClassTableGroup[] = 'subclassTableGroups' in cls
        ? cls.subclassTableGroups ?? []
        : (cls as Pick<FiveEToolsClass, 'classTableGroups'>).classTableGroups ?? [];
    if (groups.length === 0) return undefined;

    const spellSlots: SpellSlotsTable = {};
    const customColumns: ProgressionCustomColumn[] = [];
    const usedColumnIds = new Set<string>();

    for (const group of groups) {
        const labels = group.colLabels ?? [];
        const spellRows = group.rowsSpellProgression ?? (isSpellSlotGroup(group) ? group.rows : undefined);

        if (spellRows) {
            spellRows.slice(0, 20).forEach((row: unknown[], rowIndex: number) => {
                const level = rowIndex + 1;
                labels.forEach((label: unknown, colIndex: number) => {
                    const circle = getSpellCircleFromLabel(label);
                    if (circle) setSpellSlot(spellSlots, level, circle, row[colIndex]);
                });
            });
            continue;
        }

        const rows = group.rows ?? [];
        const slotCountIndex = labels.findIndex(isSpellSlotsCountLabel);
        const slotLevelIndex = labels.findIndex(isSlotLevelLabel);

        rows.slice(0, 20).forEach((row: unknown[], rowIndex: number) => {
            const level = rowIndex + 1;

            labels.forEach((label: unknown, colIndex: number) => {
                if (isCantripLabel(label)) {
                    setSpellCount(spellSlots, level, 'cantrips', row[colIndex]);
                } else if (isPreparedSpellsLabel(label)) {
                    setSpellCount(spellSlots, level, 'preparedSpells', row[colIndex]);
                }
            });

            if (slotCountIndex !== -1 && slotLevelIndex !== -1) {
                const circle = typeof row[slotLevelIndex] === 'number' ? row[slotLevelIndex] : null;
                if (circle && circle >= 1 && circle <= 9) {
                    setSpellSlot(spellSlots, level, circle as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, row[slotCountIndex]);
                }
            }
        });

        for (const [colIndex, label] of labels.entries()) {
            if (
                isCantripLabel(label)
                || isPreparedSpellsLabel(label)
                || getSpellCircleFromLabel(label)
                || isSpellSlotsCountLabel(label)
                || isSlotLevelLabel(label)
            ) {
                continue;
            }

            const translatedLabel = await translateProgressionLabel(label, translateLabel);
            const baseId = `5etools-${slugifyProgressionId(translatedLabel || cleanProgressionLabel(label)) || 'coluna'}`;
            let id = baseId;
            let suffix = 2;
            while (usedColumnIds.has(id)) {
                id = `${baseId}-${suffix}`;
                suffix += 1;
            }
            usedColumnIds.add(id);

            customColumns.push({
                id,
                label: translatedLabel,
                values: Array.from({ length: 20 }, (_, rowIndex) => formatProgressionValue(rows[rowIndex]?.[colIndex])),
            });
        }
    }

    const progressionTable: ClassProgressionData = {};
    const normalizedSpellSlots = normalizeSpellSlots(spellSlots);
    if (normalizedSpellSlots) progressionTable.spellSlots = normalizedSpellSlots;
    if (customColumns.length > 0) progressionTable.customColumns = customColumns;

    return progressionTable.spellSlots || progressionTable.customColumns ? progressionTable : undefined;
}

function summarizeProgressionTable(progressionTable: ClassProgressionData): Record<string, string[]> {
    const customColumns = progressionTable.customColumns?.map((column) => column.label) ?? [];
    const spellColumns: string[] = [];
    const spellLevels = Object.values(progressionTable.spellSlots ?? {});

    if (spellLevels.some((level) => level?.cantrips !== undefined)) spellColumns.push('Truques');
    if (spellLevels.some((level) => level?.preparedSpells !== undefined)) spellColumns.push('Preparadas');

    const circles = new Set<number>();
    for (const level of spellLevels) {
        for (const circle of Object.keys(level?.slots ?? {})) {
            circles.add(Number(circle));
        }
    }

    for (const circle of [...circles].sort((a, b) => a - b)) {
        spellColumns.push(`${circle}º`);
    }

    return { customColumns, spellColumns };
}

export function parseClassFeatureRef(
    ref: string | FiveEToolsClassFeatureRef,
    fallbackClassSource: string,
): ClassFeatureLookup | null {
    const raw = typeof ref === 'string' ? ref : ref.classFeature;
    if (!raw) return null;

    const [featureName, className, classSourceRaw, levelRaw] = raw.split('|');
    const level = parseInt(levelRaw, 10);
    if (!featureName || !className || Number.isNaN(level)) return null;

    return {
        featureName,
        className,
        classSource: classSourceRaw || fallbackClassSource,
        featureSource: classSourceRaw || fallbackClassSource,
        level,
    };
}

export function parseSubclassFeatureRef(ref: string, fallbackClassSource: string, fallbackSubclassSource: string): SubclassFeatureLookup | null {
    const [featureName, className, classSourceRaw, subclassName, subclassSourceRaw, levelRaw] = ref.split('|');
    const level = parseInt(levelRaw, 10);
    if (!featureName || !className || !subclassName || Number.isNaN(level)) return null;

    return {
        featureName,
        className,
        classSource: classSourceRaw || fallbackClassSource,
        subclassName,
        subclassSource: subclassSourceRaw || fallbackSubclassSource,
        featureSource: subclassSourceRaw || fallbackSubclassSource,
        level,
    };
}

function buildFeatureKey(feature: FiveEToolsClassFeature): string {
    return [
        feature.name.toLowerCase(),
        feature.className.toLowerCase(),
        (feature.classSource || feature.source).toLowerCase(),
        feature.source.toLowerCase(),
        String(feature.level),
    ].join('|');
}

function buildSubclassFeatureKey(feature: FiveEToolsSubclassFeature): string {
    return [
        feature.name.toLowerCase(),
        feature.className.toLowerCase(),
        (feature.classSource || feature.source).toLowerCase(),
        feature.subclassShortName.toLowerCase(),
        (feature.subclassSource || feature.source).toLowerCase(),
        feature.source.toLowerCase(),
        String(feature.level),
    ].join('|');
}

function buildLookupKey(lookup: ClassFeatureLookup): string {
    return [
        lookup.featureName.toLowerCase(),
        lookup.className.toLowerCase(),
        lookup.classSource.toLowerCase(),
        lookup.featureSource.toLowerCase(),
        String(lookup.level),
    ].join('|');
}

function buildSubclassLookupKey(lookup: SubclassFeatureLookup): string {
    return [
        lookup.featureName.toLowerCase(),
        lookup.className.toLowerCase(),
        lookup.classSource.toLowerCase(),
        lookup.subclassName.toLowerCase(),
        lookup.subclassSource.toLowerCase(),
        lookup.featureSource.toLowerCase(),
        String(lookup.level),
    ].join('|');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildClassKey(name: string | undefined, source: string | undefined): string {
    return `${name ?? ''}|${source ?? ''}`.toLowerCase();
}

function buildSubclassIdentityKey(className: string | undefined, subclassName: string | undefined): string {
    return `${className ?? ''}|${subclassName ?? ''}`.toLowerCase();
}

function buildSubclassRuntimeKey(className: string | undefined, subclassName: string | undefined, source: string | undefined): string {
    return `${className ?? ''}|${subclassName ?? ''}|${source ?? ''}`.toLowerCase();
}

function shouldPreferSubclass(candidate: FiveEToolsSubclass, current: FiveEToolsSubclass): boolean {
    if (candidate.source === 'XPHB' && current.source !== 'XPHB') return true;
    if (candidate.source !== 'XPHB' && current.source === 'XPHB') return false;
    if (candidate.classSource === 'XPHB' && current.classSource !== 'XPHB') return true;
    if (candidate.classSource !== 'XPHB' && current.classSource === 'XPHB') return false;
    if (!candidate.reprintedAs?.length && current.reprintedAs?.length) return true;
    return false;
}

// ─── ClassesProvider ─────────────────────────────────────────────────────────

export class ClassesProvider extends BaseProvider<FiveEToolsClass, CreateClassInput> {
    readonly name = 'Classes';
    readonly dataFilePath = 'src/lib/5etools-data/classes';
    readonly dataKey = 'class';

    private featureData: Map<string, FiveEToolsClassFeature> = new Map();
    private subclassData: Map<string, FiveEToolsSubclass[]> = new Map();
    private subclassFeatureData: Map<string, FiveEToolsSubclassFeature> = new Map();
    private fluffData: Map<string, FluffClassEntry> = new Map();
    private subclassFluffData: Map<string, FluffClassEntry> = new Map();
    private pendingFeaturesByClassKey: Map<string, PendingClassFeature[]> = new Map();
    private pendingSubclassesByClassKey: Map<string, PendingSubclass[]> = new Map();
    private originalClassByClassKey: Map<string, FiveEToolsClass> = new Map();
    private spellSources: SpellSourcesFile | null = null;

    protected override buildFilterDocument(cls: FiveEToolsClass) {
        return {
            name: cls.name,
            aliases: [cls.source],
        };
    }

    override readDataFile(): FiveEToolsClass[] {
        const classesDir = path.resolve(PROJECT_ROOT, this.dataFilePath);
        const files = fs.readdirSync(classesDir).sort();
        const classFiles = files.filter((file) => /^class-.*\.json$/.test(file));
        const fluffFiles = files.filter((file) => /^fluff-class-.*\.json$/.test(file));

        const classes: FiveEToolsClass[] = [];
        const features: FiveEToolsClassFeature[] = [];
        const subclasses: FiveEToolsSubclass[] = [];
        const subclassFeatures: FiveEToolsSubclassFeature[] = [];
        const fluffEntries: FluffClassEntry[] = [];
        const subclassFluffEntries: FluffClassEntry[] = [];

        for (const file of classFiles) {
            const parsed = JSON.parse(fs.readFileSync(path.join(classesDir, file), 'utf-8')) as ClassesDataFile;
            if (Array.isArray(parsed.class)) classes.push(...parsed.class);
            if (Array.isArray(parsed.classFeature)) features.push(...parsed.classFeature);
            if (Array.isArray(parsed.subclass)) subclasses.push(...parsed.subclass);
            if (Array.isArray(parsed.subclassFeature)) subclassFeatures.push(...parsed.subclassFeature);
        }

        for (const file of fluffFiles) {
            const parsed = JSON.parse(fs.readFileSync(path.join(classesDir, file), 'utf-8')) as ClassesFluffFile;
            if (Array.isArray(parsed.classFluff)) fluffEntries.push(...parsed.classFluff);
            if (Array.isArray(parsed.subclassFluff)) subclassFluffEntries.push(...parsed.subclassFluff);
        }

        this.featureData = new Map(features.map((feature) => [buildFeatureKey(feature), feature]));
        this.subclassFeatureData = new Map(subclassFeatures.map((feature) => [buildSubclassFeatureKey(feature), feature]));
        this.fluffData = new Map(fluffEntries.map((fluff) => [`${fluff.name}|${fluff.source}`, fluff]));
        this.subclassFluffData = new Map(subclassFluffEntries.flatMap((fluff) => {
            const keys = new Set<string>([
                buildSubclassRuntimeKey(fluff.className, fluff.shortName ?? fluff.name, fluff.source),
                buildSubclassRuntimeKey(fluff.className, fluff.name, fluff.source),
            ]);
            return [...keys].map((key) => [key, fluff] as const);
        }));
        this.subclassData = this.groupImportableSubclasses(subclasses);

        this.log(`Loaded ${classFiles.length} class data files`, 'dim');
        this.log(`Loaded ${classes.length} class entries`, 'dim');
        this.log(`Loaded ${this.featureData.size} class features`, 'dim');
        this.log(`Loaded ${this.subclassFeatureData.size} subclass features`, 'dim');
        this.log(`Loaded ${[...this.subclassData.values()].reduce((total, items) => total + items.length, 0)} subclass entries`, 'dim');
        this.log(`Loaded ${this.fluffData.size} class fluff entries`, 'dim');
        this.log(`Loaded ${this.subclassFluffData.size} subclass fluff entries`, 'dim');

        return classes;
    }

    private groupImportableSubclasses(subclasses: FiveEToolsSubclass[]): Map<string, FiveEToolsSubclass[]> {
        const preferredByIdentity = new Map<string, FiveEToolsSubclass>();

        for (const subclass of subclasses) {
            if (!subclass.subclassFeatures?.length) continue;
            const identityKey = buildSubclassIdentityKey(subclass.className, subclass.shortName ?? subclass.name);
            const current = preferredByIdentity.get(identityKey);
            if (!current || shouldPreferSubclass(subclass, current)) {
                preferredByIdentity.set(identityKey, subclass);
            }
        }

        const grouped = new Map<string, FiveEToolsSubclass[]>();
        for (const subclass of preferredByIdentity.values()) {
            const classKey = buildClassKey(subclass.className, subclass.classSource ?? '');
            const items = grouped.get(classKey) ?? [];
            items.push(subclass);
            grouped.set(classKey, items);
        }

        for (const items of grouped.values()) {
            items.sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name));
        }

        return grouped;
    }

    private getFluff(name: string, source: string): FluffClassEntry | undefined {
        return this.fluffData.get(`${name}|${source}`);
    }

    private getSubclassFluff(subclass: FiveEToolsSubclass): FluffClassEntry | undefined {
        return this.subclassFluffData.get(buildSubclassRuntimeKey(subclass.className, subclass.shortName ?? subclass.name, subclass.source))
            ?? this.subclassFluffData.get(buildSubclassRuntimeKey(subclass.className, subclass.name, subclass.source));
    }

    private getFeature(lookup: ClassFeatureLookup): FiveEToolsClassFeature | undefined {
        return this.featureData.get(buildLookupKey(lookup));
    }

    private getSubclassFeature(lookup: SubclassFeatureLookup): FiveEToolsSubclassFeature | undefined {
        return this.subclassFeatureData.get(buildSubclassLookupKey(lookup));
    }

    private getSubclassIntroFeatureName(subclass: FiveEToolsSubclass): string {
        return (subclass.shortName ?? subclass.name).trim().toLowerCase();
    }

    private getSubclassDescriptionHtml(pending: PendingSubclass): string {
        const fluff = this.getSubclassFluff(pending.original);
        const fluffDescriptionHtml = buildDescriptionHtml(fluff?.entries);
        return fluffDescriptionHtml || pending.descriptionHtml || '';
    }

    private shouldInlineSubclassFeatureRef(
        parent: FiveEToolsSubclassFeature,
        candidate: FiveEToolsSubclassFeature,
        introFeatureName: string,
    ): boolean {
        if (parent.name.trim().toLowerCase() === introFeatureName) return false;

        return parent.level === candidate.level
            && parent.className === candidate.className
            && (parent.classSource || parent.source) === (candidate.classSource || candidate.source)
            && parent.subclassShortName === candidate.subclassShortName
            && (parent.subclassSource || parent.source) === (candidate.subclassSource || candidate.source);
    }

    private buildExpandedSubclassFeatureDescription(
        feature: FiveEToolsSubclassFeature,
        cls: FiveEToolsClass,
        subclass: FiveEToolsSubclass,
        introFeatureName: string,
        seenFeatureKeys: Set<string>,
        inlineSeen: Set<string> = new Set(),
    ): string {
        const featureKey = buildSubclassFeatureKey(feature);
        if (inlineSeen.has(featureKey)) return '';

        const nextInlineSeen = new Set(inlineSeen);
        nextInlineSeen.add(featureKey);

        const featureDescription = buildDescriptionHtml(feature.entries);
        if (!featureDescription) return '';

        const parts = [featureDescription];

        for (const nestedRef of collectSubclassFeatureRefs(feature.entries)) {
            const nestedLookup = parseSubclassFeatureRef(
                nestedRef,
                feature.classSource || subclass.classSource || cls.source,
                feature.subclassSource || subclass.source,
            );
            if (!nestedLookup) continue;

            const nestedFeature = this.getSubclassFeature(nestedLookup);
            if (!nestedFeature?.entries?.length) continue;

            const nestedKey = buildSubclassFeatureKey(nestedFeature);
            if (nextInlineSeen.has(nestedKey) || seenFeatureKeys.has(nestedKey)) continue;
            if (!this.shouldInlineSubclassFeatureRef(feature, nestedFeature, introFeatureName)) continue;

            const nestedDescription = this.buildExpandedSubclassFeatureDescription(
                nestedFeature,
                cls,
                subclass,
                introFeatureName,
                seenFeatureKeys,
                nextInlineSeen,
            );
            if (!nestedDescription) continue;

            seenFeatureKeys.add(nestedKey);
            parts.push(`<p><strong>${cleanText(nestedFeature.name)}.</strong></p>${nestedDescription}`);
        }

        return parts.join('');
    }

    private getSubclassesForClass(cls: FiveEToolsClass): FiveEToolsSubclass[] {
        const candidates = new Map<string, FiveEToolsSubclass>();
        for (const [key, subclasses] of this.subclassData.entries()) {
            if (!key.startsWith(`${cls.name.toLowerCase()}|`)) continue;
            for (const subclass of subclasses) {
                const identityKey = buildSubclassIdentityKey(subclass.className, subclass.shortName ?? subclass.name);
                const current = candidates.get(identityKey);
                if (!current || shouldPreferSubclass(subclass, current)) {
                    candidates.set(identityKey, subclass);
                }
            }
        }

        return [...candidates.values()].sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name));
    }

    private getClassPendingKeys(cls: Pick<CreateClassInput, 'name' | 'originalName' | 'source'>): string[] {
        const names = [cls.originalName, cls.name].filter((name): name is string => Boolean(name));
        const sources = [cls.source, ''].filter((source): source is string => source !== undefined);
        const keys = new Set<string>();

        for (const name of names) {
            for (const source of sources) {
                keys.add(buildClassKey(name, source));
            }
        }

        return [...keys];
    }

    private storePendingFeatures(cls: Pick<CreateClassInput, 'name' | 'originalName' | 'source'>, pendingFeatures: PendingClassFeature[]): void {
        for (const key of this.getClassPendingKeys(cls)) {
            this.pendingFeaturesByClassKey.set(key, pendingFeatures);
        }
    }

    private storePendingSubclasses(cls: Pick<CreateClassInput, 'name' | 'originalName' | 'source'>, pendingSubclasses: PendingSubclass[]): void {
        for (const key of this.getClassPendingKeys(cls)) {
            this.pendingSubclassesByClassKey.set(key, pendingSubclasses);
        }
    }

    private storeOriginalClass(cls: Pick<CreateClassInput, 'name' | 'originalName' | 'source'>, originalClass: FiveEToolsClass): void {
        for (const key of this.getClassPendingKeys(cls)) {
            this.originalClassByClassKey.set(key, originalClass);
        }
    }

    async processItem(cls: FiveEToolsClass): Promise<CreateClassInput | null> {
        if (cls.reprintedAs && cls.reprintedAs.length > 0) {
            this.log(`Skipping reprinted class: ${cls.name} (${cls.source}) → ${cls.reprintedAs[0]}`, 'dim');
            return null;
        }

        const hitDice = mapHitDice(cls.hd);
        const savingThrows = mapSavingThrows(cls.proficiency);

        if (!hitDice || savingThrows.length !== 2) {
            this.log(`Skipping class with missing required mechanics: ${cls.name} (${cls.source})`, 'warn');
            return null;
        }

        const fluff = this.getFluff(cls.name, cls.source);
        const descriptionHtml = buildDescriptionHtml(fluff?.entries);
        const { name, description } = await this.translateItem(cls.name, descriptionHtml || `<p>${cls.name}</p>`);

        const pendingClassFeatures: PendingClassFeature[] = [];
        for (const ref of cls.classFeatures ?? []) {
            const lookup = parseClassFeatureRef(ref, cls.source);
            if (!lookup) continue;
            const feature = this.getFeature(lookup);
            if (!feature?.entries?.length) continue;

            const featureDescription = buildDescriptionHtml(feature.entries);
            if (!featureDescription) continue;

            pendingClassFeatures.push({
                level: feature.level,
                originalName: feature.name,
                descriptionHtml: featureDescription,
            });
        }

        const { skillCount, availableSkills } = mapSkills(cls.startingProficiencies?.skills);
        const source = formatSource(cls.source, cls.page);
        const progressionTable = await buildClassProgressionTable(
            cls,
            async (label) => {
                const translated = await this.translateItem(label, `<p>${label}</p>`);
                return translated.name;
            },
        );
        const pendingSubclasses = await this.buildPendingSubclasses(cls);

        this.storePendingFeatures({ name, originalName: cls.name, source }, pendingClassFeatures);
        this.storePendingSubclasses({ name, originalName: cls.name, source }, pendingSubclasses);
        this.storeOriginalClass({ name, originalName: cls.name, source }, cls);

        return {
            name,
            originalName: cls.name,
            image: buildFluffImageUrl(fluff),
            description: convertFeetToMeters(description),
            source,
            status: 'active',
            hitDice,
            primaryAttributes: mapPrimaryAttributes(cls.multiclassing?.requirements, savingThrows),
            savingThrows,
            armorProficiencies: mapArmorProficiencies(cls.startingProficiencies?.armor),
            weaponProficiencies: mapWeaponProficiencies(cls.startingProficiencies?.weapons),
            skillCount,
            availableSkills,
            spellcasting: Boolean(cls.casterProgression || cls.spellcastingAbility),
            spellcastingAttribute: mapAttribute(cls.spellcastingAbility ?? undefined),
            spells: [],
            subclasses: [],
            traits: [],
            progressionTable,
        };
    }

    private async buildPendingSubclasses(cls: FiveEToolsClass): Promise<PendingSubclass[]> {
        const pendingSubclasses: PendingSubclass[] = [];
        const subclasses = this.getSubclassesForClass(cls);

        for (const subclass of subclasses) {
            const features: PendingClassFeature[] = [];
            const introFeatureName = this.getSubclassIntroFeatureName(subclass);
            let descriptionHtml: string | undefined;
            const seenFeatureKeys = new Set<string>();

            const addPendingFeature = (feature: FiveEToolsSubclassFeature): void => {
                const featureKey = buildSubclassFeatureKey(feature);
                if (seenFeatureKeys.has(featureKey)) return;

                const featureDescription = this.buildExpandedSubclassFeatureDescription(
                    feature,
                    cls,
                    subclass,
                    introFeatureName,
                    seenFeatureKeys,
                );
                if (!featureDescription) return;

                seenFeatureKeys.add(featureKey);

                features.push({
                    level: feature.level,
                    originalName: feature.name,
                    descriptionHtml: featureDescription,
                });
            };

            for (const ref of subclass.subclassFeatures ?? []) {
                const lookup = parseSubclassFeatureRef(ref, subclass.classSource ?? cls.source, subclass.source);
                if (!lookup) continue;
                const feature = this.getSubclassFeature(lookup);
                if (!feature?.entries?.length) continue;

                const featureDescription = buildDescriptionHtml(feature.entries);
                if (!featureDescription) continue;

                if (feature.name.trim().toLowerCase() === introFeatureName) {
                    descriptionHtml = featureDescription;
                    for (const nestedRef of collectSubclassFeatureRefs(feature.entries)) {
                        const nestedLookup = parseSubclassFeatureRef(
                            nestedRef,
                            feature.classSource || subclass.classSource || cls.source,
                            feature.subclassSource || subclass.source,
                        );
                        if (!nestedLookup) continue;
                        const nestedFeature = this.getSubclassFeature(nestedLookup);
                        if (!nestedFeature?.entries?.length) continue;
                        addPendingFeature(nestedFeature);
                    }
                    continue;
                }

                addPendingFeature(feature);
            }

            pendingSubclasses.push({
                original: subclass,
                features,
                descriptionHtml,
            });
        }

        return pendingSubclasses;
    }

    protected override getReviewDisplayOutput(output: unknown): unknown {
        const cls = output as Partial<CreateClassInput>;
        if (!cls || typeof cls !== 'object') return output;

        const display = {
            ...cls,
            subclasses: cls.subclasses?.map((subclass) => {
                const { spells: _spells, ...rest } = subclass;
                void _spells;
                return {
                    ...rest,
                    progressionTable: subclass.progressionTable
                        ? summarizeProgressionTable(subclass.progressionTable) as unknown as ClassProgressionData
                        : subclass.progressionTable,
                };
            }),
            progressionTable: cls.progressionTable
                ? summarizeProgressionTable(cls.progressionTable) as unknown as ClassProgressionData
                : cls.progressionTable,
        };
        delete (display as { spells?: unknown }).spells;
        return display;
    }

    protected override getComparableOutput(output: CreateClassInput): CreateClassInput {
        const comparable = this.stripSpellsForClassOutput(output);
        if (this.hasPendingFeatures(output)) {
            comparable.traits = [];
        }
        if (this.hasPendingSubclasses(output)) {
            comparable.subclasses = [];
        }
        return comparable;
    }

    protected override async afterReview(
        output: CreateClassInput,
        isDryRun: boolean,
    ): Promise<CreateClassInput> {
        if (isDryRun) return output;

        await dbConnect();
        const existing = await this.findExistingForProcessing(output);
        const current = existing ? this.mergeExistingClassState(existing, output) : output;
        return this.runPostReviewResolutionMenu(current, this.getOriginalClassForOutput(output));
    }

    private async resolvePendingFeaturesForClass(output: CreateClassInput): Promise<CreateClassInput> {
        const pendingFeatures = this.getPendingFeatures(output);
        let traits = [...(output.traits ?? [])];
        const pendingTotal = pendingFeatures.length;

        if (pendingTotal === 0) return output;

        term.bold('\n─── Resolvendo Habilidades de Classe ───────────────────────\n');

        for (const [index, feature] of pendingFeatures.entries()) {
            term.cyan('\n  Traduzindo feature ');
            term.bold(`${index + 1}/${pendingTotal}`);
            term(`: ${feature.originalName} (nível ${feature.level})\n`);

            const { name, description } = await this.translateItem(
                feature.originalName,
                feature.descriptionHtml,
            );

            const trait = {
                level: feature.level,
                description: convertFeetToMeters(description),
                name,
                originalName: feature.originalName,
            } as ProcessingClassTrait;

            const resolvedTrait = await this.resolveTrait(
                trait,
                output.name,
                output.source ?? '',
                feature,
            );
            if (!resolvedTrait) continue;

            traits = [...traits, resolvedTrait];
            await this.update({ ...output, traits });
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return { ...output, traits };
    }

    private async resolvePendingSubclassesForClass(output: CreateClassInput): Promise<CreateClassInput> {
        const pendingSubclasses = this.getPendingSubclasses(output);
        if (pendingSubclasses.length === 0) return output;

        term.bold('\n─── Resolvendo Subclasses ──────────────────────────────────\n');
        let current: CreateClassInput = { ...output, subclasses: [...(output.subclasses ?? [])] };

        for (const [index, pending] of pendingSubclasses.entries()) {
            const originalName = pending.original.shortName ?? pending.original.name;
            term.cyan('\n  Subclasse ');
            term.bold(`${index + 1}/${pendingSubclasses.length}`);
            term(`: ${originalName} (${pending.original.source})\n`);

            const reviewedSubclass = await this.reviewSubclassBeforePersist(
                await this.buildSubclassForReview(pending, index),
                pending.original,
                pending.descriptionHtml,
            );
            if (!reviewedSubclass) {
                term.yellow('  ⏭  Subclasse pulada.\n');
                continue;
            }

            current = this.upsertSubclass(current, reviewedSubclass);
            await this.update(current);
            current = await this.resolvePendingFeaturesForSubclass(current, reviewedSubclass.name, pending);
            current = await this.resolveSubclassSpellsForClass(current, reviewedSubclass.name, pending.original);
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return current;
    }

    private async buildSubclassForReview(pending: PendingSubclass, index: number): Promise<Subclass> {
        const subclass = pending.original;
        const fluff = this.getSubclassFluff(subclass);
        const descriptionHtml = this.getSubclassDescriptionHtml(pending);
        const originalName = subclass.shortName ?? subclass.name;
        const { name, description } = await this.translateItem(originalName, descriptionHtml || `<p>${originalName}</p>`);
        const progressionTable = await buildClassProgressionTable(
            { subclassTableGroups: subclass.subclassTableGroups },
            async (label) => {
                const translated = await this.translateItem(label, `<p>${label}</p>`);
                return translated.name;
            },
        );

        return this.applySubclassSpellcastingState({
            name,
            source: formatSource(subclass.source, subclass.page ?? undefined),
            image: buildFluffImageUrl(fluff),
            description: convertFeetToMeters(description),
            color: SUBCLASS_COLORS[index % SUBCLASS_COLORS.length],
            spellcasting: Boolean(subclass.casterProgression || subclass.spellcastingAbility),
            spellcastingAttribute: mapAttribute(subclass.spellcastingAbility ?? undefined),
            spells: [],
            traits: [],
            progressionTable,
        });
    }

    private async reviewSubclassBeforePersist(
        proposedSubclass: Subclass,
        originalSubclass: FiveEToolsSubclass,
        originalDescriptionHtml?: string,
    ): Promise<Subclass | null> {
        let entries = await loadAllEntries();
        let current = this.applyGlossaryToSubclass(proposedSubclass, entries);

        while (true) {
            this.renderReviewState(current, {
                name: originalSubclass.shortName ?? originalSubclass.name,
                source: originalSubclass.source,
                className: originalSubclass.className,
                description: this.getSubclassDescriptionHtml({
                    original: originalSubclass,
                    features: [],
                    descriptionHtml: originalDescriptionHtml,
                }),
            });
            term.cyan('Glossário ');
            term.gray('(formato: "termo > tradução ; outro > outro" — vazio para confirmar, ESC para pular subclasse)');
            term.cyan(': ');

            const input = await new Promise<string | null>((resolve) => {
                term.inputField({ cancelable: true }, (_, value) => {
                    term('\n');
                    resolve(value === undefined ? null : value.trim());
                });
            });

            if (input === null) return null;
            if (!input) return current;

            const { entries: newEntries, errors } = parseGlossaryInput(input);
            if (errors.length > 0) {
                for (const err of errors) term.red(`  ✗ ${err}\n`);
                term.yellow('  Por favor, corrija o formato e tente novamente.\n');
                continue;
            }
            if (newEntries.length === 0) {
                term.yellow('  Nenhuma entrada reconhecida. Tente novamente.\n');
                continue;
            }

            await saveEntries(newEntries);
            term.green(`  ✓ ${newEntries.length} entrada(s) salva(s) no glossário.\n`);
            entries = await loadAllEntries();
            current = this.applyGlossaryToSubclass(proposedSubclass, entries);
        }
    }

    private async resolvePendingFeaturesForSubclass(
        output: CreateClassInput,
        subclassName: string,
        pending: PendingSubclass,
    ): Promise<CreateClassInput> {
        if (pending.features.length === 0) return output;

        term.bold('\n─── Resolvendo Habilidades de Subclasse ────────────────────\n');
        let current = output;
        let subclass = this.findSubclass(current, subclassName);
        if (!subclass) return output;
        let traits = [...(subclass.traits ?? [])];

        for (const [index, feature] of pending.features.entries()) {
            term.cyan('\n  Traduzindo feature ');
            term.bold(`${index + 1}/${pending.features.length}`);
            term(`: ${feature.originalName} (nível ${feature.level})\n`);

            const { name, description } = await this.translateItem(feature.originalName, feature.descriptionHtml);
            const resolvedTrait = await this.resolveTrait({
                level: feature.level,
                description: convertFeetToMeters(description),
                name,
                originalName: feature.originalName,
            } as ProcessingClassTrait, subclass.name, subclass.source ?? '', feature);
            if (!resolvedTrait) continue;

            traits = [...traits, resolvedTrait];
            subclass = { ...subclass, traits };
            current = this.upsertSubclass(current, subclass);
            await this.update(current);
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return current;
    }

    protected override shouldPersistBeforeAfterReview(): boolean {
        return true;
    }

    protected override shouldReviewExistingEqualAfterBaseReview(): boolean {
        return true;
    }

    private async runPostReviewResolutionMenu(output: CreateClassInput, originalItem: FiveEToolsClass): Promise<CreateClassInput> {
        let current = output;

        while (true) {
            const menuItems = [
                'Resolver features da classe',
                'Resolver spells da classe',
                'Resolver subclasses da classe',
                'Resolver tudo',
                'Próxima classe',
            ];

            term.cyan('\n  O que deseja resolver agora? ');
            const choice = await new Promise<number>((resolve) => {
                term.singleColumnMenu(menuItems, (_, response) => {
                    resolve(response.selectedIndex);
                });
            });

            if (choice === 4) {
                term.yellow('  ⏭  Indo para a próxima classe.\n');
                return current;
            }

            if (choice === 0 || choice === 3) {
                current = await this.resolvePendingFeaturesForClass(current);
            }

            if (choice === 1 || choice === 3) {
                current = await this.resolveClassSpellsForClass(current, originalItem);
            }

            if (choice === 2 || choice === 3) {
                current = await this.resolvePendingSubclassesForClass(current);
            }
        }
    }

    protected override async handleExistingEqual(
        existing: CreateClassInput,
        incoming: CreateClassInput,
        originalItem: FiveEToolsClass,
    ): Promise<'updated' | 'skipped' | 'exists'> {
        const menuItems = [
            'Resolver features da classe',
            'Resolver spells da classe',
            'Resolver subclasses da classe',
            'Resolver features e spells da classe',
            'Resolver tudo',
            'Pular classe',
        ];

        term.yellow('  ⚠  Já existe no banco e está igual.\n');
        term.cyan('  O que deseja fazer? ');
        const choice = await new Promise<number>((resolve) => {
            term.singleColumnMenu(menuItems, (_, response) => {
                resolve(response.selectedIndex);
            });
        });

        if (choice === 5) {
            term.yellow('  ⏭  Classe pulada.\n');
            return 'exists';
        }

        let current = await this.findExistingForProcessing(incoming) ?? existing;
        let changed = false;

        if (choice === 0 || choice === 3 || choice === 4) {
            const beforeTraits = JSON.stringify(current.traits ?? []);
            current = await this.resolvePendingFeaturesForClass(current);
            changed = changed || JSON.stringify(current.traits ?? []) !== beforeTraits;
        }

        if (choice === 1 || choice === 3 || choice === 4) {
            const beforeSpells = JSON.stringify(current.spells ?? []);
            current = await this.resolveClassSpellsForClass(current, originalItem);
            changed = changed || JSON.stringify(current.spells ?? []) !== beforeSpells;
        }

        if (choice === 2 || choice === 4) {
            const beforeSubclasses = JSON.stringify(current.subclasses ?? []);
            current = await this.resolvePendingSubclassesForClass(current);
            changed = changed || JSON.stringify(current.subclasses ?? []) !== beforeSubclasses;
        }

        return changed ? 'updated' : 'exists';
    }

    private getOriginalClassForOutput(output: CreateClassInput): FiveEToolsClass {
        for (const key of this.getClassPendingKeys(output)) {
            const original = this.originalClassByClassKey.get(key);
            if (original) return original;
        }

        return {
            name: output.originalName ?? output.name,
            source: output.source ?? '',
        };
    }

    private getSpellSources(): SpellSourcesFile {
        if (this.spellSources) return this.spellSources;
        const filePath = path.resolve(PROJECT_ROOT, 'src/lib/5etools-data/spell-sources.json');
        this.spellSources = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SpellSourcesFile;
        return this.spellSources;
    }

    private buildClassSpellRefs(cls: FiveEToolsClass): RawClassSpellRef[] {
        const spellSources = this.getSpellSources();
        const refs: RawClassSpellRef[] = [];
        const seen = new Set<string>();

        for (const [source, spells] of Object.entries(spellSources)) {
            for (const [spellName, entry] of Object.entries(spells)) {
                const matchesClass = (entry.class ?? []).some(
                    (classRef) => classRef.name === cls.name && classRef.source === cls.source,
                );
                if (!matchesClass) continue;

                const key = `${spellName}|${source}`.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                refs.push({ _raw: true, name: spellName, source });
            }
        }

        return refs.sort((a, b) => a.name.localeCompare(b.name));
    }

    private normalizeSpellRefKey(name: string): string {
        return name.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    private pushSpellRef(refs: RawClassSpellRef[], seen: Set<string>, name: string, source: string): void {
        const normalizedName = this.normalizeSpellRefKey(name);
        if (!normalizedName) return;

        if (seen.has(normalizedName)) return;
        seen.add(normalizedName);
        refs.push({
            _raw: true,
            name: name.trim(),
            source: source.trim(),
        });
    }

    private buildAdditionalSpellRef(rawValue: string, defaultSource: string): RawClassSpellRef | null {
        const [rawName, rawSource] = rawValue.split('|');
        const name = rawName?.trim();
        if (!name) return null;

        const source = rawSource?.trim() || defaultSource;
        return {
            _raw: true,
            name,
            source,
        };
    }

    private collectAdditionalSpellRefs(
        value: unknown,
        defaultSource: string,
        refs: RawClassSpellRef[],
        seen: Set<string>,
    ): void {
        if (typeof value === 'string') {
            const ref = this.buildAdditionalSpellRef(value, defaultSource);
            if (!ref) return;
            this.pushSpellRef(refs, seen, ref.name, ref.source);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => this.collectAdditionalSpellRefs(item, defaultSource, refs, seen));
            return;
        }

        if (!value || typeof value !== 'object') return;

        for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            if (key === 'name' || key === 'all' || key === 'choose' || key === 'from') continue;
            this.collectAdditionalSpellRefs(nestedValue, defaultSource, refs, seen);
        }
    }

    private buildSubclassSpellRefsFromAdditionalSpells(subclass: FiveEToolsSubclass): RawClassSpellRef[] {
        const refs: RawClassSpellRef[] = [];
        const seen = new Set<string>();

        for (const block of subclass.additionalSpells ?? []) {
            this.collectAdditionalSpellRefs(block, subclass.source, refs, seen);
        }

        return refs;
    }

    private buildSubclassSpellRefsFromSpellSources(subclass: FiveEToolsSubclass): RawClassSpellRef[] {
        const spellSources = this.getSpellSources();
        const refs: RawClassSpellRef[] = [];
        const seen = new Set<string>();
        const subclassNames = new Set([subclass.name, subclass.shortName].filter((name): name is string => Boolean(name)));

        for (const [source, spells] of Object.entries(spellSources)) {
            for (const [spellName, entry] of Object.entries(spells)) {
                const matchesSubclass = (entry.subclass ?? []).some((rawRef) => {
                    if (!rawRef || typeof rawRef !== 'object') return false;
                    const ref = rawRef as {
                        name?: unknown;
                        source?: unknown;
                        className?: unknown;
                        classSource?: unknown;
                        subclass?: { name?: unknown; source?: unknown };
                        class?: { name?: unknown; source?: unknown };
                    };
                    const refName = typeof ref.name === 'string'
                        ? ref.name
                        : typeof ref.subclass?.name === 'string'
                            ? ref.subclass.name
                            : undefined;
                    const refSource = typeof ref.source === 'string'
                        ? ref.source
                        : typeof ref.subclass?.source === 'string'
                            ? ref.subclass.source
                            : undefined;
                    const refClassName = typeof ref.className === 'string'
                        ? ref.className
                        : typeof ref.class?.name === 'string'
                            ? ref.class.name
                            : undefined;

                    return Boolean(refName && subclassNames.has(refName))
                        && (!refSource || refSource === subclass.source)
                        && (!refClassName || refClassName === subclass.className);
                });
                if (!matchesSubclass) continue;

                this.pushSpellRef(refs, seen, spellName, source);
            }
        }

        return refs;
    }

    private buildSubclassSpellRefs(subclass: FiveEToolsSubclass): RawClassSpellRef[] {
        const refs: RawClassSpellRef[] = [];
        const seen = new Set<string>();

        for (const ref of this.buildSubclassSpellRefsFromAdditionalSpells(subclass)) {
            this.pushSpellRef(refs, seen, ref.name, ref.source);
        }

        for (const ref of this.buildSubclassSpellRefsFromSpellSources(subclass)) {
            this.pushSpellRef(refs, seen, ref.name, ref.source);
        }

        return refs.sort((a, b) => a.name.localeCompare(b.name));
    }

    private async resolveClassSpellsForClass(output: CreateClassInput, originalClass: FiveEToolsClass): Promise<CreateClassInput> {
        const refs = this.buildClassSpellRefs(originalClass);
        if (refs.length === 0) {
            term.yellow('  ⚠  Nenhuma magia encontrada em spell-sources.json para esta classe.\n');
            return output;
        }

        const resolvedSpells = await this.resolveClassSpells(refs);
        const mergedSpells = this.mergeClassSpells(output.spells ?? [], resolvedSpells);
        const updated = { ...output, spells: mergedSpells };

        await this.update(updated);
        term.green(`  ✓ Magias da classe atualizadas (${mergedSpells.length}).\n`);
        return updated;
    }

    private async resolveSubclassSpellsForClass(
        output: CreateClassInput,
        subclassName: string,
        originalSubclass: FiveEToolsSubclass,
    ): Promise<CreateClassInput> {
        const refs = this.buildSubclassSpellRefs(originalSubclass);
        if (refs.length === 0) {
            term.yellow('  ⚠  Nenhuma magia encontrada nos dados desta subclasse.\n');
            return output;
        }

        const subclass = this.findSubclass(output, subclassName);
        if (!subclass) return output;

        const resolvedSpells = await this.resolveClassSpells(refs);
        const mergedSpells = this.mergeClassSpells(subclass.spells ?? [], resolvedSpells);
        const updatedSubclass = this.applySubclassSpellcastingState({ ...subclass, spells: mergedSpells });
        const updated = this.upsertSubclass(output, updatedSubclass);

        await this.update(updated);
        term.green(`  ✓ Magias da subclasse atualizadas (${mergedSpells.length}).\n`);
        return updated;
    }

    private mergeClassSpells(existingSpells: unknown[], resolvedSpells: ResolvedClassSpell[]): ResolvedClassSpell[] {
        const merged = new Map<string, ResolvedClassSpell>();

        for (const spell of existingSpells) {
            if (!spell || typeof spell !== 'object') continue;
            const value = spell as { id?: unknown; _id?: unknown; name?: unknown; circle?: unknown };
            const id = value.id ?? value._id;
            if (!id || typeof value.name !== 'string' || typeof value.circle !== 'number') continue;
            merged.set(String(id), {
                id: String(id),
                name: value.name,
                circle: value.circle,
            });
        }

        for (const spell of resolvedSpells) {
            merged.set(spell.id, spell);
        }

        return [...merged.values()].sort((a, b) => a.circle - b.circle || a.name.localeCompare(b.name));
    }

    private async resolveClassSpells(spells: RawClassSpellRef[]): Promise<ResolvedClassSpell[]> {
        if (spells.length === 0) return [];

        term.bold('\n─── Resolvendo Magias de Classe ────────────────────────────\n');

        const resolved: ResolvedClassSpell[] = [];

        for (const [index, spell] of spells.entries()) {
            term.cyan('\n  Magia ');
            term.bold(`${index + 1}/${spells.length}`);
            term(`: ${spell.name} (${spell.source})\n`);

            const rawCandidates = await Spell.find({
                $or: [
                    { originalName: { $regex: new RegExp(escapeRegex(spell.name), 'i') } },
                    { name: { $regex: new RegExp(escapeRegex(spell.name), 'i') } },
                ],
            }).limit(100).lean();

            const seen = new Set<string>();
            const results = rawCandidates.filter((candidate) => {
                const id = String(candidate._id);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });

            if (results.length === 0) {
                term.yellow(`  ⚠  Magia "${spell.name}" não encontrada no banco. Execute o provider de spells antes.\n`);
                continue;
            }

            const ranked = applyFuzzySearch(results, spell.name, 5);
            const topResults = ranked.length > 0 ? ranked : results.slice(0, 5);
            let picked = topResults[0];

            if (topResults.length === 1) {
                term.green(`  ✓ Encontrada automaticamente: "${picked.name}" (círculo ${picked.circle})\n`);
            } else {
                term.dim('\n  Múltiplos resultados encontrados:\n');
                topResults.forEach((candidate, resultIndex) => {
                    term.dim(`  [${resultIndex + 1}] `);
                    term.bold(`${candidate.name}`);
                    term.dim(` (círculo ${candidate.circle})\n`);
                });

                const spellMenuItems = topResults.map((candidate, resultIndex) => `[${resultIndex + 1}] "${candidate.name}" (círculo ${candidate.circle})`);
                term('\n');
                const choice = await new Promise<number>((resolve) => {
                    term.singleColumnMenu(spellMenuItems, (_, response) => {
                        resolve(response.selectedIndex);
                    });
                });
                picked = topResults[choice];
                term.green(`  ✓ Selecionada: "${picked.name}"\n`);
            }

            resolved.push({
                id: String(picked._id),
                name: picked.name,
                circle: picked.circle,
            });
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return resolved;
    }

    private getPendingFeatures(output: CreateClassInput): PendingClassFeature[] {
        for (const key of this.getClassPendingKeys(output)) {
            const pending = this.pendingFeaturesByClassKey.get(key);
            if (pending) {
                this.deletePendingFeatureAliases(pending);
                return pending;
            }
        }

        const names = [output.originalName, output.name]
            .filter((name): name is string => Boolean(name))
            .map((name) => name.toLowerCase());

        for (const name of names) {
            for (const [key, pending] of this.pendingFeaturesByClassKey.entries()) {
                if (key.startsWith(`${name}|`)) {
                    this.deletePendingFeatureAliases(pending);
                    return pending;
                }
            }
        }

        return [];
    }

    private getPendingSubclasses(output: CreateClassInput): PendingSubclass[] {
        for (const key of this.getClassPendingKeys(output)) {
            const pending = this.pendingSubclassesByClassKey.get(key);
            if (pending) {
                this.deletePendingSubclassAliases(pending);
                return pending;
            }
        }

        const names = [output.originalName, output.name]
            .filter((name): name is string => Boolean(name))
            .map((name) => name.toLowerCase());

        for (const name of names) {
            for (const [key, pending] of this.pendingSubclassesByClassKey.entries()) {
                if (key.startsWith(`${name}|`)) {
                    this.deletePendingSubclassAliases(pending);
                    return pending;
                }
            }
        }

        return [];
    }

    private deletePendingFeatureAliases(pendingFeatures: PendingClassFeature[]): void {
        for (const [key, pending] of this.pendingFeaturesByClassKey.entries()) {
            if (pending === pendingFeatures) this.pendingFeaturesByClassKey.delete(key);
        }
    }

    private deletePendingSubclassAliases(pendingSubclasses: PendingSubclass[]): void {
        for (const [key, pending] of this.pendingSubclassesByClassKey.entries()) {
            if (pending === pendingSubclasses) this.pendingSubclassesByClassKey.delete(key);
        }
    }

    private findSubclass(output: CreateClassInput, subclassName: string): Subclass | undefined {
        return (output.subclasses ?? []).find((subclass) => subclass.name.toLowerCase() === subclassName.toLowerCase());
    }

    private mergeClassTraitsForPersistence(existingTraits: ClassTrait[] | undefined, incomingTraits: ClassTrait[] | undefined): ClassTrait[] {
        return incomingTraits && incomingTraits.length > 0
            ? incomingTraits
            : (existingTraits ?? incomingTraits ?? []);
    }

    private mergeClassSpellValuesForPersistence<T>(existingValues: T[] | undefined, incomingValues: T[] | undefined): T[] {
        return incomingValues && incomingValues.length > 0
            ? incomingValues
            : (existingValues ?? incomingValues ?? []);
    }

    private mergeSubclassState(existing: Subclass | undefined, incoming: Subclass): Subclass {
        const merged = {
            ...existing,
            ...incoming,
            _id: existing?._id ?? incoming._id,
            traits: this.mergeClassTraitsForPersistence(existing?.traits, incoming.traits),
            spells: this.mergeClassSpellValuesForPersistence(existing?.spells, incoming.spells),
        } as Subclass;

        return this.applySubclassSpellcastingState(merged);
    }

    private mergeSubclassesForPersistence(existingSubclasses: Subclass[] | undefined, incomingSubclasses: Subclass[] | undefined): Subclass[] {
        if ((!incomingSubclasses || incomingSubclasses.length === 0) && existingSubclasses) {
            return this.normalizeExistingSubclasses(existingSubclasses);
        }

        const merged = this.normalizeExistingSubclasses(existingSubclasses ?? []);

        for (const incomingSubclass of incomingSubclasses ?? []) {
            const index = merged.findIndex((current) => current.name.toLowerCase() === incomingSubclass.name.toLowerCase());
            if (index === -1) {
                merged.push(this.applySubclassSpellcastingState(incomingSubclass));
                continue;
            }

            merged[index] = this.mergeSubclassState(merged[index], incomingSubclass);
        }

        return merged;
    }

    private mergeExistingClassState(existing: CreateClassInput, incoming: CreateClassInput): CreateClassInput {
        return {
            ...existing,
            ...incoming,
            traits: this.mergeClassTraitsForPersistence(existing.traits, incoming.traits),
            spells: this.mergeClassSpellValuesForPersistence(existing.spells, incoming.spells),
            subclasses: this.mergeSubclassesForPersistence(existing.subclasses, incoming.subclasses),
        };
    }

    private applySubclassSpellcastingState(subclass: Subclass): Subclass {
        const hasSpells = (subclass.spells?.length ?? 0) > 0;

        return {
            ...subclass,
            spellcasting: Boolean(subclass.spellcasting || subclass.spellcastingAttribute || hasSpells),
        };
    }

    private upsertSubclass(output: CreateClassInput, subclass: Subclass): CreateClassInput {
        const subclasses = [...(output.subclasses ?? [])];
        const index = subclasses.findIndex((current) => current.name.toLowerCase() === subclass.name.toLowerCase());
        if (index === -1) {
            subclasses.push(this.applySubclassSpellcastingState(subclass));
        } else {
            subclasses[index] = this.mergeSubclassState(subclasses[index], subclass);
        }

        return { ...output, subclasses };
    }

    private async resolveTraits(
        traits: ClassTrait[],
        className: string,
        classSource: string,
    ): Promise<ClassTrait[]> {
        if (traits.length === 0) return [];

        term.bold('\n─── Resolvendo Habilidades de Classe ───────────────────────\n');

        const resolved: ClassTrait[] = [];

        for (const trait of traits) {
            const resolvedTrait = await this.resolveTrait(trait, className, classSource);
            if (resolvedTrait) resolved.push(resolvedTrait);
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return resolved;
    }

    private async resolveTrait(
        trait: ClassTrait,
        className: string,
        classSource: string,
        originalFeature?: PendingClassFeature,
    ): Promise<ClassTrait | null> {
        const processingTrait = trait as ProcessingClassTrait;
        const originalName = processingTrait.originalName ?? processingTrait.name;
        const traitName = processingTrait.name ?? originalName;

        term.cyan('\n  Habilidade: ');
        term.bold(`${traitName}`);
        if (originalName !== traitName) term.dim(` (EN: ${originalName})`);
        term(` (nível ${trait.level})\n`);

        const rawCandidates = await Trait.find({
            $or: [
                { originalName: { $regex: new RegExp(escapeRegex(originalName), 'i') } },
                { name: { $regex: new RegExp(escapeRegex(traitName), 'i') } },
            ],
        }).limit(100).lean();

        const seen = new Set<string>();
        const results = rawCandidates.filter((candidate) => {
            const id = String(candidate._id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        const ranked = applyFuzzySearch(results, traitName, 5);
        let topResults = ranked.length > 0 ? ranked : results.slice(0, 5);

        const classSpecificName = `${traitName} (${className})`;
        const classSpecificCandidate = results.find(
            (candidate) => candidate.name.toLowerCase() === classSpecificName.toLowerCase(),
        );
        if (classSpecificCandidate && !topResults.some((candidate) => String(candidate._id) === String(classSpecificCandidate._id))) {
            topResults = [classSpecificCandidate, ...topResults.slice(0, 4)];
        }

        const buildMentionHtml = (id: string, pickedName: string): string =>
            `<span data-type="mention" data-id="${id}" data-entity-type="Habilidade" class="mention">${pickedName}</span>`;

        if (results.length === 0) {
            term.dim('  → Nenhum resultado encontrado. Revise antes de criar.\n');
            return this.reviewAndCreateTrait({
                name: traitName,
                originalName,
                description: trait.description,
                source: classSource,
                status: 'active',
            }, trait.level, buildMentionHtml, originalFeature);
        }

        term.dim('\n  Resultados encontrados:\n');
        topResults.forEach((candidate, index) => {
            term.dim(`  [${index + 1}] `);
            term.bold(`${candidate.name}\n`);
            const desc = candidate.description.replace(/<[^>]+>/g, '').substring(0, 120);
            term.dim(`       ${desc}${desc.length >= 120 ? '...' : ''}\n`);
            term.dim(`       id: ${String(candidate._id)}\n`);
        });

        const menuItems = [
            `[0] CRIAR NOVA: "${classSpecificName}"`,
            ...topResults.map((candidate, index) => `[${index + 1}] USAR EXISTENTE: "${candidate.name}"`),
        ];

        term('\n');
        const choice = await new Promise<number>((resolve) => {
            term.singleColumnMenu(menuItems, (_, response) => {
                resolve(response.selectedIndex);
            });
        });

        if (choice === 0) {
            return this.reviewAndCreateTrait({
                name: classSpecificName,
                originalName,
                description: trait.description,
                source: classSource,
                status: 'active',
            }, trait.level, buildMentionHtml, originalFeature);
        }

        const picked = topResults[choice - 1];
        const traitId = String(picked._id);
        term.green(`  ✓ Usando existente: "${picked.name}" (${traitId})\n`);
        return { level: trait.level, description: buildMentionHtml(traitId, picked.name) };
    }

    private async reviewAndCreateTrait(
        proposedTrait: CreateTraitInput,
        level: number,
        buildMentionHtml: (id: string, pickedName: string) => string,
        originalFeature?: PendingClassFeature,
    ): Promise<ClassTrait | null> {
        const reviewed = await this.reviewTraitBeforeCreate(proposedTrait, originalFeature);
        if (!reviewed) return null;

        const created = await Trait.create(reviewed);
        const traitId = String(created._id);
        term.green(`  ✓ Criada: "${reviewed.name}" (${traitId})\n`);
        return { level, description: buildMentionHtml(traitId, reviewed.name) };
    }

    private async reviewTraitBeforeCreate(
        proposedTrait: CreateTraitInput,
        originalFeature?: PendingClassFeature,
    ): Promise<CreateTraitInput | null> {
        let entries = await loadAllEntries();
        let current = this.applyGlossaryToTrait(proposedTrait, entries);

        while (true) {
            this.renderReviewState(current, originalFeature ? {
                level: originalFeature.level,
                name: originalFeature.originalName,
                description: originalFeature.descriptionHtml,
            } : undefined);
            term.cyan('Glossário ');
            term.gray('(formato: "termo > tradução ; outro > outro" — vazio para confirmar, ESC para pular trait)');
            term.cyan(': ');

            const input = await new Promise<string | null>((resolve) => {
                term.inputField({ cancelable: true }, (_, value) => {
                    term('\n');
                    resolve(value === undefined ? null : value.trim());
                });
            });

            if (input === null) {
                term.yellow('  ⏭  Trait pulada.\n');
                return null;
            }

            if (!input) return current;

            const { entries: newEntries, errors } = parseGlossaryInput(input);

            if (errors.length > 0) {
                for (const err of errors) {
                    term.red(`  ✗ ${err}\n`);
                }
                term.yellow('  Por favor, corrija o formato e tente novamente.\n');
                continue;
            }

            if (newEntries.length === 0) {
                term.yellow('  Nenhuma entrada reconhecida. Tente novamente.\n');
                continue;
            }

            await saveEntries(newEntries);
            term.green(`  ✓ ${newEntries.length} entrada(s) salva(s) no glossário.\n`);

            entries = await loadAllEntries();
            current = this.applyGlossaryToTrait(proposedTrait, entries);
        }
    }

    private applyGlossaryToTrait(trait: CreateTraitInput, entries: GlossaryEntry[]): CreateTraitInput {
        const stripName = (s: string): string =>
            s.replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, '').trim();

        return {
            ...trait,
            name: stripName(applyGlossary(entries, trait.name)),
            description: applyGlossary(entries, trait.description),
        };
    }

    private applyGlossaryToSubclass(subclass: Subclass, entries: GlossaryEntry[]): Subclass {
        const stripName = (s: string): string =>
            s.replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, '').trim();

        return {
            ...subclass,
            name: stripName(applyGlossary(entries, subclass.name)),
            description: subclass.description ? applyGlossary(entries, subclass.description) : subclass.description,
        };
    }

    protected override applyGlossaryToOutput(output: CreateClassInput, entries: GlossaryEntry[]): CreateClassInput {
        const base = super.applyGlossaryToOutput(output, entries);
        const stripName = (s: string): string =>
            s.replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, '').trim();

        return {
            ...base,
            subclasses: (base.subclasses ?? []).map((subclass) => this.applyGlossaryToSubclass(subclass, entries)),
            traits: (base.traits ?? []).map((trait) => {
                const processingTrait = trait as ProcessingClassTrait;
                return {
                    ...trait,
                    name: processingTrait.name ? stripName(applyGlossary(entries, processingTrait.name)) : processingTrait.name,
                    description: applyGlossary(entries, trait.description),
                } as ProcessingClassTrait;
            }),
        };
    }

    async findExisting(cls: CreateClassInput): Promise<CreateClassInput | null> {
        await dbConnect();
        const nameRegex = new RegExp(`^${escapeRegex(cls.name)}$`, 'i');
        const orClauses: Record<string, unknown>[] = [{ name: nameRegex }];
        if (cls.originalName) {
            orClauses.push({ originalName: new RegExp(`^${escapeRegex(cls.originalName)}$`, 'i') });
        }

        const query = CharacterClass.findOne({ $or: orClauses }) as { lean?: () => Promise<unknown> } | null | undefined;
        if (!query?.lean) return null;

        const doc = await query.lean();
        if (!doc) return null;

        const existing = doc as unknown as CreateClassInput & { traits?: Array<ClassTrait & { _id?: unknown }> };
        return {
            name: existing.name,
            originalName: existing.originalName,
            image: existing.image ?? '',
            description: existing.description,
            source: existing.source,
            status: existing.status,
            hitDice: existing.hitDice,
            primaryAttributes: existing.primaryAttributes,
            savingThrows: existing.savingThrows,
            armorProficiencies: existing.armorProficiencies,
            weaponProficiencies: existing.weaponProficiencies,
            skillCount: existing.skillCount,
            availableSkills: existing.availableSkills,
            spellcasting: existing.spellcasting,
            spellcastingAttribute: existing.spellcastingAttribute,
            spells: existing.spells ?? [],
            subclasses: this.normalizeExistingSubclasses(existing.subclasses ?? []),
            traits: (existing.traits ?? []).map((trait) => ({
                _id: trait._id ? String(trait._id) : undefined,
                level: trait.level,
                description: trait.description,
            })),
            progressionTable: existing.progressionTable,
        };
    }

    private async findExistingForProcessing(cls: CreateClassInput): Promise<CreateClassInput | null> {
        await dbConnect();
        const nameRegex = new RegExp(`^${escapeRegex(cls.name)}$`, 'i');
        const orClauses: Record<string, unknown>[] = [{ name: nameRegex }];
        if (cls.originalName) {
            orClauses.push({ originalName: new RegExp(`^${escapeRegex(cls.originalName)}$`, 'i') });
        }

        const query = CharacterClass.findOne({ $or: orClauses }) as { lean?: () => Promise<unknown> } | null | undefined;
        if (!query?.lean) return null;

        const doc = await query.lean();
        if (!doc) return null;

        const existing = doc as unknown as CreateClassInput & { traits?: Array<ClassTrait & { _id?: unknown }> };
        return {
            name: existing.name,
            originalName: existing.originalName,
            image: existing.image ?? '',
            description: existing.description,
            source: existing.source,
            status: existing.status,
            hitDice: existing.hitDice,
            primaryAttributes: existing.primaryAttributes,
            savingThrows: existing.savingThrows,
            armorProficiencies: existing.armorProficiencies,
            weaponProficiencies: existing.weaponProficiencies,
            skillCount: existing.skillCount,
            availableSkills: existing.availableSkills,
            spellcasting: existing.spellcasting,
            spellcastingAttribute: existing.spellcastingAttribute,
            spells: existing.spells ?? [],
            subclasses: this.normalizeExistingSubclasses(existing.subclasses ?? []),
            traits: (existing.traits ?? []).map((trait) => ({
                _id: trait._id ? String(trait._id) : undefined,
                level: trait.level,
                description: trait.description,
            })),
            progressionTable: existing.progressionTable,
        };
    }

    private hasPendingFeatures(cls: CreateClassInput): boolean {
        if (this.getClassPendingKeys(cls).some((key) => this.pendingFeaturesByClassKey.has(key))) return true;

        const names = [cls.originalName, cls.name]
            .filter((name): name is string => Boolean(name))
            .map((name) => name.toLowerCase());

        return names.some((name) =>
            [...this.pendingFeaturesByClassKey.keys()].some((key) => key.startsWith(`${name}|`)),
        );
    }

    private hasPendingSubclasses(cls: CreateClassInput): boolean {
        if (this.getClassPendingKeys(cls).some((key) => this.pendingSubclassesByClassKey.has(key))) return true;

        const names = [cls.originalName, cls.name]
            .filter((name): name is string => Boolean(name))
            .map((name) => name.toLowerCase());

        return names.some((name) =>
            [...this.pendingSubclassesByClassKey.keys()].some((key) => key.startsWith(`${name}|`)),
        );
    }

    private normalizeExistingSubclasses(subclasses: Subclass[]): Subclass[] {
        return subclasses.map((subclass) => ({
            ...subclass,
            _id: subclass._id ? String(subclass._id) : undefined,
            spells: subclass.spells ?? [],
            traits: (subclass.traits ?? []).map((trait) => ({
                _id: trait._id ? String(trait._id) : undefined,
                level: trait.level,
                description: trait.description,
            })),
        }));
    }

    private stripSpellsForClassOutput(output: CreateClassInput): CreateClassInput {
        const { spells: _spells, ...withoutClassSpells } = output;
        void _spells;

        return {
            ...withoutClassSpells,
            subclasses: output.subclasses?.map((subclass) => {
                const { spells: _subclassSpells, ...withoutSubclassSpells } = subclass;
                void _subclassSpells;
                return withoutSubclassSpells;
            }),
        };
    }

    async create(cls: CreateClassInput): Promise<void> {
        await dbConnect();
        await CharacterClass.create(cls);
    }

    async update(cls: CreateClassInput): Promise<void> {
        await dbConnect();
        const orClauses: Record<string, unknown>[] = [{ name: new RegExp(`^${escapeRegex(cls.name)}$`, 'i') }];
        if (cls.originalName) {
            orClauses.push({ originalName: new RegExp(`^${escapeRegex(cls.originalName)}$`, 'i') });
        }
        const existing = await this.findExistingForProcessing(cls);
        const payload = existing ? this.mergeExistingClassState(existing, cls) : cls;
        await CharacterClass.findOneAndUpdate(
            { $or: orClauses },
            { $set: payload },
            { runValidators: true },
        );
    }

    override getItemLabel(item: CreateClassInput): string {
        return item.name;
    }
}
