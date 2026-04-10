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
 *   Type to search · ↑↓ navigate · Alt+←/→ tabs · Ctrl+N copy name · Ctrl+J copy JSON · Ctrl+K copy id · ESC clear · Ctrl+C exit
 */

import { spawnSync } from 'node:child_process';
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

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
// We use raw ANSI escape codes here instead of terminal-kit chainables because
// terminal-kit's bgColor256() without a text argument sets the bg persistently
// (leaking into subsequent eraseLine calls). Raw codes give us precise control:
// fg-only resets between tokens keep the bg within a line; a full reset at the
// end of each line ensures nothing leaks to normal rows.
const HL_BG        = '\x1b[48;5;235m'; // #262626 — just above pure black
const HL_FG_RESET  = '\x1b[39m';       // reset foreground only (preserves bg)
const HL_FULL_RESET = '\x1b[0m';       // reset everything

// ─── JSON color printer ───────────────────────────────────────────────────────
// Replicates the color scheme from scripts/seed-data/base-provider.ts.
// Works line-by-line so it's compatible with term.moveTo() absolute positioning.
// `highlight=true` is kept as an optional raw-ANSI mode for callers that want
// colored JSON over a filled background.

function printColoredJsonLine(line: string, highlight: boolean): void {
    if (highlight) {
        process.stdout.write(HL_BG);
    }

    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]|[^\S\n]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const tok = m[0];
        const quotedStr = m[1];
        const colonSuffix = m[2];
        if (quotedStr !== undefined) {
            if (colonSuffix !== undefined) {
                if (highlight) {
                    process.stdout.write('\x1b[33m' + quotedStr + HL_FG_RESET + colonSuffix);
                } else {
                    term.yellow(quotedStr);
                    term(colonSuffix);
                }
            } else {
                if (highlight) process.stdout.write('\x1b[36m' + quotedStr + HL_FG_RESET);
                else term.cyan(quotedStr);
            }
        } else if (tok === 'true' || tok === 'false') {
            if (highlight) process.stdout.write('\x1b[34m' + tok + HL_FG_RESET);
            else term.blue(tok);
        } else if (tok === 'null') {
            if (highlight) process.stdout.write('\x1b[90m' + tok + HL_FG_RESET);
            else term.gray(tok);
        } else if (tok === '{' || tok === '}' || tok === '[' || tok === ']') {
            if (highlight) process.stdout.write('\x1b[1;37m' + tok + '\x1b[22m' + HL_FG_RESET);
            else term.bold.white(tok);
        } else if (/^-?\d/.test(tok)) {
            if (highlight) process.stdout.write('\x1b[32m' + tok + HL_FG_RESET);
            else term.green(tok);
        } else {
            if (highlight) process.stdout.write(tok);
            else term(tok);
        }
    }

    if (highlight) {
        process.stdout.write(HL_FULL_RESET);
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
let statusMessage: { text: string; tone: 'info' | 'error' } | null = null;
let statusMessageTimer: NodeJS.Timeout | null = null;
// Tracks how many rows were used in the list area on the previous render,
// so we can erase leftover rows when the list shrinks.
let lastListRowCount = 0;

type EntityTab = {
    label: string;
    type: UnifiedEntity['type'] | null;
};

const TABS: EntityTab[] = [
    { label: 'Tudo', type: null },
    { label: 'Regras', type: 'Regra' },
    { label: 'Classes', type: 'Classe' },
    { label: 'Raças', type: 'Raça' },
    { label: 'Magias', type: 'Magia' },
    { label: 'Itens', type: 'Item' },
    { label: 'Habilidades', type: 'Habilidade' },
    { label: 'Talentos', type: 'Talento' },
    { label: 'Origens', type: 'Origem' },
];

let activeTabIndex = 0;

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

function getActiveTab(): EntityTab {
    return TABS[activeTabIndex] ?? TABS[0];
}

function getTabEntities(): UnifiedEntity[] {
    const activeTab = getActiveTab();
    if (!activeTab.type) {
        return allEntities;
    }

    return allEntities.filter((entity) => entity.type === activeTab.type);
}

function runSearch(): void {
    const items = getTabEntities();

    if (!query.trim()) {
        results = items.slice(0, 50);
    } else {
        results = applyFuzzySearch(items, query, 50);
    }
    selectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));
    render();
}

function getSelectedEntity(): UnifiedEntity | undefined {
    return results[selectedIndex];
}

function writeToClipboard(text: string): void {
    type ClipboardCommand = { command: string; args: string[] };

    const commands: ClipboardCommand[] =
        process.platform === 'darwin'
            ? [{ command: 'pbcopy', args: [] }]
            : process.platform === 'win32'
                ? [{ command: 'clip.exe', args: [] }]
                : process.env.WSL_DISTRO_NAME
                    ? [
                        { command: 'clip.exe', args: [] },
                        { command: 'xclip', args: ['-selection', 'clipboard'] },
                        { command: 'xsel', args: ['--clipboard', '--input'] },
                    ]
                    : process.env.WAYLAND_DISPLAY
                        ? [
                            { command: 'wl-copy', args: [] },
                            { command: 'xclip', args: ['-selection', 'clipboard'] },
                            { command: 'xsel', args: ['--clipboard', '--input'] },
                        ]
                        : [
                            { command: 'xclip', args: ['-selection', 'clipboard'] },
                            { command: 'xsel', args: ['--clipboard', '--input'] },
                        ];

    let lastError: unknown;

    for (const command of commands) {
        const result = spawnSync(command.command, command.args, {
            input: text,
            encoding: 'utf8',
        });

        if (!result.error && result.status === 0) {
            return;
        }

        lastError = result.error ?? new Error(result.stderr?.trim() || `Clipboard command failed: ${command.command}`);
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function setStatusMessage(text: string, tone: 'info' | 'error' = 'info'): void {
    if (statusMessageTimer) {
        clearTimeout(statusMessageTimer);
    }

    statusMessage = { text, tone };
    render();

    statusMessageTimer = setTimeout(() => {
        statusMessage = null;
        statusMessageTimer = null;
        render();
    }, 1800);
}

async function copySelectedName(): Promise<void> {
    const entity = getSelectedEntity();
    if (!entity) {
        setStatusMessage('Nenhum item selecionado', 'error');
        return;
    }

    try {
        writeToClipboard(entity.name);
        setStatusMessage('Nome copiado');
    } catch (error) {
        setStatusMessage(`Falha ao copiar nome: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
}

async function copySelectedJson(): Promise<void> {
    const entity = getSelectedEntity();
    if (!entity) {
        setStatusMessage('Nenhum item selecionado', 'error');
        return;
    }

    try {
        writeToClipboard(JSON.stringify(entity, null, 2));
        setStatusMessage('JSON copiado');
    } catch (error) {
        setStatusMessage(`Falha ao copiar JSON: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
}

async function copySelectedId(): Promise<void> {
    const entity = getSelectedEntity();
    if (!entity) {
        setStatusMessage('Nenhum item selecionado', 'error');
        return;
    }

    try {
        writeToClipboard(entity.id);
        setStatusMessage('Id copiado');
    } catch (error) {
        setStatusMessage(`Falha ao copiar id: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
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

const TAB_ACTIVE_STYLES: Record<string, { bg: string; fg: string }> = {
    Tudo: { bg: '\x1b[48;5;240m', fg: '\x1b[97m' },
    Regra: { bg: '\x1b[45m', fg: '\x1b[97m' },
    Habilidade: { bg: '\x1b[46m', fg: '\x1b[30m' },
    Talento: { bg: '\x1b[43m', fg: '\x1b[30m' },
    Magia: { bg: '\x1b[44m', fg: '\x1b[97m' },
    Classe: { bg: '\x1b[41m', fg: '\x1b[97m' },
    Origem: { bg: '\x1b[42m', fg: '\x1b[30m' },
    Raça: { bg: '\x1b[105m', fg: '\x1b[30m' },
    Item: { bg: '\x1b[103m', fg: '\x1b[30m' },
};

function getActiveTabStyle(tab: EntityTab): { bg: string; fg: string } {
    if (!tab.type) {
        return TAB_ACTIVE_STYLES.Tudo;
    }

    return TAB_ACTIVE_STYLES[tab.type] ?? TAB_ACTIVE_STYLES.Tudo;
}

function getSelectedRowStyle(entity: UnifiedEntity | undefined, activeTab: EntityTab): { bg: string; fg: string } {
    if (activeTab.type) {
        return getActiveTabStyle(activeTab);
    }

    if (entity?.type) {
        return TAB_ACTIVE_STYLES[entity.type] ?? TAB_ACTIVE_STYLES.Tudo;
    }

    return TAB_ACTIVE_STYLES.Tudo;
}

/**
 * Computes the visible window of result indices to display, keeping
 * `selectedIndex` in view and filling available lines with surrounding items.
 */
function computeWindow(
    total: number,
    selected: number,
    selectedLineCount: number,
    availableLines: number
): { start: number; end: number } {
    if (total === 0) return { start: 0, end: -1 };

    let start = selected;
    let end = selected;
    let usedLines = selectedLineCount;

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
    const activeTab = getActiveTab();
    const tabEntities = getTabEntities();
    const listStartRow = 2;
    const listEndRow = H - 4;

    // Rows available for the results list (top portion of screen).
    // Top row is reserved for tabs and bottom 4 rows are reserved:
    // divider, status, divider, search input.
    const listRows = Math.max(1, listEndRow - listStartRow + 1);

    // Normal row: erase and overwrite in place — no term.clear(), no flicker.
    const writeRow = (row: number, fn: () => void) => {
        term.moveTo(1, row);
        term.eraseLine();
        fn();
    };

    // Styled row: fill entire line with the selection bg, reposition, then draw
    // content on top. Resets are explicit to avoid leaking styles.
    const writeStyledRow = (row: number, style: { bg: string; fg: string }, fn: () => void) => {
        term.moveTo(1, row);
        process.stdout.write(style.bg + ' '.repeat(W) + HL_FULL_RESET);
        term.moveTo(1, row);
        process.stdout.write(style.bg + style.fg);
        fn();
        process.stdout.write(HL_FULL_RESET);
    };

    // ── Tabs (row 1) ─────────────────────────────────────────────────────────
    writeRow(1, () => {
        term('  ');
        TABS.forEach((tab, index) => {
            const isActive = index === activeTabIndex;
            if (isActive) {
                const style = getActiveTabStyle(tab);
                process.stdout.write(`${style.bg}${style.fg} ${tab.label} ${HL_FULL_RESET}`);
            } else {
                term.brightBlack(` ${tab.label} `);
            }

            if (index < TABS.length - 1) {
                term.brightBlack(' ');
            }
        });
    });

    // ── Results list (rows 2..H-4) ──────────────────────────────────────────
    let currentRow = listStartRow;

    if (results.length === 0) {
        writeRow(listStartRow, () => {
            const scope = activeTab.label.toLowerCase();
            term.brightBlack(`  Nenhum resultado para "${query}" em ${scope}`);
        });
        currentRow = listStartRow + 1;
    } else {
        const selectedEntity = results[selectedIndex];
        const selectedRowStyle = getSelectedRowStyle(selectedEntity, activeTab);
        const jsonStr = JSON.stringify(selectedEntity ?? {}, null, 2);
        const jsonLines = jsonStr.split('\n');
        const selectedLineCount = 1 + jsonLines.length;

        const { start, end } = computeWindow(results.length, selectedIndex, selectedLineCount, listRows);

        for (let i = start; i <= end && currentRow <= listEndRow; i++) {
            const entity = results[i];
            if (!entity) continue;

            if (i === selectedIndex) {
                writeStyledRow(currentRow, selectedRowStyle, () => {
                    process.stdout.write(`  ${entity.type} | ${entity.name}`);
                });
                currentRow++;

                for (const jLine of jsonLines) {
                    if (currentRow > listEndRow) break;
                    writeRow(currentRow, () => printColoredJsonLine('  ' + jLine, false));
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
        term.brightBlack('  ↑↓ navegar  ·  Alt+←/→ abas  ·  Ctrl+N copiar nome  ·  Ctrl+J copiar JSON  ·  Ctrl+K copiar id  ·  Esc limpar  ·  Ctrl+C sair  ·  ');
        if (statusMessage) {
            if (statusMessage.tone === 'error') term.brightRed(statusMessage.text);
            else term.brightGreen(statusMessage.text);
            return;
        }

        term.brightWhite(String(results.length));
        term.brightBlack(` resultado${results.length !== 1 ? 's' : ''} em `);
        term.white(activeTab.label);
        term.brightBlack(`  (aba: ${tabEntities.length} · total: ${allEntities.length})`);
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

            case 'CTRL_N':
                void copySelectedName();
                return;

            case 'CTRL_J':
                void copySelectedJson();
                return;

            case 'CTRL_K':
                void copySelectedId();
                return;

            case 'ALT_LEFT':
                activeTabIndex = (activeTabIndex - 1 + TABS.length) % TABS.length;
                selectedIndex = 0;
                runSearch();
                return;

            case 'ALT_RIGHT':
                activeTabIndex = (activeTabIndex + 1) % TABS.length;
                selectedIndex = 0;
                runSearch();
                return;

            case 'ESCAPE':
                query = '';
                cursorPos = 0;
                selectedIndex = 0;
                runSearch();
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
    if (statusMessageTimer) {
        clearTimeout(statusMessageTimer);
        statusMessageTimer = null;
    }
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
    } catch (err) {
        term.red(`\n  ✗ Erro ao carregar entidades: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    // Enter fullscreen (alternate buffer) then render
    term.fullscreen(true);
    term.hideCursor(true);
    activeTabIndex = 0;
    query = '';
    cursorPos = 0;
    selectedIndex = 0;
    runSearch();

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
