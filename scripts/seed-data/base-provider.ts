/**
 * @fileoverview Abstract base class for all seed data providers.
 *
 * Each provider reads a 5etools JSON file, translates items via a pluggable
 * translator, checks for duplicates, and creates records in the system.
 *
 * Usage:
 *   class MyProvider extends BaseProvider<TInput, TOutput> { ... }
 *
 * ---------------------------------------------------------------------------
 * IMAGENS DO 5ETOOLS
 * ---------------------------------------------------------------------------
 * Os JSONs do 5etools NÃO contêm URLs de imagem diretamente. Em vez disso,
 * usam a flag booleana `hasFluffImages: true` para indicar que existe imagem
 * disponível externamente.
 *
 * Para exibir a imagem na UI, buscar via:
 *   https://5e.tools/img/{source}/{name}.webp
 *   (ex: https://5e.tools/img/MPMM/Aarakocra.webp)
 *
 * Cobertura por tipo de entidade:
 *   - Classes  : ~93% têm imagem (14 de 15 classes)
 *   - Raças    : ~84% têm imagem (133 de 158 raças)
 *   - Itens    : ~31% têm imagem (764 de 2451 itens)
 *   - Base items: ~28% têm imagem (55 de 196 itens)
 *   - Feats    : ~11% têm imagem (29 de 265 feats)
 *   - Spells   : ~3%  têm imagem (12 de 361 spells)
 *
 * Ao implementar, verificar `hasFluffImages === true` antes de tentar
 * carregar a imagem para evitar requisições desnecessárias.
 * ---------------------------------------------------------------------------
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

export interface DiffEntry {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}

function formatValue(v: unknown): string {
    if (v === undefined) return '(não definido)';
    if (v === null) return '(nulo)';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
}

// ─── Colored JSON printer (red variant for originals) ─────────────────────────

/**
 * Prints a syntax-highlighted JSON representation of `obj` to the terminal.
 *
 * Color scheme:
 *   - Keys        → yellow
 *   - Strings     → green
 *   - Numbers     → cyan
 *   - Booleans    → blue
 *   - null        → gray
 *   - Brackets    → bold white
 *   - Punctuation → default
 */
function printColoredJson(obj: unknown): void {
    const str = JSON.stringify(obj, null, 2);
    // Tokenize: quoted strings (optionally followed by ": "), numbers,
    // keywords, brackets, punctuation, and whitespace.
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]|\n|[^\S\n]+/g;

    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
        const tok = m[0];
        const quotedStr = m[1];
        const colonSuffix = m[2];

        if (quotedStr !== undefined) {
            if (colonSuffix !== undefined) {
                term.yellow(quotedStr);
                term(colonSuffix);
            } else {
                term.cyan(quotedStr);
            }
        } else if (tok === 'true' || tok === 'false') {
            term.blue(tok);
        } else if (tok === 'null') {
            term.gray(tok);
        } else if (tok === '{' || tok === '}' || tok === '[' || tok === ']') {
            term.bold.white(tok);
        } else if (/^-?\d/.test(tok)) {
            term.green(tok);
        } else {
            term(tok);
        }
    }
}

/** Prints all values in uniform light red (for original EN object display). */
function printRedJson(obj: unknown): void {
    term.brightRed(JSON.stringify(obj, null, 2));
}

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
    private fromStart = false;
    private fromIndex: number | null = null;

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

    setFromStart(enabled: boolean): void {
        this.fromStart = enabled;
    }

    setFromIndex(index: number): void {
        this.fromIndex = index;
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

    // ─── Diff helpers ─────────────────────────────────────────────────────────

    /**
     * Normalizes a value before diff comparison.
     * Empty arrays, empty strings, and null are treated as equivalent to
     * undefined because the DB may return null/""/[] for unset fields while
     * incoming data uses undefined, and semantically they mean "not set".
     */
    private normalizeForDiff(v: unknown): unknown {
        if (v === null) return undefined;
        if (v === '') return undefined;
        if (Array.isArray(v) && v.length === 0) return undefined;
        return v;
    }

    private diffObjects(existing: TOutput, incoming: TOutput): DiffEntry[] {
        const a = existing as Record<string, unknown>;
        const b = incoming as Record<string, unknown>;
        const allFields = new Set([...Object.keys(a), ...Object.keys(b)]);
        const diffs: DiffEntry[] = [];
        for (const field of allFields) {
            const normA = this.normalizeForDiff(a[field]);
            const normB = this.normalizeForDiff(b[field]);
            if (JSON.stringify(normA) !== JSON.stringify(normB)) {
                diffs.push({ field, oldValue: a[field], newValue: b[field] });
            }
        }
        return diffs;
    }

    /**
     * Prints a notice when the `findExisting` match was driven by `originalName`
     * rather than `name`. Detects this by comparing both names case-insensitively:
     * if they differ, the DB record was found via its English original name.
     */
    private logOriginalNameMatchIfNeeded(existing: TOutput, incoming: TOutput): void {
        const existingObj = existing as Record<string, unknown>;
        const incomingObj = incoming as Record<string, unknown>;
        const existingName = String(existingObj['name'] ?? '').toLowerCase();
        const incomingName = String(incomingObj['name'] ?? '').toLowerCase();
        if (existingName !== incomingName) {
            const originalName = String(incomingObj['originalName'] ?? '');
            term.cyan(`  ℹ Correspondência pelo nome original em inglês ("${originalName}") — o item já existe no banco com nome traduzido diferente.\n`);
        }
    }

    /**
     * Shows each conflicting field individually and lets the user decide
     * field by field whether to keep the existing value (←) or use the
     * incoming one (→). Works identically in dry-run and live mode.
     *
     * @returns A merged TOutput built from existing + chosen incoming fields,
     *          or null if the user pressed ESC to skip the item entirely.
     */
    private async resolveConflictsFieldByField(
        existing: TOutput,
        incoming: TOutput,
        diffs: DiffEntry[],
    ): Promise<TOutput | null> {
        const label = this.getItemLabel(incoming);
        term('\n');
        term.bold(`─── Conflito: ${label} ─────────────────────────────────────────\n`);
        term.yellow(`  ${diffs.length} campo(s) diferente(s) — resolva cada um:\n\n`);

        const result = { ...(existing as Record<string, unknown>) };

        for (const diff of diffs) {
            term.bold(`  ${diff.field}:\n`);
            term.red(`    ← (existente)\n`);
            term.red(`      ${formatValue(diff.oldValue)}\n`);
            term.green(`    → (novo)\n`);
            term.green(`      ${formatValue(diff.newValue)}\n`);
            term.bold('  ← seta esquerda: manter existente  |  → seta direita: usar novo  |  ESC para pular\n');

            const choice = await new Promise<'keep' | 'update' | 'escape'>((resolve) => {
                term.grabInput(true);
                const handler = (name: string) => {
                    if (name === 'CTRL_C') { term.grabInput(false); process.exit(0); }
                    if (name === 'LEFT') {
                        term.grabInput(false);
                        term.removeListener('key', handler);
                        term.yellow('  ← Mantendo existente.\n\n');
                        resolve('keep');
                    } else if (name === 'RIGHT') {
                        term.grabInput(false);
                        term.removeListener('key', handler);
                        term.green('  → Usando novo.\n\n');
                        resolve('update');
                    } else if (name === 'ESCAPE') {
                        term.grabInput(false);
                        term.removeListener('key', handler);
                        term.yellow('  ⏭  Item pulado via ESC.\n');
                        resolve('escape');
                    }
                };
                term.on('key', handler);
            });

            if (choice === 'escape') return null;
            if (choice === 'update') {
                result[diff.field] = diff.newValue;
            }
        }

        return result as TOutput;
    }



    /**
     * Applies the current glossary to all string fields of an output object.
     * Only processes `name` and `description` fields (both are translatable text).
     */
    protected applyGlossaryToOutput(output: TOutput, entries: GlossaryEntry[]): TOutput {
        const obj = output as Record<string, unknown>;
        const result = { ...obj };

        // Always strip leading/trailing punctuation/quote artifacts from the name,
        // regardless of whether there are glossary entries (AI sometimes wraps names in quotes)
        if (typeof result['name'] === 'string') {
            result['name'] = (result['name'] as string).replace(/^[\s.,;:!?"']+|[\s.,;:!?"']+$/g, '').trim();
        }

        if (!entries.length) return result as TOutput;

        if (typeof result['name'] === 'string') {
            result['name'] = applyGlossary(entries, result['name'] as string);
        }
        if (typeof result['description'] === 'string') {
            result['description'] = applyGlossary(entries, result['description']);
        }

        return result as TOutput;
    }

    // ─── Interactive review ───────────────────────────────────────────────────

    /**
     * Shows the current item and prompts the user for glossary corrections.
     * Loops until the user presses Enter with no input (confirm) or ESC (skip).
     *
     * @param output - The translated item to review
     * @param isDryRun - If true, will not save to database
     * @returns The final (possibly corrected) output, or null if the user pressed ESC to skip
     */
    private async reviewAndConfirmItem(
        output: TOutput,
        isDryRun: boolean,
        originalItem?: unknown,
    ): Promise<TOutput | null> {
        let entries = await loadAllEntries();
        let current = this.applyGlossaryToOutput(output, entries);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            // Display current state
            term('\n');
            if (originalItem !== undefined) {
                term.bold('─── Original (EN) ──────────────────────────────────────────\n');
                printRedJson(originalItem);
                term('\n');
            }
            term.bold('─── Resultado ─────────────────────────────────────────────\n');
            printColoredJson(current);
            term('\n');
            term.bold('────────────────────────────────────────────────────────────\n');

            if (isDryRun) {
                term.yellow('  (modo dry-run — não será salvo no banco)\n');
            }

            term('\n');
            term.cyan('Glossário ');
            term.gray('(formato: "termo > tradução ; outro > outro" — vazio para confirmar, ESC para pular)');
            term.cyan(': ');

            // value is undefined when ESC is pressed; empty string when Enter with no text
            const input = await new Promise<string | null>((resolve) => {
                term.inputField({ cancelable: true }, (_, value) => {
                    term('\n');
                    resolve(value === undefined ? null : value.trim());
                });
            });

            // ESC = skip this item entirely
            if (input === null) {
                term.yellow('  ⏭  Item pulado.\n');
                return null;
            }

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
        const startIndex = this.testMode ? 0
            : this.fromIndex !== null ? this.fromIndex
            : this.fromStart ? 0
            : (await this.readProgress()) + 1;

        this.log(`Total items: ${items.length}`, 'dim');

        if (!this.testMode && startIndex >= items.length) {
            this.log(`All ${items.length} items already processed. Use --reset-progress to restart.`, 'warn');
            return;
        }

        if (this.testMode) {
            this.log(`\n🧪 TEST MODE: Finding first processable item...`, 'info');
            const limit = Math.min(items.length, 20);
            for (let i = 0; i < limit; i++) {
                const result = await this.runInteractiveItem(items[i], i, true);
                if (result !== 'skipped') break;
                this.log(`  Item ${i} skipped — trying next...`, 'dim');
            }
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

                const exists = await this.findExisting(output);
                if (exists !== null) {
                    this.logOriginalNameMatchIfNeeded(exists, output);
                    const diffs = this.diffObjects(exists, output);
                    if (diffs.length > 0) {
                        this.log(`[${i}] Conflito: ${diffs.length} campo(s) diferente(s) — mantendo existente (use modo interativo para resolver)`, 'warn');
                    } else {
                        this.log(`[${i}] Already exists — skipping`, 'dim');
                    }
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
        let updated = 0;
        let skipped = 0;

        for (let i = startIndex; i < items.length; i++) {
            term('\n');
            term.bold(`─── Item ${i + 1} / ${items.length} ──────────────────────────────────\n`);

            try {
                const result = await this.runInteractiveItem(items[i], i, false);
                if (result === 'created') created++;
                else if (result === 'updated') updated++;
                else skipped++;
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
        term.cyan(`  Updated:  ${updated}\n`);
        term.yellow(`  Skipped:  ${skipped}\n`);
        term(`  Total processed: ${items.length - startIndex}\n`);
        term.bold(`────────────────────────────────────────────────\n`);
    }

    /**
     * Process a single item interactively. Returns 'created', 'updated',
     * 'skipped', or 'exists'. In dry-run/test mode, does not save to DB.
     */
    private async runInteractiveItem(
        item: TInput,
        index: number,
        isDryRun: boolean,
    ): Promise<'created' | 'updated' | 'skipped' | 'exists'> {
        const raw = await this.processItem(item);

        if (raw === null) {
            term.yellow('  ⚠  Item ignorado (processItem retornou null)\n');
            if (!isDryRun) await this.saveProgress(index);
            return 'skipped';
        }

        // Apply glossary silently so findExisting uses the canonicalized name
        // (a previous run may have stored the item with the glossary applied,
        // so searching with the raw AI-translated name could miss it)
        const glossaryEntries = await loadAllEntries();
        const glossarized = this.applyGlossaryToOutput(raw, glossaryEntries);

        // Resolve conflicts field by field BEFORE the glossary review step
        const existing = await this.findExisting(glossarized);
        let working: TOutput = glossarized;

        if (existing) {
            this.logOriginalNameMatchIfNeeded(existing, glossarized);
            const diffs = this.diffObjects(existing, glossarized);
            if (diffs.length > 0) {
                const resolved = await this.resolveConflictsFieldByField(existing, glossarized, diffs);
                if (resolved === null) {
                    if (!isDryRun) await this.saveProgress(index);
                    return 'skipped';
                }
                working = resolved;
            } else if (!isDryRun) {
                term.yellow('  ⚠  Já existe no banco e está igual — ignorando.\n');
                await this.saveProgress(index);
                return 'exists';
            }
        }

        // Interactive review: show result, allow glossary corrections
        const reviewed = await this.reviewAndConfirmItem(working, isDryRun, item);

        // ESC during review = skip without saving
        if (reviewed === null) {
            if (!isDryRun) await this.saveProgress(index);
            return 'skipped';
        }

        // Hook for providers to run post-review steps (e.g. trait resolution)
        let finalOutput = await this.afterReview(reviewed, isDryRun);

        if (isDryRun) {
            term.green('\n✓ Modo dry-run — nenhum dado foi salvo.\n');
            return 'skipped';
        }

        // Re-check existence in case the glossary review changed the item's name
        // (e.g., user maps "Condenar a Maldição" → "Rogar Maldição" which already exists).
        // The pre-review `existing` may be stale if the name changed.
        const nameBeforeReview = this.getItemLabel(glossarized);
        const nameAfterReview = this.getItemLabel(finalOutput);
        let finalExisting = existing;

        if (nameAfterReview !== nameBeforeReview) {
            finalExisting = await this.findExisting(finalOutput);
            if (finalExisting !== null) {
                term.yellow(`  ⚠  O nome foi alterado para "${nameAfterReview}", que já existe no banco. Iniciando resolução de conflito.\n`);
                const conflictDiffs = this.diffObjects(finalExisting, finalOutput);
                if (conflictDiffs.length > 0) {
                    const resolved = await this.resolveConflictsFieldByField(finalExisting, finalOutput, conflictDiffs);
                    if (resolved === null) {
                        await this.saveProgress(index);
                        return 'skipped';
                    }
                    finalOutput = resolved;
                }
            }
        }

        if (finalExisting) {
            const finalDiffs = this.diffObjects(finalExisting, finalOutput);
            if (finalDiffs.length === 0) {
                term.yellow('  ⚠  Resultado igual ao existente — ignorando.\n');
                await this.saveProgress(index);
                return 'exists';
            }
            await this.update(finalOutput);
            term.green('  ✓ Atualizado com sucesso.\n');
            await this.saveProgress(index);
            return 'updated';
        }

        await this.create(finalOutput);
        term.green(`  ✓ Criado com sucesso.\n`);
        await this.saveProgress(index);
        return 'created';
    }

    /**
     * Called after the glossary review step and before saving.
     * Override in subclasses to run additional interactive steps (e.g. trait resolution).
     */
    protected async afterReview(output: TOutput, _isDryRun: boolean): Promise<TOutput> {
        return output;
    }

    // ─── Abstract methods ─────────────────────────────────────────────────────

    /**
     * Map and translate a single 5etools item into the system input format.
     * Return null to skip the item entirely.
     */
    abstract processItem(item: TInput): Promise<TOutput | null>;

    /**
     * Find an existing item in the database that matches the incoming item.
     * Returns the existing item's data (as TOutput) or null if not found.
     *
     * **Important:** name-based lookups must use case-insensitive matching
     * (e.g. MongoDB `$regex` with the `i` flag) to avoid creating duplicates
     * when the translated name differs only in letter casing.
     */
    abstract findExisting(item: TOutput): Promise<TOutput | null>;

    /**
     * Insert the item into the database.
     */
    abstract create(item: TOutput): Promise<void>;

    /**
     * Update an existing item in the database.
     * Override in subclasses that support conflict resolution updates.
     */
    async update(_item: TOutput): Promise<void> {
        this.log('update() not implemented for this provider — skipping.', 'warn');
    }

    /**
     * Return a human-readable label for the progress bar (e.g. spell name).
     * Override in subclasses for better output.
     */
    getItemLabel(item: TOutput): string {
        const obj = item as Record<string, unknown>;
        return String(obj['name'] ?? '');
    }
}

/**
 * Maps 5etools source abbreviations to their full display names.
 * PHB and XPHB map to "LDJ" (the Brazilian Portuguese edition).
 */
const SOURCE_DISPLAY_MAP: Record<string, string> = {
    // Brazilian Portuguese editions
    PHB: 'LDJ',
    XPHB: 'LDJ',

    // Official sourcebooks
    TCE: "Tasha's Cauldron of Everything",
    XGE: "Xanathar's Guide to Everything",
    DMG: "Dungeon Master's Guide",
    MTF: "Mordenkainen's Tome of Foes",
    MPMM: 'Mordenkainen Presents: Monsters of the Multiverse',
    VGM: "Volo's Guide to Monsters",
    FTD: "Fizban's Treasury of Dragons",
    BGG: 'Bigby Presents: Glory of the Giants',
    BMT: 'The Book of Many Things',
    SCC: 'Strixhaven: A Curriculum of Chaos',
    ERLW: 'Eberron: Rising from the Last War',
    EGW: "Explorer's Guide to Wildemount",
    GGR: "Guildmasters' Guide to Ravnica",
    MOT: 'Mythic Odysseys of Theros',
    VRGR: "Van Richten's Guide to Ravenloft",
    WBtW: 'The Wild Beyond the Witchlight',
    AAG: "Astral Adventurer's Guide",
    DSotDQ: 'Dragonlance: Shadow of the Dragon Queen',
    SatO: 'Sigil and the Outlands',
    EEPC: 'Elemental Evil Player Companion',
    AI: 'Acquisitions Incorporated',

    // Homebrew / third-party content in the dataset
    ABH: "Astarion's Book of Hungers",
    EFA: 'Eberron: Forge of the Artificer',
    FRHoF: 'Forgotten Realms: Heroes of Faerûn',
    LFL: 'Lorwyn: First Light',

    // Plane Shift series
    PSA: 'Plane Shift: Amonkhet',
    PSD: 'Plane Shift: Dominaria',
    PSI: 'Plane Shift: Innistrad',
    PSK: 'Plane Shift: Kaladesh',
    PSX: 'Plane Shift: Ixalan',
    PSZ: 'Plane Shift: Zendikar',

    // Standalone supplements
    TTP: 'The Tortle Package',
    LR: 'Locathah Rising',
    OGA: 'One Grung Above',
    AWM: 'Adventure with Muk',
};

/**
 * Returns a formatted source label for display.
 *
 * - PHB / XPHB → "LDJ" (or "LDJ pág. N")
 * - All other sources → full book name (or "Full Name pág. N")
 * - Unknown codes fall back to the raw abbreviation.
 */
export function formatSource(sourceCode: string, page?: number): string {
    const label = SOURCE_DISPLAY_MAP[sourceCode] ?? sourceCode;
    return page !== undefined ? `${label} pág. ${page}` : label;
}

