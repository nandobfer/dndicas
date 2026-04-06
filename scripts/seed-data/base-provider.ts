/**
 * @fileoverview Abstract base class for all seed data providers.
 *
 * Each provider reads a 5etools JSON file, translates items with AI,
 * checks for duplicates, and creates records in the system.
 *
 * Usage:
 *   class MyProvider extends BaseProvider<TInput, TOutput> { ... }
 */

import fs from 'fs';
import path from 'path';
import terminal from 'terminal-kit';
import { generateText } from '../../src/core/ai/genai';

const term = terminal.terminal;

export type LogLevel = 'info' | 'success' | 'error' | 'warn' | 'dim';

const PROGRESS_FILE = path.resolve(__dirname, 'progress.json');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export interface ProgressState {
    [providerName: string]: { lastIndex: number };
}

// ─── Unit conversion ──────────────────────────────────────────────────────────

/**
 * Converts any "X pés", "X feet", "X foot" or "X ft" occurrences in a text
 * to meters using the D&D standard (5 ft = 1.5 m, i.e. × 0.3).
 * Also converts "X mile(s)" to km (1 mile = 1.5 km by the same standard).
 */
export function convertFeetToMeters(text: string): string {
    return text
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:pés?|feet|foot|ft\.?)/gi, (_, numStr: string) => {
            const feet = parseFloat(numStr.replace(',', '.'));
            const meters = feet * 0.3;
            const formatted = Number.isInteger(meters)
                ? String(meters)
                : meters.toFixed(1).replace('.', ',');
            return `${formatted} metros`;
        })
        .replace(/(\d+(?:[.,]\d+)?)\s*(?:milhas?|miles?)/gi, (_, numStr: string) => {
            const miles = parseFloat(numStr.replace(',', '.'));
            const km = miles * 1.5;
            const formatted = Number.isInteger(km)
                ? String(km)
                : km.toFixed(1).replace('.', ',');
            return `${formatted} km`;
        });
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseProvider<TInput, TOutput> {
    abstract readonly name: string;
    abstract readonly dataFilePath: string;
    abstract readonly dataKey: string;

    private progressBar: terminal.Terminal.ProgressBarController | null = null;
    private currentTotal = 0;

    // ─── Data file ───────────────────────────────────────────────────────────

    readDataFile(): TInput[] {
        const fullPath = path.resolve(PROJECT_ROOT, this.dataFilePath);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const items = parsed[this.dataKey];
        if (!Array.isArray(items)) {
            throw new Error(`Key "${this.dataKey}" not found or not an array in ${fullPath}`);
        }
        return items as TInput[];
    }

    // ─── Progress tracking ────────────────────────────────────────────────────

    readProgress(): number {
        try {
            if (!fs.existsSync(PROGRESS_FILE)) return -1;
            const state: ProgressState = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            return state[this.name]?.lastIndex ?? -1;
        } catch {
            return -1;
        }
    }

    saveProgress(index: number): void {
        let state: ProgressState = {};
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                state = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            }
        } catch {
            // ignore — start fresh
        }
        state[this.name] = { lastIndex: index };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2), 'utf-8');
    }

    // ─── AI translation ───────────────────────────────────────────────────────

    /**
     * Translates a D&D item name and plain-text description from English to
     * Brazilian Portuguese using the system's configured AI model.
     *
     * The returned description is formatted as HTML, feet/miles are converted
     * to meters/km, and @mention markers are added by the AI for recognisable
     * D&D game terms (spells, conditions, class features, feats, equipment, etc.)
     *
     * @param name - Item name in English
     * @param descriptionEnglish - Item description in English (plain text)
     * @returns Translated name and HTML description in pt-BR
     */
    async translateItem(
        name: string,
        descriptionEnglish: string,
    ): Promise<{ name: string; description: string }> {
        const prompt = `You are a D&D 5e expert and Brazilian Portuguese translator.
Translate the following D&D 5e item from English to Brazilian Portuguese (pt-BR).

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
  "name": "<translated name in pt-BR>",
  "description": "<full description as HTML in pt-BR>"
}

For the description HTML:
- Use <p> tags for each paragraph.
- Preserve section sub-headers as <p><strong>Header.</strong> Text...</p>.
- If there is an "At Higher Levels" section, render it as:
  <p><strong>Em Níveis Superiores.</strong> Text here...</p>
- Keep dice notation as plain text (e.g. 8d6, 1d4+1).
- Do NOT convert distances — keep the original feet/miles values. They will be converted separately.

═══ INPUT ═══
Name (English): ${name}

Description (English, plain text):
${descriptionEnglish}`;

        const aiResponse = await generateText(prompt);

        // Strip optional markdown code fence the model may add
        const clean = aiResponse
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/, '')
            .trim();

        let translated: { name: string; description: string };
        try {
            translated = JSON.parse(clean);
        } catch {
            throw new Error(
                `AI returned invalid JSON for "${name}": ${aiResponse.slice(0, 300)}`,
            );
        }

        if (!translated.name || !translated.description) {
            throw new Error(`AI response missing name or description for "${name}"`);
        }

        return {
            name: translated.name,
            description: convertFeetToMeters(translated.description),
        };
    }

    // ─── Terminal UI ──────────────────────────────────────────────────────────

    log(message: string, level: LogLevel = 'info'): void {
        switch (level) {
            case 'success':
                term.green(`✓ ${message}\n`);
                break;
            case 'error':
                term.red(`✗ ${message}\n`);
                break;
            case 'warn':
                term.yellow(`⚠ ${message}\n`);
                break;
            case 'dim':
                term.gray(`  ${message}\n`);
                break;
            case 'info':
            default:
                term.cyan(`ℹ ${message}\n`);
                break;
        }
    }

    initProgressBar(total: number, startIndex: number): void {
        this.currentTotal = total;
        term('\n');
        this.progressBar = term.progressBar({
            width: 60,
            title: `${this.name}:`,
            eta: true,
            percent: true,
            items: total,
        });
        if (startIndex > 0) {
            this.progressBar.update({ progress: startIndex / total });
        }
    }

    updateProgressBar(current: number, itemName: string): void {
        if (!this.progressBar) return;
        this.progressBar.update({
            progress: current / this.currentTotal,
            title: `${this.name} [${current}/${this.currentTotal}] ${itemName}`,
        });
    }

    stopProgressBar(): void {
        if (this.progressBar) {
            this.progressBar.stop();
            this.progressBar = null;
        }
    }

    // ─── Main loop ────────────────────────────────────────────────────────────

    async run(): Promise<void> {
        this.log(`\nStarting provider: ${this.name}`, 'info');

        const items = this.readDataFile();
        const lastIndex = this.readProgress();
        const startIndex = lastIndex + 1;

        this.log(`Total items: ${items.length}`, 'dim');

        if (startIndex >= items.length) {
            this.log(`All ${items.length} items already processed. Reset progress.json to restart.`, 'warn');
            return;
        }

        this.log(
            startIndex > 0
                ? `Resuming from index ${startIndex} (${items.length - startIndex} remaining)`
                : `Starting from the beginning`,
            'dim'
        );

        this.initProgressBar(items.length, startIndex);

        let created = 0;
        let skipped = 0;

        for (let i = startIndex; i < items.length; i++) {
            const item = items[i];

            try {
                const output = await this.processItem(item);

                if (output === null) {
                    this.log(`[${i}] Skipped (processItem returned null)`, 'dim');
                    skipped++;
                    this.saveProgress(i);
                    this.updateProgressBar(i + 1, '(skipped)');
                    continue;
                }

                const exists = await this.checkExists(output);
                if (exists) {
                    this.log(`[${i}] Already exists — skipping`, 'dim');
                    skipped++;
                } else {
                    await this.create(output);
                    this.log(`[${i}] Created successfully`, 'success');
                    created++;
                }

                this.saveProgress(i);
                this.updateProgressBar(i + 1, this.getItemLabel(output));
            } catch (err) {
                this.stopProgressBar();
                const message = err instanceof Error ? err.message : String(err);
                this.log(`\nFatal error at index ${i}: ${message}`, 'error');
                this.log(`Script stopped. Fix the issue and re-run — it will resume from index ${i}.`, 'warn');
                throw err;
            }

            // Small delay to avoid hammering the AI API
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        this.stopProgressBar();

        term('\n\n');
        term.bold(`─── ${this.name} Summary ───────────────────────────\n`);
        term.green(`  Created:  ${created}\n`);
        term.yellow(`  Skipped:  ${skipped}\n`);
        term(`  Total processed: ${items.length - startIndex}\n`);
        term.bold(`────────────────────────────────────────────────\n`);
    }

    // ─── Abstract methods ─────────────────────────────────────────────────────

    /**
     * Map and translate a single 5etools item into the system input format.
     * Return null to skip the item entirely.
     */
    abstract processItem(item: TInput): Promise<TOutput | null>;

    /**
     * Check if the item already exists in the database.
     */
    abstract checkExists(item: TOutput): Promise<boolean>;

    /**
     * Insert the item into the database.
     */
    abstract create(item: TOutput): Promise<void>;

    /**
     * Return a human-readable label for the progress bar (e.g. spell name).
     * Override in subclasses for better output.
     */
    getItemLabel(item: TOutput): string {
        const obj = item as Record<string, unknown>;
        return String(obj['name'] ?? '');
    }
}
