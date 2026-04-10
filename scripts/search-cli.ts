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
 *   Ctrl+E → JSON nav mode: ↑↓ navigate JSON lines · Enter edit line · Esc back
 *   Edit mode: type to edit · Enter save · Esc cancel · ←/→ cursor · Ctrl+←/→ word
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

type JsonTokenKind = 'key' | 'string' | 'boolean' | 'null' | 'brace' | 'number' | 'plain';

type JsonToken = {
    text: string;
    kind: JsonTokenKind;
};

// ─── JSON color printer ───────────────────────────────────────────────────────
// Replicates the color scheme from scripts/seed-data/base-provider.ts.
// Works line-by-line so it's compatible with term.moveTo() absolute positioning.
// `highlight=true` is kept as an optional raw-ANSI mode for callers that want
// colored JSON over a filled background.

const JSON_TOKEN_RE = /("(?:[^"\\]|\\.)*")(\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]|[^\S\n]+/g;
const HTML_TAG_RE = /<[^>]+>/g;
const HTML_BREAK_RE = /<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
};

function decodeHtmlEntities(value: string): string {
    return value.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITY_MAP[entity] ?? entity);
}

function stripHtmlToDisplayText(value: string): string {
    return decodeHtmlEntities(
        value
            .replace(HTML_BREAK_RE, ' ')
            .replace(HTML_TAG_RE, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function sanitizeJsonDisplayValue(value: unknown): unknown {
    if (typeof value === 'string') {
        if (!HTML_TAG_RE.test(value)) {
            return value;
        }

        const text = stripHtmlToDisplayText(value);
        return `[${text}]`;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeJsonDisplayValue(item));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, sanitizeJsonDisplayValue(nestedValue)])
        );
    }

    return value;
}

function tokenizeJsonLine(line: string): JsonToken[] {
    const tokens: JsonToken[] = [];
    JSON_TOKEN_RE.lastIndex = 0;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = JSON_TOKEN_RE.exec(line)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ text: line.slice(lastIndex, match.index), kind: 'plain' });
        }

        const text = match[0];
        const quotedStr = match[1];
        const colonSuffix = match[2];

        if (quotedStr !== undefined) {
            tokens.push({ text: quotedStr, kind: colonSuffix !== undefined ? 'key' : 'string' });
            if (colonSuffix !== undefined) {
                tokens.push({ text: colonSuffix, kind: 'plain' });
            }
        } else if (text === 'true' || text === 'false') {
            tokens.push({ text, kind: 'boolean' });
        } else if (text === 'null') {
            tokens.push({ text, kind: 'null' });
        } else if (text === '{' || text === '}' || text === '[' || text === ']' || text === ',') {
            tokens.push({ text, kind: 'brace' });
        } else if (/^-?\d/.test(text)) {
            tokens.push({ text, kind: 'number' });
        } else {
            tokens.push({ text, kind: 'plain' });
        }

        lastIndex = JSON_TOKEN_RE.lastIndex;
    }

    if (lastIndex < line.length) {
        tokens.push({ text: line.slice(lastIndex), kind: 'plain' });
    }

    return tokens;
}

function printColoredJsonToken(token: JsonToken, highlight: boolean): void {
    if (highlight) {
        process.stdout.write(HL_BG);
    }

    switch (token.kind) {
        case 'key':
            if (highlight) process.stdout.write('\x1b[33m' + token.text + HL_FG_RESET);
            else term.yellow(token.text);
            return;
        case 'string':
            if (highlight) process.stdout.write('\x1b[36m' + token.text + HL_FG_RESET);
            else term.cyan(token.text);
            return;
        case 'boolean':
            if (highlight) process.stdout.write('\x1b[34m' + token.text + HL_FG_RESET);
            else term.blue(token.text);
            return;
        case 'null':
            if (highlight) process.stdout.write('\x1b[90m' + token.text + HL_FG_RESET);
            else term.gray(token.text);
            return;
        case 'brace':
            if (highlight) process.stdout.write('\x1b[1;37m' + token.text + '\x1b[22m' + HL_FG_RESET);
            else term.bold.white(token.text);
            return;
        case 'number':
            if (highlight) process.stdout.write('\x1b[32m' + token.text + HL_FG_RESET);
            else term.green(token.text);
            return;
        default:
            if (highlight) process.stdout.write(token.text);
            else term(token.text);
    }
}

function printColoredJsonLine(line: string, highlight: boolean): void {
    for (const token of tokenizeJsonLine(line)) {
        printColoredJsonToken(token, highlight);
    }

    if (highlight) {
        process.stdout.write(HL_FULL_RESET);
    }
}

function wrapJsonLine(line: string, maxWidth: number): JsonToken[][] {
    const safeWidth = Math.max(1, maxWidth);
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const indentToken: JsonToken = { text: indent, kind: 'plain' };
    const tokens = tokenizeJsonLine(line.slice(indent.length));
    const wrappedLines: JsonToken[][] = [];

    let currentLine: JsonToken[] = [{ ...indentToken }];
    let currentWidth = indent.length;

    const pushCurrentLine = () => {
        wrappedLines.push(currentLine);
        currentLine = [{ ...indentToken }];
        currentWidth = indent.length;
    };

    for (const token of tokens) {
        let remaining = token.text;

        while (remaining.length > 0) {
            if (currentWidth >= safeWidth) {
                pushCurrentLine();
            }

            const spaceLeft = Math.max(1, safeWidth - currentWidth);
            const part = remaining.slice(0, spaceLeft);

            currentLine.push({ text: part, kind: token.kind });
            currentWidth += part.length;
            remaining = remaining.slice(part.length);

            if (remaining.length > 0) {
                pushCurrentLine();
            }
        }
    }

    if (currentLine.length > 1 || wrappedLines.length === 0) {
        wrappedLines.push(currentLine);
    }

    return wrappedLines;
}

function buildDisplayJsonLines(entity: UnifiedEntity | undefined, maxWidth: number): JsonToken[][] {
    const sanitizedEntity = sanitizeJsonDisplayValue(entity ?? {});
    const jsonStr = JSON.stringify(sanitizedEntity, null, 2);
    const rawLines = jsonStr.split('\n');

    return rawLines.flatMap((line) => wrapJsonLine(line, maxWidth));
}

/**
 * Wraps the current `editBuffer` into visual chunks that fit within `maxWidth`,
 * matching the layout of the edit input:
 *   Line 0: indent + keyPrefix + content  (firstCap chars of content)
 *   Line 1+: indent + content             (contCap chars per line)
 *
 * Returns the chunks and the start offset of each chunk within `editBuffer`
 * so callers can determine which line the cursor falls on.
 */
function wrapEditBuffer(
    logLine: JsonLogicalLine,
    maxWidth: number
): { chunks: string[]; chunkStarts: number[] } {
    const indent = logLine.lineText.match(/^\s*/)?.[0] ?? '';
    const keyMatch = /^(\s*)"([^"]+)":\s*/.exec(logLine.lineText);
    const keyPrefix = keyMatch ? ('"' + keyMatch[2] + '": ') : '';

    const firstCap = Math.max(1, maxWidth - indent.length - keyPrefix.length);
    const contCap  = Math.max(1, maxWidth - indent.length);

    const chunks: string[] = [];
    const chunkStarts: number[] = [];
    let pos = 0;

    // First chunk uses firstCap
    chunks.push(editBuffer.slice(pos, pos + firstCap));
    chunkStarts.push(pos);
    pos += firstCap;

    // Continuation chunks use contCap
    while (pos < editBuffer.length) {
        chunks.push(editBuffer.slice(pos, pos + contCap));
        chunkStarts.push(pos);
        pos += contCap;
    }

    return { chunks, chunkStarts };
}

// ─── JSON logical line helpers ────────────────────────────────────────────────

/** Maps a dot-notation path to the value inside an object. */
function getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/** Mutates an object at the given dot-notation path. */
function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const next = current[parts[i]];
        if (next === null || typeof next !== 'object') return;
        current = next as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}

/** Returns the display text for a raw value (strips HTML for string fields). */
function getDisplayValue(rawValue: unknown): string {
    if (rawValue === null) return 'null';
    if (typeof rawValue === 'string') {
        if (HTML_TAG_RE.test(rawValue)) return stripHtmlToDisplayText(rawValue);
        return rawValue;
    }
    return String(rawValue);
}

/**
 * Extracts the outermost HTML wrapper tags from a string.
 * e.g. "<p>hello</p>" → { opener: "<p>", closer: "</p>" }
 * Returns null if the string is not wrapped in a single HTML element.
 */
function extractHtmlWrapper(html: string): { opener: string; closer: string } | null {
    const match = /^(<([a-zA-Z][a-zA-Z0-9]*)[^>]*>)([\s\S]*?)(<\/\2>)$/.exec(html.trim());
    if (!match) return null;
    return { opener: match[1], closer: match[4] };
}

const SCALAR_KEY_VALUE_RE = /^(\s*)"([^"]+)":\s*(.+?)(?:,\s*)?$/;
const CONTAINER_KEY_RE = /^(\s*)"([^"]+)":\s*[{[]/;
const CLOSE_RE = /^\s*[}\]]/;

/**
 * Builds the list of logical JSON lines for a given entity (no sanitization),
 * with path tracking so each scalar line knows its full dot-notation path.
 */
function buildLogicalJsonLines(entity: UnifiedEntity): JsonLogicalLine[] {
    const jsonStr = JSON.stringify(entity, null, 2);
    const rawLines = jsonStr.split('\n');
    const lines: JsonLogicalLine[] = [];
    const pathStack: string[] = [];
    // When a key opens a container (object/array), stash it to push on next line
    let pendingKey: string | null = null;

    for (const lineText of rawLines) {
        // If a container key was stashed, push it now that we're inside the container
        if (pendingKey !== null) {
            pathStack.push(pendingKey);
            pendingKey = null;
        }

        if (CLOSE_RE.test(lineText)) {
            // Closing bracket/brace — pop the stack
            if (pathStack.length > 0) pathStack.pop();
            lines.push({ lineText, path: null, isEditable: false, rawValue: undefined, displayValue: '' });
            continue;
        }

        if (CONTAINER_KEY_RE.test(lineText)) {
            // "key": { or "key": [ — not editable, but stash key for next iteration
            const m = SCALAR_KEY_VALUE_RE.exec(lineText);
            if (m) pendingKey = m[2];
            lines.push({ lineText, path: null, isEditable: false, rawValue: undefined, displayValue: '' });
            continue;
        }

        const scalarMatch = SCALAR_KEY_VALUE_RE.exec(lineText);
        if (scalarMatch) {
            const key = scalarMatch[2];
            const valueStr = scalarMatch[3].trim().replace(/,$/, '').trim();
            // Confirm scalar (not a container opener that slipped through)
            const isScalar = !valueStr.startsWith('{') && !valueStr.startsWith('[');
            if (isScalar) {
                const fullPath = [...pathStack, key].join('.');
                const rawValue = getValueByPath(entity, fullPath);
                const displayValue = getDisplayValue(rawValue);
                lines.push({ lineText, path: fullPath, isEditable: true, rawValue, displayValue });
                continue;
            }
        }

        // Everything else (array items without key, opening brace line, etc.)
        lines.push({ lineText, path: null, isEditable: false, rawValue: undefined, displayValue: '' });
    }

    return lines;
}

type DisplayLineMap = { logicalIndex: number; visualStart: number; visualEnd: number };

/**
 * Like buildDisplayJsonLines but also returns a map from logical line index
 * to the range of visual (wrapped) lines it produced.
 */
function buildDisplayJsonLinesWithMap(
    entity: UnifiedEntity | undefined,
    maxWidth: number
): { visualLines: JsonToken[][]; logicalMap: DisplayLineMap[] } {
    const sanitizedEntity = sanitizeJsonDisplayValue(entity ?? {});
    const jsonStr = JSON.stringify(sanitizedEntity, null, 2);
    const rawLines = jsonStr.split('\n');
    const visualLines: JsonToken[][] = [];
    const logicalMap: DisplayLineMap[] = [];

    rawLines.forEach((line, logicalIndex) => {
        const wrapped = wrapJsonLine(line, maxWidth);
        const visualStart = visualLines.length;
        visualLines.push(...wrapped);
        logicalMap.push({ logicalIndex, visualStart, visualEnd: visualLines.length - 1 });
    });

    return { visualLines, logicalMap };
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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
        originalName: item.originalName ?? '',
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

// ─── App mode ─────────────────────────────────────────────────────────────────

type AppMode = 'search' | 'jsonNav' | 'editLine';

type JsonLogicalLine = {
    lineText: string;      // raw line from JSON.stringify
    path: string | null;   // dot-notation path to the field (null for brackets)
    isEditable: boolean;   // false for container lines ({ } [ ])
    rawValue: unknown;     // actual (non-sanitized) value from the entity
    displayValue: string;  // text shown in the edit input (HTML stripped)
};

let appMode: AppMode = 'search';
let jsonLogicalLines: JsonLogicalLine[] = [];
let jsonLogicalLineIndex = 0;
let editBuffer = '';
let editCursorPos = 0;

// Highlight background for the selected JSON logical line
const JSON_HL_BG = '\x1b[48;5;238m'; // #444444

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
        results = items;
    } else {
        results = applyFuzzySearch(items, query);
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

async function saveEntityField(
    entity: UnifiedEntity,
    path: string,
    rawValue: unknown,
    newText: string
): Promise<void> {
    const ModelMap: Record<string, mongoose.Model<any>> = {
        'Regra': Reference,
        'Habilidade': Trait,
        'Talento': Feat,
        'Magia': Spell,
        'Classe': CharacterClass,
        'Origem': BackgroundModel,
        'Raça': RaceModel,
        'Item': ItemModel,
    };

    const Model = ModelMap[entity.type];
    if (!Model) {
        setStatusMessage(`Tipo desconhecido: ${entity.type}`, 'error');
        return;
    }

    let finalValue: unknown;

    if (typeof rawValue === 'number') {
        const parsed = Number(newText);
        if (isNaN(parsed)) {
            setStatusMessage('Valor inválido para número', 'error');
            return;
        }
        finalValue = parsed;
    } else if (typeof rawValue === 'boolean') {
        finalValue = newText === 'true';
    } else if (typeof rawValue === 'string' && HTML_TAG_RE.test(rawValue)) {
        const wrapper = extractHtmlWrapper(rawValue);
        finalValue = wrapper ? `${wrapper.opener}${newText}${wrapper.closer}` : `<p>${newText}</p>`;
    } else {
        finalValue = newText;
    }

    try {
        await Model.updateOne({ _id: entity._id }, { $set: { [path]: finalValue } });
        setValueByPath(entity as unknown as Record<string, unknown>, path, finalValue);
        jsonLogicalLines = buildLogicalJsonLines(entity);
        setStatusMessage(`"${path}" salvo`);
    } catch (err) {
        setStatusMessage(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'error');
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
        const { visualLines: jsonVisualLines, logicalMap } = buildDisplayJsonLinesWithMap(selectedEntity, W - 2);

        // In editLine mode, the edit buffer may wrap into more lines than the
        // original JSON display. Pre-compute chunks to allocate the right space.
        let editWrappedCache: { chunks: string[]; chunkStarts: number[] } | null = null;
        if (appMode === 'editLine' && selectedEntity) {
            const selLogLine = jsonLogicalLines[jsonLogicalLineIndex];
            if (selLogLine) {
                editWrappedCache = wrapEditBuffer(selLogLine, W - 2);
            }
        }
        const editChunkCount = editWrappedCache?.chunks.length ?? 0;
        const selectedLineCount = 1 + Math.max(jsonVisualLines.length, editChunkCount);

        const { start, end } = computeWindow(results.length, selectedIndex, selectedLineCount, listRows);

        for (let i = start; i <= end && currentRow <= listEndRow; i++) {
            const entity = results[i];
            if (!entity) continue;

            if (i === selectedIndex) {
                writeStyledRow(currentRow, selectedRowStyle, () => {
                    const nameDisplay = entity.originalName ? `${entity.name} | ${entity.originalName}` : entity.name;
                    process.stdout.write(`  ${entity.type} | ${nameDisplay}`);
                });
                currentRow++;

                if (appMode === 'search') {
                    for (const visualLine of jsonVisualLines) {
                        if (currentRow > listEndRow) break;
                        writeRow(currentRow, () => {
                            term('  ');
                            for (const token of visualLine) {
                                printColoredJsonToken(token, false);
                            }
                        });
                        currentRow++;
                    }
                } else {
                    // jsonNav or editLine: render JSON with logical-line highlight
                    for (let logIdx = 0; logIdx < logicalMap.length; logIdx++) {
                        const { visualStart, visualEnd } = logicalMap[logIdx];
                        const isSelectedLogical = logIdx === jsonLogicalLineIndex;

                        // For editLine mode on the selected logical line, pre-resolve
                        // the wrapped chunks (cached from above for the selected line).
                        const wrapped = (isSelectedLogical && appMode === 'editLine')
                            ? editWrappedCache
                            : null;

                        // Total rows to iterate: max of JSON visual rows and edit chunks
                        const totalRows = wrapped
                            ? Math.max(visualEnd - visualStart + 1, wrapped.chunks.length)
                            : (visualEnd - visualStart + 1);

                        for (let offset = 0; offset < totalRows; offset++) {
                            const vIdx = visualStart + offset;
                            if (currentRow > listEndRow) break;

                            if (wrapped) {
                                // editLine mode for the selected logical line
                                const logLine = jsonLogicalLines[logIdx];
                                const keyMatch = /^(\s*)"([^"]+)":\s*/.exec(logLine?.lineText ?? '');
                                const indent = logLine?.lineText?.match(/^\s*/)?.[0] ?? '';
                                const chunk = wrapped.chunks[offset] ?? '';
                                const chunkStart = wrapped.chunkStarts[offset] ?? -1;
                                const isLastChunk = offset === wrapped.chunks.length - 1;

                                // Cursor is in this chunk if editCursorPos falls within it
                                const localCursor = (chunkStart !== -1
                                    && editCursorPos >= chunkStart
                                    && (editCursorPos < chunkStart + chunk.length || (isLastChunk && editCursorPos <= chunkStart + chunk.length)))
                                    ? editCursorPos - chunkStart
                                    : null;

                                writeRow(currentRow, () => {
                                    process.stdout.write(JSON_HL_BG);
                                    term('  ');
                                    if (offset === 0) {
                                        // First line: show indent + key prefix
                                        if (indent) process.stdout.write(indent);
                                        if (keyMatch) {
                                            process.stdout.write('\x1b[33m"' + keyMatch[2] + '"' + HL_FG_RESET + ': ');
                                        }
                                    } else {
                                        // Continuation lines: re-indent to match original
                                        if (indent) process.stdout.write(indent);
                                    }
                                    // Render chunk content with cursor
                                    process.stdout.write('\x1b[36m');
                                    if (localCursor !== null) {
                                        process.stdout.write(chunk.slice(0, localCursor));
                                        const atCursor = chunk[localCursor];
                                        if (atCursor !== undefined) {
                                            process.stdout.write('\x1b[7m' + atCursor + '\x1b[27m');
                                            process.stdout.write(chunk.slice(localCursor + 1));
                                        } else {
                                            process.stdout.write('\x1b[7m_\x1b[27m');
                                        }
                                    } else {
                                        process.stdout.write(chunk);
                                    }
                                    process.stdout.write(HL_FULL_RESET);
                                });
                            } else if (isSelectedLogical) {
                                // jsonNav highlight (or editLine on non-selected lines)
                                const visualLine = jsonVisualLines[vIdx];
                                if (!visualLine) { currentRow++; continue; }
                                writeRow(currentRow, () => {
                                    process.stdout.write(JSON_HL_BG);
                                    term('  ');
                                    for (const token of visualLine) {
                                        printColoredJsonToken(token, true);
                                    }
                                    process.stdout.write(HL_FULL_RESET);
                                });
                            } else {
                                const visualLine = jsonVisualLines[vIdx];
                                if (!visualLine) { currentRow++; continue; }
                                writeRow(currentRow, () => {
                                    term('  ');
                                    for (const token of visualLine) {
                                        printColoredJsonToken(token, false);
                                    }
                                });
                            }
                            currentRow++;
                        }
                    }
                }
            } else {
                writeRow(currentRow, () => {
                    const colorFn = TYPE_COLORS[entity.type] ?? ((s: string) => term.white(s));
                    term('  ');
                    colorFn(entity.type);
                    term.white(' | ');
                    term.white(entity.name);
                    if (entity.originalName) {
                        term.brightBlack(' | ');
                        term.brightBlack(entity.originalName);
                    }
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
        if (appMode === 'jsonNav') {
            term.brightBlack('  ↑↓ navegar JSON  ·  Enter editar linha  ·  Esc voltar  ·  Ctrl+C sair  ·  ');
        } else if (appMode === 'editLine') {
            term.brightBlack('  Enter salvar  ·  Esc cancelar edição  ·  ←→ cursor  ·  Ctrl+C sair  ·  ');
        } else {
            term.brightBlack('  ↑↓ navegar  ·  Ctrl+E editar  ·  Alt+←/→ abas  ·  Ctrl+N nome  ·  Ctrl+J JSON  ·  Ctrl+K id  ·  Esc limpar  ·  Ctrl+C sair  ·  ');
        }

        if (statusMessage) {
            if (statusMessage.tone === 'error') term.brightRed(statusMessage.text);
            else term.brightGreen(statusMessage.text);
            return;
        }

        if (appMode === 'search') {
            term.brightWhite(String(results.length));
            term.brightBlack(` resultado${results.length !== 1 ? 's' : ''} em `);
            term.white(activeTab.label);
            term.brightBlack(`  (aba: ${tabEntities.length} · total: ${allEntities.length})`);
        } else if (appMode === 'jsonNav') {
            const line = jsonLogicalLines[jsonLogicalLineIndex];
            if (line?.path) {
                term.brightBlack('campo: ');
                term.white(line.path);
                if (!line.isEditable) term.brightBlack(' (não editável)');
            }
        } else if (appMode === 'editLine') {
            const line = jsonLogicalLines[jsonLogicalLineIndex];
            if (line?.path) {
                term.brightBlack('editando: ');
                term.white(line.path);
            }
        }
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

function handleSearchKey(name: string, data: { isCharacter?: boolean }): void {
    switch (name) {
        case 'CTRL_N': void copySelectedName(); return;
        case 'CTRL_J': void copySelectedJson(); return;
        case 'CTRL_K': void copySelectedId(); return;

        case 'CTRL_E':
        case 'ENTER': {
            const entity = getSelectedEntity();
            if (!entity) return;
            jsonLogicalLines = buildLogicalJsonLines(entity);
            jsonLogicalLineIndex = 0;
            appMode = 'jsonNav';
            render();
            return;
        }

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

        case 'LEFT':
            if (cursorPos > 0) { cursorPos--; renderInputLine(); }
            return;

        case 'RIGHT':
            if (cursorPos < query.length) { cursorPos++; renderInputLine(); }
            return;

        case 'CTRL_LEFT':
            cursorPos = wordStart(query, cursorPos);
            renderInputLine();
            return;

        case 'CTRL_RIGHT':
            cursorPos = wordEnd(query, cursorPos);
            renderInputLine();
            return;

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

        default:
            if (data?.isCharacter && name.length === 1) {
                query = query.slice(0, cursorPos) + name + query.slice(cursorPos);
                cursorPos++;
                renderInputLine();
                runSearch();
            }
    }
}

function handleJsonNavKey(name: string): void {
    switch (name) {
        case 'UP':
            jsonLogicalLineIndex = Math.max(0, jsonLogicalLineIndex - 1);
            render();
            return;

        case 'DOWN':
            jsonLogicalLineIndex = Math.min(jsonLogicalLines.length - 1, jsonLogicalLineIndex + 1);
            render();
            return;

        case 'ENTER': {
            const line = jsonLogicalLines[jsonLogicalLineIndex];
            if (!line?.isEditable) {
                setStatusMessage('Linha não editável', 'error');
                return;
            }
            editBuffer = line.displayValue;
            editCursorPos = editBuffer.length;
            appMode = 'editLine';
            render();
            return;
        }

        case 'ESCAPE':
            appMode = 'search';
            render();
            return;
    }
}

function handleEditLineKey(name: string, data: { isCharacter?: boolean }): void {
    switch (name) {
        case 'ENTER': {
            const entity = getSelectedEntity();
            const line = jsonLogicalLines[jsonLogicalLineIndex];
            if (!entity || !line?.path) return;
            void saveEntityField(entity, line.path, line.rawValue, editBuffer).then(() => {
                appMode = 'jsonNav';
                render();
            });
            return;
        }

        case 'ESCAPE':
            appMode = 'jsonNav';
            render();
            return;

        case 'LEFT':
            if (editCursorPos > 0) { editCursorPos--; render(); }
            return;

        case 'RIGHT':
            if (editCursorPos < editBuffer.length) { editCursorPos++; render(); }
            return;

        case 'CTRL_LEFT':
            editCursorPos = wordStart(editBuffer, editCursorPos);
            render();
            return;

        case 'CTRL_RIGHT':
            editCursorPos = wordEnd(editBuffer, editCursorPos);
            render();
            return;

        case 'BACKSPACE':
            if (editCursorPos > 0) {
                editBuffer = editBuffer.slice(0, editCursorPos - 1) + editBuffer.slice(editCursorPos);
                editCursorPos--;
                render();
            }
            return;

        case 'DELETE':
            if (editCursorPos < editBuffer.length) {
                editBuffer = editBuffer.slice(0, editCursorPos) + editBuffer.slice(editCursorPos + 1);
                render();
            }
            return;

        case 'CTRL_BACKSPACE':
        case 'ALT_BACKSPACE': {
            if (editCursorPos > 0) {
                const newPos = wordStart(editBuffer, editCursorPos);
                editBuffer = editBuffer.slice(0, newPos) + editBuffer.slice(editCursorPos);
                editCursorPos = newPos;
                render();
            }
            return;
        }

        default:
            if (data?.isCharacter && name.length === 1) {
                editBuffer = editBuffer.slice(0, editCursorPos) + name + editBuffer.slice(editCursorPos);
                editCursorPos++;
                render();
            }
    }
}

function setupInput(): void {
    term.grabInput(true);

    term.on('key', (name: string, _matches: string[], data: { isCharacter?: boolean }) => {
        if (name === 'CTRL_C') {
            cleanup();
            process.exit(0);
            return;
        }

        if (appMode === 'search') {
            handleSearchKey(name, data);
        } else if (appMode === 'jsonNav') {
            handleJsonNavKey(name);
        } else if (appMode === 'editLine') {
            handleEditLineKey(name, data);
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
    appMode = 'search';
    jsonLogicalLines = [];
    jsonLogicalLineIndex = 0;
    editBuffer = '';
    editCursorPos = 0;
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
