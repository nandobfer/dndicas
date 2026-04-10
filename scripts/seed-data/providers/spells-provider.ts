/**
 * @fileoverview SpellsProvider — seeds spells from 5etools PHB data.
 *
 * Reads: src/lib/5etools-data/spells-phb.json
 * Creates: Spell documents via spells-service
 *
 * Flow per item:
 *  1. Map deterministic fields (school, circle, components, castingTime, dice, etc.)
 *  2. Call this.translateItem(name, description) defined in BaseProvider
 *  3. Check if spell with that name already exists
 *  4. If not, create it
 */

import mongoose from 'mongoose';
import { BaseProvider, convertFeetToMeters, formatSource } from '../base-provider';
import type { CreateSpellInput } from '../../../src/features/spells/types/spells.types';
import { createSpell } from '../../../src/features/spells/api/spells-service';
import { Spell } from '../../../src/features/spells/models/spell';
import dbConnect from '../../../src/core/database/db';

// ─── 5etools input types ─────────────────────────────────────────────────────

interface FiveEToolsTime {
    number: number;
    unit: string;
    condition?: string;
}

interface FiveEToolsRange {
    type: string;
    distance?: {
        type: string;
        amount?: number;
    };
}

interface FiveEToolsComponents {
    v?: boolean;
    s?: boolean;
    m?: boolean | string;
}

interface FiveEToolsDuration {
    type: string;
    concentration?: boolean;
    duration?: {
        type: string;
        amount?: number;
    };
}

interface FiveEToolsEntriesHigherLevel {
    type: string;
    name: string;
    entries: string[];
}

export interface FiveEToolsSpell {
    name: string;
    source: string;
    page?: number;
    level: number;
    school: string;
    time: FiveEToolsTime[];
    range: FiveEToolsRange;
    components: FiveEToolsComponents;
    duration: FiveEToolsDuration[];
    entries: (string | Record<string, unknown>)[];
    entriesHigherLevel?: FiveEToolsEntriesHigherLevel[];
    savingThrow?: string[];
    meta?: { ritual?: boolean };
    damageInflict?: string[];
    scalingLevelDice?: unknown;
}

// ─── Mapping tables ───────────────────────────────────────────────────────────

const SCHOOL_MAP: Record<string, CreateSpellInput['school']> = {
    A: 'Abjuração',
    C: 'Conjuração',
    D: 'Adivinhação',
    E: 'Encantamento',
    V: 'Evocação',
    I: 'Ilusão',
    N: 'Necromancia',
    T: 'Transmutação',
};

const SAVE_ATTRIBUTE_MAP: Record<string, NonNullable<CreateSpellInput['saveAttribute']>> = {
    strength: 'Força',
    dexterity: 'Destreza',
    constitution: 'Constituição',
    intelligence: 'Inteligência',
    wisdom: 'Sabedoria',
    charisma: 'Carisma',
};

const DURATION_TYPE_LABELS: Record<string, string> = {
    round: 'rodada',
    rounds: 'rodadas',
    minute: 'minuto',
    minutes: 'minutos',
    hour: 'hora',
    hours: 'horas',
    day: 'dia',
    days: 'dias',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** D&D standard: 5 ft = 1.5 m → multiply by 0.3 */
function feetToMeters(feet: number): string {
    const m = feet * 0.3;
    return Number.isInteger(m) ? String(m) : m.toFixed(1).replace('.', ',');
}

/** 1 mile = 1.5 km (consistent with 5 ft = 1.5 m) */
function milesToKm(miles: number): string {
    const km = miles * 1.5;
    return Number.isInteger(km) ? String(km) : km.toFixed(1).replace('.', ',');
}

const DICE_REGEX = /\{@(?:damage|hit)\s+(\d+)d(\d+)(?:[^}]*)?\}/;
const SCALE_DICE_REGEX = /\{@scaledamage\s+[^|]*\|[^|]*\|(\d+)d(\d+)\}/;
const VALID_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

function extractBaseDice(entries: (string | Record<string, unknown>)[]): CreateSpellInput['baseDice'] {
    for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        const match = entry.match(DICE_REGEX);
        if (match && VALID_DICE.includes(`d${match[2]}`)) {
            return {
                quantidade: parseInt(match[1], 10),
                tipo: `d${match[2]}` as NonNullable<CreateSpellInput['baseDice']>['tipo'],
            };
        }
    }
    return undefined;
}

function extractExtraDicePerLevel(
    entries: (string | Record<string, unknown>)[],
    higherLevel?: FiveEToolsEntriesHigherLevel[],
): CreateSpellInput['extraDicePerLevel'] {
    const allEntries = [
        ...entries.filter((e): e is string => typeof e === 'string'),
        ...(higherLevel?.flatMap((h) => h.entries) ?? []),
    ];
    for (const entry of allEntries) {
        const match = entry.match(SCALE_DICE_REGEX);
        if (match && VALID_DICE.includes(`d${match[2]}`)) {
            return {
                quantidade: parseInt(match[1], 10),
                tipo: `d${match[2]}` as NonNullable<CreateSpellInput['extraDicePerLevel']>['tipo'],
            };
        }
    }
    return undefined;
}

function mapCastingTime(spell: FiveEToolsSpell): CreateSpellInput['castingTime'] {
    if (spell.meta?.ritual) return 'Ritual';
    switch (spell.time[0]?.unit) {
        case 'action':   return 'Ação';
        case 'bonus':    return 'Ação Bônus';
        case 'reaction': return 'Reação';
        default:         return undefined;
    }
}

function mapComponents(spell: FiveEToolsSpell): CreateSpellInput['component'] {
    const comps: CreateSpellInput['component'] = [];
    if (spell.components.v) comps.push('Verbal');
    if (spell.components.s) comps.push('Somático');
    if (spell.components.m) comps.push('Material');
    if (spell.duration.some((d) => d.concentration === true)) comps.push('Concentração');
    return comps;
}

function mapRange(range: FiveEToolsRange): string | undefined {
    if (range.type === 'self')      return 'Pessoal';
    if (range.type === 'touch')     return 'Toque';
    if (range.type === 'sight')     return 'Linha de visão';
    if (range.type === 'unlimited') return 'Ilimitado';
    if (range.distance?.amount !== undefined) {
        const { type, amount } = range.distance;
        if (type === 'feet')  return `${feetToMeters(amount)} metros`;
        if (type === 'miles') return `${milesToKm(amount)} km`;
        return `${amount} ${type}`;
    }
    return undefined;
}

function mapDuration(durations: FiveEToolsDuration[]): string | undefined {
    if (!durations.length) return undefined;
    const d = durations[0];
    if (d.type === 'instant')   return 'Instantâneo';
    if (d.type === 'permanent') return 'Permanente';
    if (d.type === 'special')   return 'Especial';
    if (d.type === 'timed' && d.duration) {
        const amount = d.duration.amount ?? 1;
        const unit = DURATION_TYPE_LABELS[d.duration.type] ?? d.duration.type;
        const prefix = d.concentration ? 'Concentração, até ' : '';
        return `${prefix}${amount} ${amount === 1 ? unit : unit + 's'}`.replace(/ss$/, 's');
    }
    return undefined;
}

/** Strip 5etools inline tag syntax from entry text before sending to AI. */
function cleanEntryText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, '$2')
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        .replace(/\{@hit\s+([^}]+)\}/g, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/g, 'DC $1')
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
        .trim();
}

/** Build an HTML description in English from the spell entries, ready for translation. */
function buildEntriesHtml(spell: FiveEToolsSpell): string {
    const parts: string[] = [];

    for (const entry of spell.entries) {
        if (typeof entry === 'string') {
            parts.push(`<p>${cleanEntryText(entry)}</p>`);
        } else if (typeof entry === 'object' && entry !== null) {
            const e = entry as { type?: string; name?: string; entries?: string[] };
            if (e.entries) {
                const texts = e.entries
                    .filter((s): s is string => typeof s === 'string')
                    .map(cleanEntryText);
                if (e.name) {
                    parts.push(`<p><strong>${e.name}.</strong> ${texts.join(' ')}</p>`);
                } else {
                    texts.forEach((t) => parts.push(`<p>${t}</p>`));
                }
            }
        }
    }

    if (spell.entriesHigherLevel) {
        for (const section of spell.entriesHigherLevel) {
            const text = section.entries.map(cleanEntryText).join(' ');
            parts.push(`<p><strong>At Higher Levels.</strong> ${text}</p>`);
        }
    }

    return parts.join('');
}

// ─── SpellsProvider ───────────────────────────────────────────────────────────

export class SpellsProvider extends BaseProvider<FiveEToolsSpell, CreateSpellInput> {
    readonly name = 'Spells';
    readonly dataFilePath = 'src/lib/5etools-data/spells-xphb.json';
    readonly dataKey = 'spell';

    async processItem(spell: FiveEToolsSpell): Promise<CreateSpellInput | null> {
        const school = SCHOOL_MAP[spell.school];
        if (!school) {
            this.log(`Unknown school code "${spell.school}" for spell "${spell.name}" — skipping`, 'warn');
            return null;
        }

        // Translate name + description via the configured translator
        const entriesHtml = buildEntriesHtml(spell);
        const { name, description } = await this.translateItem(spell.name, entriesHtml);

        // Deterministic field mapping (no AI needed)
        return {
            name,
            originalName: spell.name,
            description,
            circle: spell.level,
            school,
            castingTime: mapCastingTime(spell),
            component: mapComponents(spell),
            range: mapRange(spell.range),
            duration: mapDuration(spell.duration),
            saveAttribute: spell.savingThrow?.[0]
                ? SAVE_ATTRIBUTE_MAP[spell.savingThrow[0]]
                : undefined,
            baseDice: extractBaseDice(spell.entries),
            extraDicePerLevel: extractExtraDicePerLevel(spell.entries, spell.entriesHigherLevel),
            source: formatSource(spell.source, spell.page),
            status: 'active',
        };
    }

    async findExisting(spell: CreateSpellInput): Promise<CreateSpellInput | null> {
        await dbConnect();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`^${escape(spell.name)}$`, 'i');
        const orClauses: Record<string, unknown>[] = [{ name: nameRegex }];
        if (spell.originalName) {
            orClauses.push({ originalName: new RegExp(`^${escape(spell.originalName)}$`, 'i') });
        }
        const doc = await Spell.findOne({ $or: orClauses }).lean();
        if (!doc) return null;
        return {
            name: doc.name,
            originalName: doc.originalName ?? undefined,
            description: doc.description,
            circle: doc.circle,
            school: doc.school,
            castingTime: doc.castingTime,
            component: doc.component,
            range: doc.range ?? undefined,
            area: doc.area ?? undefined,
            duration: doc.duration ?? undefined,
            saveAttribute: doc.saveAttribute ?? undefined,
            baseDice: doc.baseDice ?? undefined,
            additionalBaseDice: doc.additionalBaseDice ?? undefined,
            extraDicePerLevel: doc.extraDicePerLevel ?? undefined,
            additionalExtraDicePerLevel: doc.additionalExtraDicePerLevel ?? undefined,
            image: doc.image ?? undefined,
            source: doc.source ?? undefined,
            status: doc.status,
        };
    }

    async update(spell: CreateSpellInput): Promise<void> {
        await dbConnect();
        const nameRegex = new RegExp(`^${spell.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        await Spell.findOneAndUpdate(
            { name: nameRegex },
            { $set: spell },
            { runValidators: true },
        );
    }

    async create(spell: CreateSpellInput): Promise<void> {
        await createSpell(spell, 'seed-script');
    }

    override getItemLabel(item: CreateSpellInput): string {
        return item.name;
    }
}
