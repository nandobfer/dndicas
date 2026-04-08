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

function printColoredJsonLine(line: string): void {
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]|[^\S\n]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
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
let results: UnifiedEntity[] = [];
let selectedIndex = 0;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

    term.clear();

    // ── Results list (rows 1..listRows) ──────────────────────────────────────
    if (results.length === 0) {
        term.moveTo(1, 1);
        term.brightBlack(
            query.trim()
                ? `  Nenhum resultado para "${query}"`
                : '  Digite para buscar...'
        );
    } else {
        const selectedEntity = results[selectedIndex];
        const jsonStr = JSON.stringify(selectedEntity ?? {}, null, 2);
        const jsonLines = jsonStr.split('\n');
        const jsonLineCount = jsonLines.length;

        const { start, end } = computeWindow(results.length, selectedIndex, jsonLineCount, listRows);

        let currentRow = 1;
        for (let i = start; i <= end && currentRow <= listRows; i++) {
            const entity = results[i];
            if (!entity) continue;

            if (i === selectedIndex) {
                for (const jLine of jsonLines) {
                    if (currentRow > listRows) break;
                    term.moveTo(1, currentRow);
                    printColoredJsonLine('  ' + jLine);
                    currentRow++;
                }
            } else {
                term.moveTo(1, currentRow);
                const colorFn = TYPE_COLORS[entity.type] ?? ((s: string) => term.white(s));
                term('  ');
                colorFn(entity.type);
                term.white(' | ');
                term.white(entity.name);
                currentRow++;
            }
        }
    }

    // ── Footer (fixed absolute positions) ────────────────────────────────────
    term.moveTo(1, H - 3);
    term.brightBlack(divider);

    term.moveTo(1, H - 2);
    term.brightBlack('  ↑↓ navegar  ·  Esc limpar  ·  Ctrl+C sair  ·  ');
    term.brightWhite(String(results.length));
    term.brightBlack(` resultado${results.length !== 1 ? 's' : ''}  (total: ${allEntities.length})`);

    term.moveTo(1, H - 1);
    term.brightBlack(divider);

    renderInputLine(H);
}

/**
 * Updates only the search input row — fast path for immediate feedback on keypress.
 * Does NOT call term.clear(), so it never flickers the rest of the screen.
 */
function renderInputLine(H?: number): void {
    const row: number = H ?? ((term as any).height ?? 30);
    term.moveTo(1, row);
    term.eraseLine();
    term.bold.white('🔍 Buscar: ');
    term.white(query);
    term.brightBlack('_');
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
                // Clear search query; full re-render to update results area
                query = '';
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

            case 'BACKSPACE':
            case 'DELETE':
                if (query.length > 0) {
                    query = query.slice(0, -1);
                    // Show the updated input instantly, debounce the search
                    renderInputLine();
                    scheduleSearch();
                }
                return;

            default:
                if (data?.isCharacter && name.length === 1) {
                    query += name;
                    // Show the updated input instantly, debounce the search
                    renderInputLine();
                    scheduleSearch();
                }
        }
    });
}

function scheduleSearch(): void {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        runSearch();
    }, 80);
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
