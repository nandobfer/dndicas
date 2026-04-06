/**
 * @fileoverview Dynamic glossary store backed by MongoDB.
 *
 * Stores user-defined translation corrections (e.g. "dexterity → destreza")
 * that are applied as post-processing after each item is translated.
 *
 * Entries are accumulated over time and always applied in full on each item,
 * sorted by `from` length descending to prevent partial replacements.
 *
 * Format for user input:
 *   "dexterity > destreza ; lançamento de salvação > salvaguarda"
 *   Separator between entries: ";"
 *   Separator between from/to: ">"
 */

import path from 'path';
import { execSync } from 'child_process';
import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface GlossaryEntry {
    from: string;
    to: string;
}

interface GlossaryEntryDocument extends GlossaryEntry, Document {}

const GlossaryEntrySchema = new Schema<GlossaryEntryDocument>(
    {
        from: { type: String, required: true, unique: true },
        to: { type: String, required: true },
    },
    {
        timestamps: true,
        collection: 'translation_glossary',
    },
);

let GlossaryEntryModel: Model<GlossaryEntryDocument> | null = null;

function getModel(): Model<GlossaryEntryDocument> {
    if (!GlossaryEntryModel) {
        GlossaryEntryModel = mongoose.models['translation_glossary']
            ? (mongoose.models['translation_glossary'] as Model<GlossaryEntryDocument>)
            : mongoose.model<GlossaryEntryDocument>('translation_glossary', GlossaryEntrySchema);
    }
    return GlossaryEntryModel;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Load all glossary entries from MongoDB. */
export async function loadAllEntries(): Promise<GlossaryEntry[]> {
    const model = getModel();
    const docs = await model.find({}).lean();
    return docs.map((d) => ({ from: d.from, to: d.to }));
}

/** Count the number of glossary entries in MongoDB. */
export async function countEntries(): Promise<number> {
    return getModel().countDocuments();
}

/**
 * Save new glossary entries to MongoDB (upsert by `from`).
 * Entries with the same `from` will be updated.
 */
export async function saveEntries(entries: GlossaryEntry[]): Promise<void> {
    const model = getModel();
    await Promise.all(
        entries.map((entry) =>
            model.updateOne(
                { from: entry.from },
                { $set: { to: entry.to } },
                { upsert: true },
            ),
        ),
    );
}

/** Delete all glossary entries from MongoDB. */
export async function clearAllEntries(): Promise<void> {
    await getModel().deleteMany({});
}

/**
 * Backup the glossary collection using mongodump before clearing.
 * Saves to ./backups/glossary-TIMESTAMP relative to project root.
 *
 * @param mongoUri - MongoDB connection URI from environment
 * @returns Absolute path to the backup directory
 */
export function backupGlossary(mongoUri: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.resolve(__dirname, '../../../backups', `glossary-${timestamp}`);

    execSync(
        `mongodump --uri="${mongoUri}" --collection=translation_glossary --out="${backupDir}"`,
        { stdio: 'pipe' },
    );

    return backupDir;
}

// ─── Application ──────────────────────────────────────────────────────────────

/**
 * Apply glossary entries to a text string.
 * Entries are sorted by `from` length descending (longest-first) to prevent
 * partial replacements (e.g. "saving throw" before "throw").
 * Matching is case-insensitive.
 */
export function applyGlossary(entries: GlossaryEntry[], text: string): string {
    const sorted = [...entries].sort((a, b) => b.from.length - a.from.length);
    let result = text;

    for (const entry of sorted) {
        const regex = new RegExp(escapeRegex(entry.from), 'gi');
        result = result.replace(regex, entry.to);
    }

    return result;
}

// ─── Input parsing ────────────────────────────────────────────────────────────

export interface ParseResult {
    entries: GlossaryEntry[];
    errors: string[];
}

/**
 * Parse user input in the format: "from > to ; from > to"
 * Returns parsed entries and any validation errors.
 */
export function parseGlossaryInput(input: string): ParseResult {
    const entries: GlossaryEntry[] = [];
    const errors: string[] = [];

    const raw = input.trim();
    if (!raw) return { entries, errors };

    const parts = raw.split(';');

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const separatorIndex = trimmed.indexOf('>');
        if (separatorIndex === -1) {
            errors.push(`Entrada inválida (sem ">"): "${trimmed}"`);
            continue;
        }

        const from = trimmed.slice(0, separatorIndex).trim();
        const to = trimmed.slice(separatorIndex + 1).trim();

        if (!from) {
            errors.push(`Termo de origem vazio em: "${trimmed}"`);
            continue;
        }

        if (!to) {
            errors.push(`Tradução vazia em: "${trimmed}"`);
            continue;
        }

        entries.push({ from, to });
    }

    return { entries, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
