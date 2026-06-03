/**
 * @fileoverview Seed Artificer Magic Item Plans Trait
 *
 * Reads class-artificer.json, extracts all four "Magic Item Plans" tables from
 * the "Replicate Magic Item" feature, translates them to Brazilian Portuguese
 * using GenAI, and creates or updates a single Trait in MongoDB.
 *
 * The Trait is a reference card for players showing every available plan
 * grouped by minimum Artificer level (2+, 6+, 10+, 14+).
 *
 * Usage:
 *   tsx scripts/seed-artificer-plans.ts
 *
 * Requires: MONGODB_URI and GOOGLE_API_KEY in .env
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';

// Load .env FIRST — must happen before any module that reads env vars at load time
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Dynamic requires ensure dotenv has run before these modules initialize
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GenAITranslator } = require('./seed-data/translation/genai-translator') as typeof import('./seed-data/translation/genai-translator');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Trait } = require('../src/features/traits/database/trait') as typeof import('../src/features/traits/database/trait');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanTableEntry {
    caption: string;
    minLevel: number;
    items: PlanItem[];
    hasWildcard: boolean;
}

interface PlanItem {
    name: string;
    attunement: string;
    isWildcard: boolean;
}

interface FiveEToolsTable {
    type: 'table';
    caption?: string;
    colLabels?: string[];
    rows?: [string, string][];
    footnotes?: string[];
}

interface FiveEToolsEntry {
    type?: string;
    name?: string;
    caption?: string;
    entries?: (string | FiveEToolsEntry)[];
    items?: (string | FiveEToolsEntry)[];
    rows?: unknown[][];
    footnotes?: string[];
    colLabels?: string[];
}

interface ClassFeature {
    name: string;
    source: string;
    className: string;
    level: number;
    entries?: (string | FiveEToolsEntry)[];
}

interface ArtificerJson {
    classFeature?: ClassFeature[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../');

/**
 * Strips 5etools inline tag syntax from item references.
 *
 * - `{@item Alchemy Jug|XDMG}` → `"Alchemy Jug"`
 * - `{@item +1 Shield|XDMG|Shield +1}` → `"Shield +1"` (uses display text)
 * - `{@filter Common magic item...|...}*` → `"Common magic item..."` (wildcard=true)
 */
function parseItemRef(raw: string): PlanItem {
    const isWildcard = raw.includes('*');
    let name: string;

    if (raw.includes('@filter')) {
        // {@filter Description|options...}* → extract description (first segment after tag)
        const filterMatch = raw.match(/\{@filter\s+([^|]+)\|/);
        name = filterMatch?.[1]?.trim() ?? '';
    } else {
        // {@item Name|source|Display Text} → use display text when available
        const itemDisplayMatch = raw.match(/\{@item\s+[^|}]+\|[^|}]*\|([^}]+)\}/);
        if (itemDisplayMatch?.[1]) {
            name = itemDisplayMatch[1].trim();
        } else {
            // {@item Name|source} → use name (first segment)
            name = raw
                .replace(/\{@\w+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
                .replace(/\*/g, '')
                .trim();
        }
    }

    return { name, attunement: '', isWildcard };
}

/** Extracts minimum level from a caption like "Magic Item Plans (Artificer Level 6+)" */
function extractMinLevel(caption: string): number {
    const match = caption.match(/Level\s+(\d+)\+/i);
    return match ? parseInt(match[1], 10) : 0;
}

/** Collects all table-type entries from a nested entry tree */
function collectTables(entries: (string | FiveEToolsEntry)[] | undefined): FiveEToolsTable[] {
    const tables: FiveEToolsTable[] = [];

    const visit = (entry: string | FiveEToolsEntry): void => {
        if (typeof entry === 'string') return;
        if (entry.type === 'table' && entry.caption) {
            tables.push(entry as unknown as FiveEToolsTable);
            return;
        }
        for (const child of entry.entries ?? []) visit(child);
        for (const child of entry.items ?? []) visit(child);
    };

    for (const entry of entries ?? []) visit(entry);
    return tables;
}

// ─── Data extraction ──────────────────────────────────────────────────────────

function extractPlanTables(): PlanTableEntry[] {
    const filePath = path.resolve(PROJECT_ROOT, 'src/lib/5etools-data/classes/class-artificer.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ArtificerJson;

    const replicateFeature = (raw.classFeature ?? []).find(
        (f) => f.name === 'Replicate Magic Item' && f.source === 'EFA' && f.level === 2,
    );

    if (!replicateFeature) {
        throw new Error('Could not find "Replicate Magic Item" feature (EFA, level 2) in class-artificer.json');
    }

    const rawTables = collectTables(replicateFeature.entries);
    const planTables = rawTables.filter((t) => t.caption?.includes('Magic Item Plans'));

    if (planTables.length === 0) {
        throw new Error('No "Magic Item Plans" tables found in the Replicate Magic Item feature');
    }

    return planTables.map((table): PlanTableEntry => {
        const caption = table.caption ?? '';
        const minLevel = extractMinLevel(caption);
        const hasWildcard = (table.footnotes ?? []).some((fn) => fn.includes('multiple times'));

        const items: PlanItem[] = (table.rows ?? []).map((row) => {
            const rawName = String(row[0] ?? '');
            const rawAttunement = String(row[1] ?? '');
            const parsed = parseItemRef(rawName);
            return {
                ...parsed,
                attunement: rawAttunement.trim(),
            };
        });

        return { caption, minLevel, items, hasWildcard };
    });
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildEnglishHtml(tables: PlanTableEntry[]): string {
    const parts: string[] = [];

    parts.push(
        '<p>Reference tables for all Magic Item Plans available via the Artificer\'s '
        + '<strong>Replicate Magic Item</strong> feature, grouped by minimum Artificer level. '
        + 'Items marked with * can be learned multiple times, choosing a different item each time.</p>',
    );

    for (const table of tables) {
        parts.push(`<h3>${table.caption}</h3>`);
        parts.push('<table>');
        parts.push('<thead><tr><th>Magic Item Plan</th><th>Attunement</th></tr></thead>');
        parts.push('<tbody>');

        for (const item of table.items) {
            const displayName = item.isWildcard ? `${item.name} *` : item.name;
            parts.push(`<tr><td>${displayName}</td><td>${item.attunement}</td></tr>`);
        }

        parts.push('</tbody>');
        parts.push('</table>');
    }

    return parts.join('\n');
}

// ─── Database ─────────────────────────────────────────────────────────────────

async function connectDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set. Check your .env file.');
    }
    await mongoose.connect(mongoUri);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('\n🎲 Artificer Plans Trait Seeder\n');

    // 1. Extract plan tables from JSON
    console.log('📖 Reading class-artificer.json...');
    const tables = extractPlanTables();
    const totalItems = tables.reduce((sum, t) => sum + t.items.length, 0);
    console.log(`   Found ${tables.length} plan tables with ${totalItems} total items`);
    for (const table of tables) {
        console.log(`   • ${table.caption} (${table.items.length} items)`);
    }

    // 2. Build English HTML
    console.log('\n🔨 Building HTML content...');
    const englishHtml = buildEnglishHtml(tables);
    console.log(`   Built ${englishHtml.length} chars of HTML`);

    // 3. Translate with GenAI
    console.log('\n🤖 Translating with GenAI...');
    const translator = new GenAITranslator();
    translator.configure({ model: 'gemini-3.1-flash-lite', rpm: 15, rpd: 0 });

    const { name: translatedName, description: translatedDescription } =
        await translator.translateItem('Artificer Plans', englishHtml);

    console.log(`   Translated name: "${translatedName}"`);
    console.log(`   Translated description: ${translatedDescription.length} chars`);

    // 4. Connect to database and upsert Trait
    console.log('\n🗄️  Connecting to database...');
    await connectDatabase();
    console.log('   Connected');

    console.log('\n💾 Upserting Trait...');
    const result = await Trait.findOneAndUpdate(
        { originalName: 'Artificer Plans' },
        {
            $set: {
                name: translatedName,
                originalName: 'Artificer Plans',
                description: translatedDescription,
                source: 'EFA pág. 9',
                status: 'active',
            },
        },
        { upsert: true, new: true, runValidators: true },
    );

    console.log(`   ✓ Upserted Trait: "${result.name}" (_id: ${String(result._id)})`);
    console.log('\n✅ Done!\n');
}

main().catch((err) => {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
}).finally(() => {
    void mongoose.disconnect();
});
