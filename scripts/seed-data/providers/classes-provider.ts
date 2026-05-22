/**
 * @fileoverview ClassesProvider — seeds base character classes from 5etools data.
 *
 * Reads:
 *  - src/lib/5etools-data/classes/class-*.json — class mechanics/features
 *  - src/lib/5etools-data/classes/fluff-class-*.json — lore descriptions/artwork
 * Creates: CharacterClass documents via CharacterClass; Trait documents on demand
 *
 * This provider intentionally imports base classes only. Subclasses are left empty
 * for a future provider/iteration.
 */

import fs from 'fs';
import path from 'path';
import termKit from 'terminal-kit';
import { BaseProvider, convertFeetToMeters, formatSource } from '../base-provider';
import type { GlossaryEntry } from '../glossary/glossary-store';
import { applyGlossary } from '../glossary/glossary-store';
import dbConnect from '../../../src/core/database/db';
import { applyFuzzySearch } from '../../../src/core/utils/search-engine';
import { CharacterClass } from '../../../src/features/classes/models/character-class';
import type {
    ArmorProficiency,
    ClassTrait,
    CreateClassInput,
    HitDiceType,
    SkillType,
    WeaponProficiency,
} from '../../../src/features/classes/types/classes.types';
import { Trait } from '../../../src/features/traits/database/trait';
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
    classFeatures?: (string | FiveEToolsClassFeatureRef)[];
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
    source: string;
    entries?: (string | FiveEToolsEntry)[];
    images?: FluffImage[];
}

interface ClassesDataFile {
    class?: FiveEToolsClass[];
    classFeature?: FiveEToolsClassFeature[];
}

interface ClassesFluffFile {
    classFluff?: FluffClassEntry[];
}

interface ClassFeatureLookup {
    className: string;
    classSource: string;
    featureName: string;
    featureSource: string;
    level: number;
}

interface ProcessingClassTrait extends ClassTrait {
    name: string;
    originalName: string;
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

function buildFeatureKey(feature: FiveEToolsClassFeature): string {
    return [
        feature.name.toLowerCase(),
        feature.className.toLowerCase(),
        (feature.classSource || feature.source).toLowerCase(),
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

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── ClassesProvider ─────────────────────────────────────────────────────────

export class ClassesProvider extends BaseProvider<FiveEToolsClass, CreateClassInput> {
    readonly name = 'Classes';
    readonly dataFilePath = 'src/lib/5etools-data/classes';
    readonly dataKey = 'class';

    private featureData: Map<string, FiveEToolsClassFeature> = new Map();
    private fluffData: Map<string, FluffClassEntry> = new Map();

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
        const fluffEntries: FluffClassEntry[] = [];

        for (const file of classFiles) {
            const parsed = JSON.parse(fs.readFileSync(path.join(classesDir, file), 'utf-8')) as ClassesDataFile;
            if (Array.isArray(parsed.class)) classes.push(...parsed.class);
            if (Array.isArray(parsed.classFeature)) features.push(...parsed.classFeature);
        }

        for (const file of fluffFiles) {
            const parsed = JSON.parse(fs.readFileSync(path.join(classesDir, file), 'utf-8')) as ClassesFluffFile;
            if (Array.isArray(parsed.classFluff)) fluffEntries.push(...parsed.classFluff);
        }

        this.featureData = new Map(features.map((feature) => [buildFeatureKey(feature), feature]));
        this.fluffData = new Map(fluffEntries.map((fluff) => [`${fluff.name}|${fluff.source}`, fluff]));

        this.log(`Loaded ${classFiles.length} class data files`, 'dim');
        this.log(`Loaded ${classes.length} class entries`, 'dim');
        this.log(`Loaded ${this.featureData.size} class features`, 'dim');
        this.log(`Loaded ${this.fluffData.size} class fluff entries`, 'dim');

        return classes;
    }

    private getFluff(name: string, source: string): FluffClassEntry | undefined {
        return this.fluffData.get(`${name}|${source}`);
    }

    private getFeature(lookup: ClassFeatureLookup): FiveEToolsClassFeature | undefined {
        return this.featureData.get(buildLookupKey(lookup));
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

        const translatedTraits: ProcessingClassTrait[] = [];
        for (const ref of cls.classFeatures ?? []) {
            const lookup = parseClassFeatureRef(ref, cls.source);
            if (!lookup) continue;
            const feature = this.getFeature(lookup);
            if (!feature?.entries?.length) continue;

            const featureDescription = buildDescriptionHtml(feature.entries);
            if (!featureDescription) continue;

            const { name: traitName, description: traitDescription } = await this.translateItem(
                feature.name,
                featureDescription,
            );

            translatedTraits.push({
                level: feature.level,
                description: convertFeetToMeters(traitDescription),
                name: traitName,
                originalName: feature.name,
            });
        }

        const { skillCount, availableSkills } = mapSkills(cls.startingProficiencies?.skills);

        return {
            name,
            originalName: cls.name,
            image: buildFluffImageUrl(fluff),
            description: convertFeetToMeters(description),
            source: formatSource(cls.source, cls.page),
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
            traits: translatedTraits,
        };
    }

    protected override async afterReview(
        output: CreateClassInput,
        isDryRun: boolean,
    ): Promise<CreateClassInput> {
        if (isDryRun) return output;

        await dbConnect();
        const traits = await this.resolveTraits(output.traits ?? [], output.name, output.source ?? '');
        return { ...output, traits };
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
                term.dim('  → Nenhum resultado encontrado. Será criada.\n');
                const created = await Trait.create({
                    name: traitName,
                    originalName,
                    description: trait.description,
                    source: classSource,
                    status: 'active',
                });
                const traitId = String(created._id);
                term.green(`  ✓ Criada: "${traitName}" (${traitId})\n`);
                resolved.push({ level: trait.level, description: buildMentionHtml(traitId, traitName) });
                continue;
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
                const created = await Trait.create({
                    name: classSpecificName,
                    originalName,
                    description: trait.description,
                    source: classSource,
                    status: 'active',
                });
                const traitId = String(created._id);
                term.green(`  ✓ Criada: "${classSpecificName}" (${traitId})\n`);
                resolved.push({ level: trait.level, description: buildMentionHtml(traitId, classSpecificName) });
            } else {
                const picked = topResults[choice - 1];
                const traitId = String(picked._id);
                term.green(`  ✓ Usando existente: "${picked.name}" (${traitId})\n`);
                resolved.push({ level: trait.level, description: buildMentionHtml(traitId, picked.name) });
            }
        }

        term.bold('────────────────────────────────────────────────────────────\n');
        return resolved;
    }

    protected override applyGlossaryToOutput(output: CreateClassInput, entries: GlossaryEntry[]): CreateClassInput {
        const base = super.applyGlossaryToOutput(output, entries);
        const stripName = (s: string): string =>
            s.replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, '').trim();

        return {
            ...base,
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

        const doc = await CharacterClass.findOne({ $or: orClauses }).lean();
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
            subclasses: existing.subclasses ?? [],
            traits: (existing.traits ?? []).map((trait) => ({
                _id: trait._id ? String(trait._id) : undefined,
                level: trait.level,
                description: trait.description,
            })),
            progressionTable: existing.progressionTable,
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
        await CharacterClass.findOneAndUpdate(
            { $or: orClauses },
            { $set: cls },
            { runValidators: true },
        );
    }

    override getItemLabel(item: CreateClassInput): string {
        return item.name;
    }
}
