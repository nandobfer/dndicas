/**
 * @fileoverview Abstract base class for all seed data providers.
 *
 * Each provider reads a 5etools JSON file, translates items via a pluggable
 * translator, checks for duplicates, and creates records in the system.
 *
 * Usage:
 *   class MyProvider extends BaseProvider<TInput, TOutput> { ... }
 */

import fs from 'fs';
import path from 'path';
import terminal from 'terminal-kit';
import type { BaseTranslator } from './translation/base-translator';
import {
    loadAllEntries,
    saveEntries,
    applyGlossary,
    parseGlossaryInput,
    type GlossaryEntry,
} from './glossary/glossary-store';
import {
    readProgress as dbReadProgress,
    saveProgress as dbSaveProgress,
} from './progress/progress-store';

const term = terminal.terminal;

export type LogLevel = 'info' | 'success' | 'error' | 'warn' | 'dim';

const PROJECT_ROOT = path.resolve(__dirname, '../../');

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
    private testMode = false;
    private autoMode = false;

    // ─── Translator ───────────────────────────────────────────────────────────

    private translator: BaseTranslator | null = null;

    setTranslator(translator: BaseTranslator): void {
        this.translator = translator;
    }

    setTestMode(enabled: boolean): void {
        this.testMode = enabled;
    }

    setAutoMode(enabled: boolean): void {
        this.autoMode = enabled;
    }

    /**
     * Translates a D&D item name and pre-built HTML description from English
     * to Brazilian Portuguese via the configured translator.
     */
    async translateItem(
        name: string,
        descriptionHtml: string,
    ): Promise<{ name: string; description: string }> {
        if (!this.translator) {
            throw new Error('No translator configured. Call setTranslator() before running.');
        }
        return this.translator.translateItem(name, descriptionHtml);
    }

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

    async readProgress(): Promise<number> {
        return dbReadProgress(this.name);
    }

    async saveProgress(index: number): Promise<void> {
        await dbSaveProgress(this.name, index);
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

    // ─── Glossary post-processing ─────────────────────────────────────────────

    /**
     * Applies the current glossary to all string fields of an output object.
     * Only processes `name` and `description` fields (both are translatable text).
     */
    private applyGlossaryToOutput(output: TOutput, entries: GlossaryEntry[]): TOutput {
        if (!entries.length) return output;
        const obj = output as Record<string, unknown>;
        const result = { ...obj };

        if (typeof result['name'] === 'string') {
            result['name'] = applyGlossary(entries, result['name']);
        }
        if (typeof result['description'] === 'string') {
            result['description'] = applyGlossary(entries, result['description']);
        }

        return result as TOutput;
    }

    // ─── Interactive review ───────────────────────────────────────────────────

    /**
     * Shows the current item and prompts the user for glossary corrections.
     * Loops until the user presses Enter with no input.
     *
     * @param output - The translated item to review
     * @param isDryRun - If true, will not save to database
     * @returns The final (possibly corrected) output
     */
    private async reviewAndConfirmItem(
        output: TOutput,
        isDryRun: boolean,
    ): Promise<TOutput> {
        let entries = await loadAllEntries();
        let current = this.applyGlossaryToOutput(output, entries);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            // Display current state
            term('\n');
            term.bold('─── Resultado ─────────────────────────────────────────────\n');
            term.cyan(JSON.stringify(current, null, 2));
            term('\n');
            term.bold('────────────────────────────────────────────────────────────\n');

            if (isDryRun) {
                term.yellow('  (modo dry-run — não será salvo no banco)\n');
            }

            term('\n');
            term.cyan('Glossário ');
            term.gray('(formato: "termo > tradução ; outro > outro" — vazio para confirmar)');
            term.cyan(': ');

            const input = await new Promise<string>((resolve) => {
                term.inputField({}, (_, value) => {
                    term('\n');
                    resolve((value ?? '').trim());
                });
            });

            // Empty input = confirm
            if (!input) {
                return current;
            }

            // Parse and validate
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

            // Save new entries to MongoDB
            await saveEntries(newEntries);
            term.green(`  ✓ ${newEntries.length} entrada(s) salva(s) no glossário.\n`);

            // Reload and reapply all entries (including newly saved ones)
            entries = await loadAllEntries();
            current = this.applyGlossaryToOutput(output, entries);
        }
    }

    // ─── Main loop ────────────────────────────────────────────────────────────

    async run(): Promise<void> {
        this.log(`\nStarting provider: ${this.name}`, 'info');

        const items = this.readDataFile();
        const startIndex = this.testMode ? 0 : (await this.readProgress()) + 1;

        this.log(`Total items: ${items.length}`, 'dim');

        if (!this.testMode && startIndex >= items.length) {
            this.log(`All ${items.length} items already processed. Use --reset-progress to restart.`, 'warn');
            return;
        }

        if (this.testMode) {
            this.log(`\n🧪 TEST MODE: Processing only the first item (index 0)`, 'info');
            await this.runInteractiveItem(items[0], 0, true);
            return;
        }

        if (this.autoMode) {
            await this.runAutoLoop(items, startIndex);
        } else {
            await this.runInteractiveLoop(items, startIndex);
        }
    }

    // ─── Auto mode (batch, no confirmation) ──────────────────────────────────

    private async runAutoLoop(items: TInput[], startIndex: number): Promise<void> {
        this.log(
            startIndex > 0
                ? `Resuming from index ${startIndex} (${items.length - startIndex} remaining)`
                : `Starting from the beginning`,
            'dim'
        );

        this.initProgressBar(items.length, startIndex);

        // Load glossary once for the full run
        const entries = await loadAllEntries();
        if (entries.length > 0) {
            this.log(`Glossário carregado: ${entries.length} entrada(s)`, 'dim');
        }

        let created = 0;
        let skipped = 0;

        for (let i = startIndex; i < items.length; i++) {
            const item = items[i];

            try {
                const raw = await this.processItem(item);

                if (raw === null) {
                    this.log(`[${i}] Skipped (processItem returned null)`, 'dim');
                    skipped++;
                    await this.saveProgress(i);
                    this.updateProgressBar(i + 1, '(skipped)');
                    continue;
                }

                // Always apply glossary post-processing
                const output = this.applyGlossaryToOutput(raw, entries);

                const exists = await this.checkExists(output);
                if (exists) {
                    this.log(`[${i}] Already exists — skipping`, 'dim');
                    skipped++;
                } else {
                    await this.create(output);
                    this.log(`[${i}] Created successfully`, 'success');
                    created++;
                }

                await this.saveProgress(i);
                this.updateProgressBar(i + 1, this.getItemLabel(output));
            } catch (err) {
                this.stopProgressBar();
                const message = err instanceof Error ? err.message : String(err);
                this.log(`\nFatal error at index ${i}: ${message}`, 'error');
                this.log(`Script stopped. Fix the issue and re-run — it will resume from index ${i}.`, 'warn');
                throw err;
            }
        }

        this.stopProgressBar();

        term('\n\n');
        term.bold(`─── ${this.name} Summary ───────────────────────────\n`);
        term.green(`  Created:  ${created}\n`);
        term.yellow(`  Skipped:  ${skipped}\n`);
        term(`  Total processed: ${items.length - startIndex}\n`);
        term.bold(`────────────────────────────────────────────────\n`);
    }

    // ─── Interactive mode (one item at a time with review) ────────────────────

    private async runInteractiveLoop(items: TInput[], startIndex: number): Promise<void> {
        this.log(
            startIndex > 0
                ? `Resuming from index ${startIndex} (${items.length - startIndex} remaining)`
                : `Starting from the beginning`,
            'dim'
        );

        let created = 0;
        let skipped = 0;

        for (let i = startIndex; i < items.length; i++) {
            term('\n');
            term.bold(`─── Item ${i + 1} / ${items.length} ──────────────────────────────────\n`);

            try {
                const savedOrSkipped = await this.runInteractiveItem(items[i], i, false);
                if (savedOrSkipped === 'skipped') {
                    skipped++;
                } else {
                    created++;
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.log(`\nFatal error at index ${i}: ${message}`, 'error');
                this.log(`Script stopped. Fix the issue and re-run — it will resume from index ${i}.`, 'warn');
                throw err;
            }
        }

        term('\n\n');
        term.bold(`─── ${this.name} Summary ───────────────────────────\n`);
        term.green(`  Created:  ${created}\n`);
        term.yellow(`  Skipped:  ${skipped}\n`);
        term(`  Total processed: ${items.length - startIndex}\n`);
        term.bold(`────────────────────────────────────────────────\n`);
    }

    /**
     * Process a single item interactively. Returns 'created', 'skipped', or
     * 'exists'. In dry-run/test mode, does not save to DB.
     */
    private async runInteractiveItem(
        item: TInput,
        index: number,
        isDryRun: boolean,
    ): Promise<'created' | 'skipped' | 'exists'> {
        const raw = await this.processItem(item);

        if (raw === null) {
            term.yellow('  ⚠  Item ignorado (processItem retornou null)\n');
            if (!isDryRun) await this.saveProgress(index);
            return 'skipped';
        }

        // Interactive review: show output, allow glossary corrections
        const final = await this.reviewAndConfirmItem(raw, isDryRun);

        if (isDryRun) {
            term.green('\n✓ Modo dry-run — nenhum dado foi salvo.\n');
            return 'skipped';
        }

        const exists = await this.checkExists(final);
        if (exists) {
            term.yellow('  ⚠  Já existe no banco — ignorando.\n');
            await this.saveProgress(index);
            return 'exists';
        }

        await this.create(final);
        term.green(`  ✓ Criado com sucesso.\n`);
        await this.saveProgress(index);
        return 'created';
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

