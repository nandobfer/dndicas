/**
 * @fileoverview Interactive terminal search CLI for DnDicas entities.
 *
 * Connects directly to MongoDB, loads all entities into memory, and provides
 * a fuzzy-search interface powered by terminal-kit.
 *
 * Usage:
 *   tsx scripts/search-cli.ts
 *   npm run search-cli
 *
 * Controls:
 *   Type to search · ↑↓ navigate · ESC / Ctrl+C to exit
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import terminal from 'terminal-kit';
import mongoose from 'mongoose';
import { Reference } from '@/core/database/models/reference';
import { Trait } from '@/features/traits/database/trait';
import { Feat } from '@/features/feats/models/feat';
import { Spell } from '@/features/spells/models/spell';
import { CharacterClass } from '@/features/classes/models/character-class';
import { BackgroundModel } from '@/features/backgrounds/models/background';
import { RaceModel } from '@/features/races/models/race';
import { ItemModel } from '@/features/items/database/item';
import { applyFuzzySearch, type UnifiedEntity } from '@/core/utils/search-engine';

const term = terminal.terminal;

// ─── JSON color printer ───────────────────────────────────────────────────────
// Replicates the color scheme from scripts/seed-data/base-provider.ts.
// Works line-by-line so it's compatible with term.moveTo() absolute positioning.
// When highlight=true, chains bgGray on every token for the selected-item background.

function printColoredJsonLine(line: string, highlight: boolean): void {
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]|[^\S\n]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const tok = m[0];
        const quotedStr = m[1];
        const colonSuffix = m[2];
        if (quotedStr !== undefined) {
            if (colonSuffix !== undefined) {
                highlight ? term.bgGray.yellow(quotedStr) : term.yellow(quotedStr);
                highlight ? term.bgGray(colonSuffix) : term(colonSuffix);
            } else {
                highlight ? term.bgGray.cyan(quotedStr) : term.cyan(quotedStr);
            }
        } else if (tok === 'true' || tok === 'false') {
            highlight ? term.bgGray.blue(tok) : term.blue(tok);
        } else if (tok === 'null') {
            highlight ? term.bgGray.gray(tok) : term.gray(tok);
        } else if (tok === '{' || tok === '}' || tok === '[' || tok === ']') {
            highlight ? term.bgGray.bold.white(tok) : term.bold.white(tok);
        } else if (/^-?\d/.test(tok)) {
            highlight ? term.bgGray.green(tok) : term.green(tok);
        } else {
            highlight ? term.bgGray(tok) : term(tok);
        }
    }
}

// ─── Entity loading ───────────────────────────────────────────────────────────

async function loadAllEntities(): Promise<UnifiedEntity[]> {
    const progressBar = term.progressBar({
        width: 60,
        title: 'Carregando entidades:',
        eta: true,
        percent: true,
        items: 8,
    });

    const results: UnifiedEntity[] = [];

    const step = (label: string, current: number) => {
        progressBar.update({ progress: current / 8, title: `Carregando: ${label}` });
    };

    step('Regras', 0);
    const rules = await Reference.find({ status: 'active' }).lean();
    results.push(...rules.map((item: any) => ({
        id: String(item._id),
        _id: String(item._id),
        name: item.name,
        label: item.name,
        type: 'Regra' as const,
        description: item.description,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Habilidades', 1);
    const traits = await Trait.find({ status: 'active' }).lean();
    results.push(...traits.map((item: any) => ({
        id: String(item._id),
        _id: String(item._id),
        name: item.name,
        label: item.name,
        type: 'Habilidade' as const,
        description: item.description,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Talentos', 2);
    const feats = await Feat.find({ status: 'active' }).lean();
    results.push(...feats.map((item: any) => ({
        id: String(item.id || item._id),
        _id: String(item._id),
        name: item.label || item.name,
        label: item.label || item.name,
        type: 'Talento' as const,
        description: item.metadata?.description || item.description,
        source: item.source || item.metadata?.source,
        status: item.status || 'active',
        metadata: item.metadata,
    })));

    step('Magias', 3);
    const spells = await Spell.find({ status: 'active' }).lean();
    results.push(...spells.map((item: any) => ({
        id: String(item.id || item._id),
        _id: String(item._id),
        name: item.label || item.name,
        label: item.label || item.name,
        type: 'Magia' as const,
        description: item.description,
        school: item.school,
        circle: item.circle,
        saveAttribute: item.saveAttribute,
        component: item.component,
        baseDice: item.baseDice,
        extraDicePerLevel: item.extraDicePerLevel,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Classes', 4);
    const classes = await CharacterClass.find({ status: 'active' }).lean();
    results.push(...classes.map((item: any) => ({
        id: String(item.id || item._id),
        _id: String(item._id),
        name: item.label || item.name,
        label: item.label || item.name,
        type: 'Classe' as const,
        description: item.description,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Origens', 5);
    const backgrounds = await BackgroundModel.find({ status: 'active' }).lean();
    results.push(...backgrounds.map((item: any) => ({
        id: String(item.id || item._id),
        _id: String(item._id),
        name: item.label || item.name,
        label: item.label || item.name,
        type: 'Origem' as const,
        description: item.description,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Raças', 6);
    const races = await RaceModel.find({ status: 'active' }).lean();
    results.push(...races.map((item: any) => ({
        id: String(item.id || item._id),
        _id: String(item._id),
        name: item.label || item.name,
        label: item.label || item.name,
        type: 'Raça' as const,
        description: item.description,
        source: item.source,
        status: item.status || 'active',
    })));

    step('Itens', 7);
    const items = await ItemModel.find({ status: 'active' }).lean();
    results.push(...items.map((item: any) => ({
        id: String(item._id || item.id),
        _id: String(item._id),
        name: item.name,
        label: item.name,
        type: 'Item' as const,
        description: item.description,
        image: item.image,
        rarity: item.rarity,
        itemType: item.type,
        price: item.price,
        damageDice: item.damageDice,
        damageType: item.damageType,
        additionalDamage: item.additionalDamage,
        mastery: item.mastery,
        properties: item.properties,
        traits: item.traits,
        isMagic: item.isMagic,
        ac: item.ac,
        acType: item.acType,
        armorType: item.armorType,
        acBonus: item.acBonus,
        attributeUsed: item.attributeUsed,
        source: item.source,
        status: item.status || 'active',
    })));

    progressBar.update({ progress: 1, title: 'Carregado!' });
    progressBar.stop();

    return results;
}

// ─── TUI state ────────────────────────────────────────────────────────────────

let allEntities: UnifiedEntity[] = [];
let query = '';
let cursorPos = 0; // insertion point within query (0 = before first char)
let results: UnifiedEntity[] = [];
let selectedIndex = 0;
// Tracks how many rows were used in the list area on the previous render,
// so we can erase leftover rows when the list shrinks.
let lastListRowCount = 0;

// ─── Word navigation helpers ─────────────────────────────────────────────────

/** Returns the index at the start of the word before `pos`. */
function wordStart(s: string, pos: number): number {
    let i = pos - 1;
    while (i > 0 && s[i - 1] === ' ') i--;  // skip trailing spaces
    while (i > 0 && s[i - 1] !== ' ') i--;  // skip word chars
    return Math.max(0, i);
}

/** Returns the index just past the end of the word after `pos`. */
function wordEnd(s: string, pos: number): number {
    let i = pos;
    while (i < s.length && s[i] === ' ') i++;  // skip leading spaces
    while (i < s.length && s[i] !== ' ') i++;  // skip word chars
    return i;
}

function runSearch(): void {
    if (!query.trim()) {
        results = allEntities.slice(0, 50);
    } else {
        results = applyFuzzySearch(allEntities, query, 50);
    }
    selectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));
    render();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, (s: string) => void> = {
    Regra:      (s) => term.magenta(s),
    Habilidade: (s) => term.cyan(s),
    Talento:    (s) => term.yellow(s),
    Magia:      (s) => term.blue(s),
    Classe:     (s) => term.red(s),
    Origem:     (s) => term.green(s),
    Raça:       (s) => term.brightMagenta(s),
    Item:       (s) => term.brightYellow(s),
};

/**
 * Computes the visible window of result indices to display, keeping
 * `selectedIndex` in view and filling available lines with surrounding items.
 */
function computeWindow(
    total: number,
    selected: number,
    jsonLineCount: number,
    availableLines: number
): { start: number; end: number } {
    if (total === 0) return { start: 0, end: -1 };

    let start = selected;
    let end = selected;
    let usedLines = jsonLineCount;

    let canBefore = selected > 0;
    let canAfter = selected < total - 1;

    while ((canBefore || canAfter) && usedLines < availableLines) {
        if (canBefore && usedLines + 1 <= availableLines) {
            start--;
            usedLines++;
            canBefore = start > 0;
        }
        if (canAfter && usedLines + 1 <= availableLines) {
            end++;
            usedLines++;
            canAfter = end < total - 1;
        }
    }

    return { start, end };
}

function render(): void {
    const W: number = (term as any).width ?? 80;
    const H: number = (term as any).height ?? 30;
    const divider = '─'.repeat(W - 1);

    // Rows available for the results list (top portion of screen).
    // Bottom 4 rows are reserved: divider, status, divider, search input.
    const listRows = Math.max(1, H - 4);

    // Normal row: erase and overwrite in place — no term.clear(), no flicker.
    const writeRow = (row: number, fn: () => void) => {
        term.moveTo(1, row);
        term.eraseLine();
        fn();
    };

    // Highlighted row: fill with bgGray first, reposition, then draw content.
    const writeHighlightedRow = (row: number, fn: () => void) => {
        term.moveTo(1, row);
        term.bgGray(' '.repeat(W));
        term.moveTo(1, row);
        fn();
    };

    // ── Results list (rows 1..listRows) ──────────────────────────────────────
    let currentRow = 1;

    if (results.length === 0) {
        writeRow(1, () => term.brightBlack(`  Nenhum resultado para "${query}"`));
        currentRow = 2;
    } else {
        const selectedEntity = results[selectedIndex];
        const jsonStr = JSON.stringify(selectedEntity ?? {}, null, 2);
        const jsonLines = jsonStr.split('\n');
        const jsonLineCount = jsonLines.length;

        const { start, end } = computeWindow(results.length, selectedIndex, jsonLineCount, listRows);

        for (let i = start; i <= end && currentRow <= listRows; i++) {
            const entity = results[i];
            if (!entity) continue;

            if (i === selectedIndex) {
                for (const jLine of jsonLines) {
                    if (currentRow > listRows) break;
                    writeHighlightedRow(currentRow, () => printColoredJsonLine('  ' + jLine, true));
                    currentRow++;
                }
            } else {
                writeRow(currentRow, () => {
                    const colorFn = TYPE_COLORS[entity.type] ?? ((s: string) => term.white(s));
                    term('  ');
                    colorFn(entity.type);
                    term.white(' | ');
                    term.white(entity.name);
                });
                currentRow++;
            }
        }
    }

    // Erase rows that were used in the previous render but not in this one.
    for (let row = currentRow; row <= lastListRowCount; row++) {
        writeRow(row, () => {});
    }
    lastListRowCount = currentRow - 1;

    // ── Footer (fixed absolute positions) ────────────────────────────────────
    writeRow(H - 3, () => term.brightBlack(divider));

    writeRow(H - 2, () => {
        term.brightBlack('  ↑↓ navegar  ·  Esc limpar  ·  Ctrl+C sair  ·  ');
        term.brightWhite(String(results.length));
        term.brightBlack(` resultado${results.length !== 1 ? 's' : ''}  (total: ${allEntities.length})`);
    });

    writeRow(H - 1, () => term.brightBlack(divider));

    renderInputLine(H);
}

/**
 * Updates only the search input row — fast path for immediate feedback on keypress.
 * Does NOT redraw the results list, so it never flickers the rest of the screen.
 */
function renderInputLine(H?: number): void {
    const row: number = H ?? ((term as any).height ?? 30);
    term.moveTo(1, row);
    term.eraseLine();
    term.bold.white('🔍 Buscar: ');

    const before = query.slice(0, cursorPos);
    const atCursor = query[cursorPos];
    const after = query.slice(cursorPos + 1);

    term.white(before);
    if (atCursor !== undefined) {
        term.inverse(atCursor);
        term.white(after);
    } else {
        // Cursor is at the end of the string
        term.inverse('_');
    }
}

// ─── Keyboard handling ────────────────────────────────────────────────────────

function setupInput(): void {
    term.grabInput(true);

    term.on('key', (name: string, _matches: string[], data: { isCharacter?: boolean }) => {
        switch (name) {
            case 'CTRL_C':
                cleanup();
                process.exit(0);
                return;

            case 'ESCAPE':
                query = '';
                cursorPos = 0;
                selectedIndex = 0;
                results = allEntities.slice(0, 50);
                render();
                return;

            case 'UP':
                selectedIndex = Math.max(0, selectedIndex - 1);
                render();
                return;

            case 'DOWN':
                selectedIndex = Math.min(results.length - 1, selectedIndex + 1);
                render();
                return;

            // ── Cursor movement ────────────────────────────────────────────

            case 'LEFT':
                if (cursorPos > 0) {
                    cursorPos--;
                    renderInputLine();
                }
                return;

            case 'RIGHT':
                if (cursorPos < query.length) {
                    cursorPos++;
                    renderInputLine();
                }
                return;

            case 'CTRL_LEFT':
                cursorPos = wordStart(query, cursorPos);
                renderInputLine();
                return;

            case 'CTRL_RIGHT':
                cursorPos = wordEnd(query, cursorPos);
                renderInputLine();
                return;

            // ── Deletion ───────────────────────────────────────────────────

            case 'BACKSPACE':
                if (cursorPos > 0) {
                    query = query.slice(0, cursorPos - 1) + query.slice(cursorPos);
                    cursorPos--;
                    renderInputLine();
                    runSearch();
                }
                return;

            case 'DELETE':
                if (cursorPos < query.length) {
                    query = query.slice(0, cursorPos) + query.slice(cursorPos + 1);
                    renderInputLine();
                    runSearch();
                }
                return;

            case 'CTRL_BACKSPACE':
            case 'ALT_BACKSPACE': {
                if (cursorPos > 0) {
                    const newPos = wordStart(query, cursorPos);
                    query = query.slice(0, newPos) + query.slice(cursorPos);
                    cursorPos = newPos;
                    renderInputLine();
                    runSearch();
                }
                return;
            }

            // ── Character insertion ────────────────────────────────────────

            default:
                if (data?.isCharacter && name.length === 1) {
                    query = query.slice(0, cursorPos) + name + query.slice(cursorPos);
                    cursorPos++;
                    renderInputLine();
                    runSearch();
                }
        }
    });
}

function cleanup(): void {
    term.grabInput(false);
    term.hideCursor(false);
    term.fullscreen(false);
    void mongoose.disconnect();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    term.clear();
    term.bold.cyan('\n  ⚔️  DnDicas — Busca de Entidades\n\n');

    try {
        term.cyan('  Conectando ao banco de dados...\n');
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error('MONGODB_URI não está definido no .env');
        await mongoose.connect(mongoUri, { bufferCommands: false });
        term.green('  ✓ Conectado!\n\n');

        allEntities = await loadAllEntities();

        term('\n');
        term.green(`  ✓ ${allEntities.length} entidades carregadas!\n\n`);
        term.brightBlack('  Pressione qualquer tecla para iniciar...\n');
        await new Promise<void>((resolve) => {
            term.once('key', () => resolve());
            term.grabInput(true);
        });
        term.grabInput(false);
    } catch (err) {
        term.red(`\n  ✗ Erro ao carregar entidades: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    // Enter fullscreen (alternate buffer) then render
    term.fullscreen(true);
    term.hideCursor(true);
    results = allEntities.slice(0, 50);
    render();

    // Start listening for input
    setupInput();
}

// Handle unhandled rejections gracefully
process.on('unhandledRejection', (reason) => {
    cleanup();
    term.red(`\nErro não tratado: ${reason}\n`);
    process.exit(1);
});

main().catch((err) => {
    term.red(`\nErro fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
