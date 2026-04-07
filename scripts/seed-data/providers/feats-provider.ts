/**
 * @fileoverview FeatsProvider — seeds feats from 5etools data.
 *
 * Reads: src/lib/5etools-data/feats.json
 * Creates: Feat documents via feats-service
 *
 * Flow per item:
 *  1. Skip feats with `reprintedAs` (superseded by newer version)
 *  2. Map deterministic fields (category, level, attributeBonuses, prerequisites, source)
 *  3. Build HTML description from entries
 *  4. Call this.translateItem(name, description) defined in BaseProvider
 *  5. Check if feat with that name already exists
 *  6. If not, create it
 */

import { BaseProvider, formatSource } from '../base-provider';
import { createFeat } from '../../../src/features/feats/api/feats-service';
import { Feat } from '../../../src/features/feats/models/feat';
import dbConnect from '../../../src/core/database/db';
import type { CreateFeatInput } from '../../../src/features/feats/types/feats.types';
import type { FeatCategory } from '../../../src/features/feats/lib/feat-categories';

// ─── 5etools input types ─────────────────────────────────────────────────────

interface FiveEToolsAbilityChoice {
    from?: string[];
    amount?: number;
    count?: number;
}

interface FiveEToolsAbility {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
    choose?: FiveEToolsAbilityChoice;
    hidden?: boolean;
    max?: number;
}

interface FiveEToolsPrerequisiteAbility {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
    choose?: FiveEToolsAbilityChoice;
}

interface FiveEToolsPrerequisite {
    level?: number;
    ability?: FiveEToolsPrerequisiteAbility[];
    feat?: string[];
    feature?: string[];
    race?: { name: string; subrace?: string; displayEntry?: string }[];
    spellcasting2020?: boolean;
    spellcastingFeature?: boolean;
    proficiency?: { armor?: string; weapon?: string; weaponGroup?: string }[];
    background?: { name: string; displayEntry?: string }[];
    otherSummary?: { entry?: string; entrySummary?: string };
    other?: string;
    campaign?: string[];
    exclusiveFeatCategory?: string[];
    featCategory?: string;
}

interface FiveEToolsEntry {
    type?: string;
    name?: string;
    entries?: (string | FiveEToolsEntry)[];
    items?: (string | FiveEToolsEntry)[];
    entry?: string;
    caption?: string;
    colLabels?: string[];
    rows?: unknown[][];
}

export interface FiveEToolsFeat {
    name: string;
    source: string;
    page?: number;
    category?: string;
    prerequisite?: FiveEToolsPrerequisite[];
    ability?: FiveEToolsAbility[];
    entries: (string | FiveEToolsEntry)[];
    hasFluffImages?: boolean;
    repeatable?: boolean;
    reprintedAs?: string[];
    srd52?: boolean;
    basicRules2024?: boolean;
}

// ─── Mapping tables ───────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, FeatCategory | undefined> = {
    G: 'Geral',
    O: 'Origem',
    FS: 'Estilo de Luta',
    'FS:P': 'Estilo de Luta',
    'FS:R': 'Estilo de Luta',
    EB: 'Dádiva Épica',
};

const ATTRIBUTE_MAP: Record<string, string> = {
    str: 'Força',
    dex: 'Destreza',
    con: 'Constituição',
    int: 'Inteligência',
    wis: 'Sabedoria',
    cha: 'Carisma',
};

const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_MAP);

const ARMOR_MAP: Record<string, string> = {
    light: 'armadura leve',
    medium: 'armadura média',
    heavy: 'armadura pesada',
    shield: 'escudo',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip 5etools inline tag syntax from text before sending to AI. */
function cleanText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, '$2')
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        .replace(/\{@hit\s+([^}]+)\}/g, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/g, 'CD $1')
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
        .trim();
}

/** Extract level number for the feat (minimum character level required). */
function extractLevel(prerequisites?: FiveEToolsPrerequisite[]): number {
    if (!prerequisites) return 1;
    for (const p of prerequisites) {
        if (typeof p.level === 'number' && p.level >= 1 && p.level <= 20) {
            return p.level;
        }
    }
    return 1;
}

/** Build text for a single prerequisite object. Returns null for campaign/meta fields to skip. */
function buildPrerequisiteText(prereq: FiveEToolsPrerequisite): string | null {
    const parts: string[] = [];

    if (prereq.level) {
        parts.push(`Nível ${prereq.level}`);
    }

    if (prereq.ability) {
        for (const abilityObj of prereq.ability) {
            for (const key of ATTRIBUTE_KEYS) {
                const val = (abilityObj as Record<string, number | undefined>)[key];
                if (typeof val === 'number') {
                    parts.push(`${ATTRIBUTE_MAP[key]} ${val} ou superior`);
                }
            }
        }
    }

    if (prereq.feat) {
        const names = prereq.feat.map((entry) => {
            const baseName = entry.split('|')[0];
            return baseName
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        });
        parts.push(`Talento: ${names.join(' ou ')}`);
    }

    if (prereq.feature) {
        parts.push(`Habilidade de Classe: ${prereq.feature.join(' ou ')}`);
    }

    if (prereq.spellcasting2020 || prereq.spellcastingFeature) {
        parts.push('Habilidade de Conjuração');
    }

    if (prereq.proficiency) {
        const profTexts = prereq.proficiency.map((p) => {
            if (p.armor) return `Proficiência com ${ARMOR_MAP[p.armor] ?? p.armor}`;
            if (p.weapon) return `Proficiência com armas ${p.weapon}`;
            if (p.weaponGroup) return `Proficiência com armas ${p.weaponGroup}`;
            return null;
        }).filter((t): t is string => t !== null);
        parts.push(...profTexts);
    }

    if (prereq.race) {
        const raceNames = prereq.race.map((r) =>
            r.subrace ? `${r.name} (${r.subrace})` : r.name,
        );
        parts.push(`Raça: ${raceNames.join(' ou ')}`);
    }

    if (prereq.background) {
        const bgNames = prereq.background.map((b) => b.name);
        parts.push(`Antecedente: ${bgNames.join(' ou ')}`);
    }

    if (prereq.otherSummary?.entrySummary) {
        parts.push(prereq.otherSummary.entrySummary);
    } else if (prereq.other) {
        parts.push(prereq.other);
    }

    if (parts.length === 0) return null;
    return parts.join(', ');
}

/** Build prerequisites array from the raw 5etools prerequisite list. */
function buildPrerequisites(prerequisites?: FiveEToolsPrerequisite[]): string[] {
    if (!prerequisites) return [];
    return prerequisites
        .map(buildPrerequisiteText)
        .filter((t): t is string => t !== null);
}

/** Map attribute bonuses from the `ability` array. */
function buildAttributeBonuses(
    ability?: FiveEToolsAbility[],
): CreateFeatInput['attributeBonuses'] {
    if (!ability) return [];
    const bonuses: { attribute: string; value: number }[] = [];

    for (const abilityObj of ability) {
        for (const key of ATTRIBUTE_KEYS) {
            const val = (abilityObj as Record<string, number | undefined>)[key];
            if (typeof val === 'number' && val >= 1 && val <= 3) {
                bonuses.push({ attribute: ATTRIBUTE_MAP[key], value: val });
            }
        }
    }

    return bonuses;
}

/** Render a list of entry items as HTML list items. */
function renderListItems(items: (string | FiveEToolsEntry)[]): string {
    return items
        .map((item) => {
            if (typeof item === 'string') return `<li>${cleanText(item)}</li>`;
            if (item.entry) return `<li>${cleanText(item.entry)}</li>`;
            if (item.entries) {
                const inner = item.entries
                    .filter((e): e is string => typeof e === 'string')
                    .map(cleanText)
                    .join(' ');
                return item.name
                    ? `<li><strong>${item.name}.</strong> ${inner}</li>`
                    : `<li>${inner}</li>`;
            }
            return '';
        })
        .filter(Boolean)
        .join('');
}

/** Render a single 5etools entry (string or object) to HTML. */
function renderEntry(entry: string | FiveEToolsEntry): string {
    if (typeof entry === 'string') return `<p>${cleanText(entry)}</p>`;

    const e = entry;
    switch (e.type) {
        case 'entries':
        case 'inset':
        case 'section': {
            if (!e.entries) return '';
            const inner = e.entries.map(renderEntry).join('');
            return e.name
                ? `<p><strong>${e.name}.</strong></p>${inner}`
                : inner;
        }
        case 'list': {
            if (!e.items) return '';
            return `<ul>${renderListItems(e.items)}</ul>`;
        }
        case 'table': {
            if (!e.colLabels || !e.rows) return '';
            const headers = e.colLabels.map((h) => `<th>${cleanText(String(h))}</th>`).join('');
            const rows = (e.rows as unknown[][])
                .map((row) => `<tr>${row.map((cell) => `<td>${cleanText(String(cell))}</td>`).join('')}</tr>`)
                .join('');
            const caption = e.caption ? `<caption>${e.caption}</caption>` : '';
            return `<table>${caption}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
        }
        default: {
            if (e.entries) return e.entries.map(renderEntry).join('');
            return '';
        }
    }
}

/** Build an HTML description from the feat entries, ready for translation. */
function buildEntriesHtml(feat: FiveEToolsFeat): string {
    return feat.entries.map(renderEntry).join('');
}

// ─── FeatsProvider ────────────────────────────────────────────────────────────

export class FeatsProvider extends BaseProvider<FiveEToolsFeat, CreateFeatInput> {
    readonly name = 'Feats';
    readonly dataFilePath = 'src/lib/5etools-data/feats.json';
    readonly dataKey = 'feat';

    async processItem(feat: FiveEToolsFeat): Promise<CreateFeatInput | null> {
        // Skip reprinted (superseded) feats — their replacement is the canonical version
        if (feat.reprintedAs) {
            this.log(`Skipping reprint: "${feat.name}" (${feat.source})`, 'dim');
            return null;
        }

        const category = feat.category ? CATEGORY_MAP[feat.category] : undefined;

        // Skip feats whose category doesn't map to a valid app category
        if (!category) {
            this.log(`Skipping unmapped category "${feat.category ?? '(none)'}" for feat "${feat.name}"`, 'dim');
            return null;
        }

        const level = extractLevel(feat.prerequisite);
        const prerequisites = buildPrerequisites(feat.prerequisite);
        const attributeBonuses = buildAttributeBonuses(feat.ability);

        const entriesHtml = buildEntriesHtml(feat);
        const { name, description } = await this.translateItem(feat.name, entriesHtml);

        const source = formatSource(feat.source, feat.page);

        return {
            name,
            description,
            source,
            level,
            prerequisites,
            attributeBonuses,
            category,
            status: 'active',
        };
    }

    async findExisting(feat: CreateFeatInput): Promise<CreateFeatInput | null> {
        await dbConnect();
        const nameRegex = new RegExp(
            `^${feat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
        );
        const doc = await Feat.findOne({ name: nameRegex }).lean();
        if (!doc) return null;

        return {
            name: doc.name,
            description: doc.description,
            source: doc.source,
            level: doc.level,
            prerequisites: doc.prerequisites,
            attributeBonuses: doc.attributeBonuses,
            category: doc.category as FeatCategory | undefined,
            status: doc.status,
        };
    }

    async update(feat: CreateFeatInput): Promise<void> {
        await dbConnect();
        const nameRegex = new RegExp(
            `^${feat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
        );
        await Feat.findOneAndUpdate(
            { name: nameRegex },
            { $set: feat },
            { runValidators: true },
        );
    }

    async create(feat: CreateFeatInput): Promise<void> {
        await createFeat(feat, 'seed-script');
    }

    override getItemLabel(item: CreateFeatInput): string {
        return item.name;
    }
}
