/**
 * @fileoverview RacesProvider — seeds races from 5etools data.
 *
 * Reads:
 *  - src/lib/5etools-data/races.json  — mechanical entries (traits, abilities)
 *  - src/lib/5etools-data/fluff-races.json — lore descriptions and artwork
 * Creates: Race documents via RaceModel; Trait documents via TraitModel
 *
 * Flow per item:
 *  1. Skip NPC-only races and reprinted (superseded) races
 *  2. Map speed, size, source
 *  3. Image from fluff-races.json images[0].href.path
 *  4. Description from fluff-races.json entries (lore)
 *  5. Traits from races.json entries (mechanical abilities)
 *  6. Translate name + description + each trait via translateItem()
 *  7. Collect matching subraces as variations
 *  8. Check if race with that name already exists
 *  9. After glossary review: resolve each trait against Trait collection
 *  10. Create/update race in DB
 */

import path from 'path';
import fs from 'fs';
import { BaseProvider, convertFeetToMeters, formatSource } from '../base-provider';
import type { GlossaryEntry } from '../glossary/glossary-store';
import { applyGlossary } from '../glossary/glossary-store';
import type { CreateRaceInput, RaceTrait, RaceVariation, SizeCategory } from '../../../src/features/races/types/races.types';
import { RaceModel } from '../../../src/features/races/models/race';
import { Trait } from '../../../src/features/traits/database/trait';
import dbConnect from '../../../src/core/database/db';
import termKit from 'terminal-kit';

const term = termKit.terminal;
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// ─── 5etools input types ─────────────────────────────────────────────────────

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

export interface FiveEToolsRace {
    name: string;
    source: string;
    page?: number;
    size?: string[];
    speed?: number | Record<string, number | boolean>;
    ability?: Record<string, number>[];
    age?: { mature?: number; max?: number };
    traitTags?: string[];
    languageProficiencies?: Record<string, boolean | number>[];
    darkvision?: number;
    resist?: (string | Record<string, unknown>)[];
    entries?: FiveEToolsEntry[];
    hasFluff?: boolean;
    hasFluffImages?: boolean;
    reprintedAs?: string[];
    lineage?: string;
    additionalSpells?: unknown[];
    soundClip?: unknown;
}

export interface FiveEToolsSubrace {
    name?: string;
    source: string;
    raceName: string;
    raceSource: string;
    page?: number;
    size?: string[];
    speed?: number | Record<string, number | boolean>;
    ability?: Record<string, number>[];
    entries?: FiveEToolsEntry[];
    hasFluffImages?: boolean;
    reprintedAs?: string[];
    _versions?: unknown[];
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

interface FluffRaceEntry {
    name: string;
    source: string;
    entries?: (string | FiveEToolsEntry)[];
    images?: FluffImage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<string, SizeCategory> = {
    S: 'Pequeno',
    M: 'Médio',
    L: 'Grande',
};

export function mapSize(sizeArr: string[] | undefined): SizeCategory {
    if (!sizeArr || sizeArr.length === 0) return 'Médio';
    for (const s of sizeArr) {
        const mapped = SIZE_MAP[s];
        if (mapped) return mapped;
    }
    return 'Médio';
}

function feetToMetersNum(feet: number): string {
    const m = feet * 0.3;
    return Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ',');
}

const SPEED_LABELS: Record<string, string> = {
    walk: 'a pé',
    fly: 'voando',
    swim: 'nadando',
    climb: 'escalando',
    burrow: 'escavando',
};

export function mapSpeed(speed: number | Record<string, number | boolean> | undefined): string {
    if (speed === undefined) return '9 metros';

    if (typeof speed === 'number') {
        return `${feetToMetersNum(speed)} metros`;
    }

    const parts: string[] = [];
    for (const [key, value] of Object.entries(speed)) {
        const label = SPEED_LABELS[key] ?? key;
        if (typeof value === 'number') {
            parts.push(`${feetToMetersNum(value)} metros (${label})`);
        } else if (value === true) {
            if (key === 'fly') {
                parts.push('voo igual ao deslocamento a pé');
            } else {
                parts.push(`deslocamento de ${label} igual ao deslocamento a pé`);
            }
        }
    }

    return parts.join(', ') || '9 metros';
}


/** Strip 5etools inline tag syntax from text before sending to AI. */
export function cleanText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, '$2')
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        .replace(/\{@hit\s+([^}]+)\}/g, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/g, 'CD $1')
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
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
                const e = item as FiveEToolsEntry;
                if (e.name && e.entry) {
                    return `<li><strong>${cleanText(e.name)}.</strong> ${cleanText(e.entry)}</li>`;
                }
                if (e.entry) return `<li>${cleanText(e.entry)}</li>`;
                if (e.entries) return `<li>${(e.entries as string[]).map(cleanText).join(' ')}</li>`;
                return '';
            })
            .filter(Boolean);
        parts.push(`<ul>${listItems.join('')}</ul>`);
    } else if (entry.type === 'table' && Array.isArray(entry.rows)) {
        // Skip complex tables in the seed description
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

/** Extract named mechanical traits from a race's entries array. */
export function extractTraits(entries: FiveEToolsEntry[] | undefined): RaceTrait[] {
    if (!entries || entries.length === 0) return [];
    const traits: RaceTrait[] = [];
    for (const entry of entries) {
        if (typeof entry === 'string') continue;
        if (entry.name && Array.isArray(entry.entries)) {
            const descHtml = buildDescriptionHtml(entry.entries);
            if (descHtml) {
                traits.push({ name: cleanText(entry.name), description: descHtml, level: 1 });
            }
        }
    }
    return traits;
}

// ─── RacesProvider ────────────────────────────────────────────────────────────

export class RacesProvider extends BaseProvider<FiveEToolsRace, CreateRaceInput> {
    readonly name = 'Races';
    readonly dataFilePath = 'src/lib/5etools-data/races.json';
    readonly dataKey = 'race';

    private subraces: FiveEToolsSubrace[] = [];
    private fluffData: Map<string, FluffRaceEntry> = new Map();

    override readDataFile(): FiveEToolsRace[] {
        const fullPath = path.resolve(PROJECT_ROOT, this.dataFilePath);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        const races = parsed[this.dataKey];
        if (!Array.isArray(races)) {
            throw new Error(`Key "${this.dataKey}" not found or not an array in ${fullPath}`);
        }

        this.subraces = Array.isArray(parsed['subrace'])
            ? (parsed['subrace'] as FiveEToolsSubrace[])
            : [];

        this.log(`Loaded ${this.subraces.length} subraces`, 'dim');

        // Load fluff data
        const fluffPath = path.resolve(PROJECT_ROOT, 'src/lib/5etools-data/fluff-races.json');
        const fluffRaw = fs.readFileSync(fluffPath, 'utf-8');
        const fluffParsed = JSON.parse(fluffRaw) as Record<string, unknown>;
        const fluffArr = Array.isArray(fluffParsed['raceFluff'])
            ? (fluffParsed['raceFluff'] as FluffRaceEntry[])
            : [];

        this.fluffData = new Map(fluffArr.map((f) => [`${f.name}|${f.source}`, f]));
        this.log(`Loaded ${this.fluffData.size} fluff entries`, 'dim');

        return races as FiveEToolsRace[];
    }

    private getFluff(name: string, source: string): FluffRaceEntry | undefined {
        return this.fluffData.get(`${name}|${source}`);
    }

    private buildFluffImageUrl(fluff: FluffRaceEntry | undefined): string {
        const img = fluff?.images?.[0];
        if (!img) return '';
        if (img.href.type === 'internal' && img.href.path) {
            return `https://5e.tools/img/${img.href.path}`;
        }
        if (img.href.type === 'external' && img.href.url) {
            return img.href.url;
        }
        return '';
    }

    async processItem(race: FiveEToolsRace): Promise<CreateRaceInput | null> {
        // Skip NPC-only races
        if (race.traitTags?.includes('NPC Race')) {
            this.log(`Skipping NPC race: ${race.name} (${race.source})`, 'dim');
            return null;
        }

        // Skip races superseded by a newer printing
        if (race.reprintedAs && race.reprintedAs.length > 0) {
            this.log(`Skipping reprinted race: ${race.name} (${race.source}) → ${race.reprintedAs[0]}`, 'dim');
            return null;
        }

        const fluff = this.getFluff(race.name, race.source);

        // Description comes from fluff lore entries
        const descriptionHtml = buildDescriptionHtml(fluff?.entries);
        const { name, description } = await this.translateItem(race.name, descriptionHtml);

        // Traits come from mechanical entries
        const rawTraits = extractTraits(race.entries);
        const translatedTraits: RaceTrait[] = [];
        for (const trait of rawTraits) {
            const { name: traitName, description: traitDesc } = await this.translateItem(
                trait.name,
                trait.description,
            );
            translatedTraits.push({ name: traitName, description: convertFeetToMeters(traitDesc) });
        }

        // Image from fluff
        const image = this.buildFluffImageUrl(fluff);

        // Map variations (subraces)
        const matchingSubraces = this.subraces.filter(
            (sr) => sr.raceName === race.name && sr.raceSource === race.source,
        );

        const variations: RaceVariation[] = [];
        for (const subrace of matchingSubraces) {
            // Skip reprinted subraces
            if (subrace.reprintedAs && subrace.reprintedAs.length > 0) continue;

            const subraceNameRaw = subrace.name ?? race.name;
            const subraceFluff = this.getFluff(subraceNameRaw, subrace.source);

            const subraceDescHtml = buildDescriptionHtml(subraceFluff?.entries);
            const { name: subraceName, description: subraceDescription } =
                await this.translateItem(subraceNameRaw, subraceDescHtml);

            const subraceRawTraits = extractTraits(subrace.entries);
            const subraceTraits: RaceTrait[] = [];
            for (const trait of subraceRawTraits) {
                const { name: traitName, description: traitDesc } = await this.translateItem(
                    trait.name,
                    trait.description,
                );
                subraceTraits.push({ name: traitName, description: convertFeetToMeters(traitDesc) });
            }

            variations.push({
                name: subraceName,
                description: subraceDescription,
                source: formatSource(subrace.source, subrace.page),
                image: this.buildFluffImageUrl(subraceFluff),
                traits: subraceTraits,
                spells: [],
                size: mapSize(subrace.size),
                speed: subrace.speed ? mapSpeed(subrace.speed) : undefined,
            });
        }

        return {
            name,
            description: convertFeetToMeters(description),
            source: formatSource(race.source, race.page),
            status: 'active',
            size: mapSize(race.size),
            speed: mapSpeed(race.speed),
            image,
            traits: translatedTraits,
            spells: [],
            variations,
        };
    }

    /** Called after glossary review — resolves each trait against the Trait collection. */
    protected override async afterReview(
        output: CreateRaceInput,
        isDryRun: boolean,
    ): Promise<CreateRaceInput> {
        if (isDryRun) return output;

        const resolvedTraits = await this.resolveTraits(output.traits, output.name, output.source);

        const resolvedVariations: RaceVariation[] = [];
        for (const variation of output.variations) {
            const resolvedVarTraits = await this.resolveTraits(
                variation.traits,
                `${output.name} (${variation.name})`,
                output.source,
            );
            resolvedVariations.push({ ...variation, traits: resolvedVarTraits });
        }

        return { ...output, traits: resolvedTraits, variations: resolvedVariations };
    }

    /**
     * For each trait: search the Trait collection by name.
     * If no results → create and return with real _id.
     * If results → let user choose: use existing or create new "TraitName (RaceName)".
     */
    private async resolveTraits(
        traits: RaceTrait[],
        raceName: string,
        raceSource: string,
    ): Promise<RaceTrait[]> {
        if (traits.length === 0) return [];

        await dbConnect();
        term.bold('\n─── Resolvendo Habilidades ─────────────────────────────────\n');

        const resolved: RaceTrait[] = [];

        for (const trait of traits) {
            term.cyan(`\n  Habilidade: `);
            term.bold(`${trait.name}\n`);

            const results = await Trait.find({
                name: { $regex: new RegExp(trait.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            }).limit(5).lean();

            if (results.length === 0) {
                term.dim(`  → Nenhum resultado encontrado. Será criada.\n`);
                const created = await Trait.create({
                    name: trait.name,
                    description: trait.description,
                    source: raceSource,
                    status: 'active',
                });
                term.green(`  ✓ Criada: "${trait.name}" (${String(created._id)})\n`);
                resolved.push({ ...trait, _id: String(created._id) });
                continue;
            }

            // Show existing results as formatted JSON
            term.dim(`\n  Resultados encontrados:\n`);
            results.forEach((r, i) => {
                term.dim(`  [${ i + 1 }] `);
                term.bold(`${r.name}\n`);
                const desc = r.description.replace(/<[^>]+>/g, '').substring(0, 120);
                term.dim(`       ${desc}${desc.length >= 120 ? '…' : ''}\n`);
                term.dim(`       id: ${String(r._id)}\n`);
            });

            const newName = `${trait.name} (${raceName})`;
            const menuItems = [
                `[0] CRIAR NOVA: "${newName}"`,
                ...results.map((r, i) => `[${i + 1}] USAR EXISTENTE: "${r.name}"`),
            ];

            term('\n');
            const choice = await new Promise<number>((resolve) => {
                term.singleColumnMenu(menuItems, (_, response) => {
                    resolve(response.selectedIndex);
                });
            });

            if (choice === 0) {
                const created = await Trait.create({
                    name: newName,
                    description: trait.description,
                    source: raceSource,
                    status: 'active',
                });
                term.green(`  ✓ Criada: "${newName}" (${String(created._id)})\n`);
                resolved.push({ ...trait, name: newName, _id: String(created._id) });
            } else {
                const picked = results[choice - 1];
                term.green(`  ✓ Usando existente: "${picked.name}" (${String(picked._id)})\n`);
                resolved.push({ ...trait, name: picked.name, description: picked.description, _id: String(picked._id) });
            }
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return resolved;
    }

    protected override applyGlossaryToOutput(output: CreateRaceInput, entries: GlossaryEntry[]): CreateRaceInput {
        const base = super.applyGlossaryToOutput(output, entries);

        const applyToTrait = (t: RaceTrait): RaceTrait => ({
            ...t,
            name: applyGlossary(entries, t.name),
            description: applyGlossary(entries, t.description),
        });

        return {
            ...base,
            traits: base.traits.map(applyToTrait),
            variations: base.variations.map((v) => ({
                ...v,
                name: applyGlossary(entries, v.name),
                description: applyGlossary(entries, v.description),
                traits: v.traits.map(applyToTrait),
            })),
        };
    }

    async findExisting(race: CreateRaceInput): Promise<CreateRaceInput | null> {
        await dbConnect();
        const doc = await RaceModel.findOne({ name: race.name }).lean();
        if (!doc) return null;

        return {
            name: doc.name,
            description: doc.description,
            source: doc.source,
            status: doc.status,
            size: doc.size,
            speed: doc.speed,
            image: doc.image ?? '',
            traits: doc.traits.map((t) => ({
                _id: t._id ? String(t._id) : undefined,
                name: t.name,
                description: t.description,
                level: t.level,
            })),
            spells: doc.spells,
            variations: doc.variations.map((v) => ({
                name: v.name,
                description: v.description,
                source: v.source,
                image: v.image ?? '',
                color: v.color,
                traits: v.traits.map((t) => ({
                    _id: t._id ? String(t._id) : undefined,
                    name: t.name,
                    description: t.description,
                    level: t.level,
                })),
                spells: v.spells,
                size: v.size,
                speed: v.speed,
            })),
        };
    }

    async create(race: CreateRaceInput): Promise<void> {
        await dbConnect();
        await RaceModel.create(race);
    }

    async update(race: CreateRaceInput): Promise<void> {
        await dbConnect();
        await RaceModel.findOneAndUpdate(
            { name: race.name },
            { $set: race },
            { runValidators: true },
        );
    }

    override getItemLabel(item: CreateRaceInput): string {
        return item.name;
    }
}
