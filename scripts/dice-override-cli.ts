/**
 * @fileoverview TUI interativo para gerenciar dice overrides por jogador.
 *
 * Conecta diretamente ao MongoDB via Mongoose e usa terminal-kit para renderizar
 * duas colunas: fluxo de criação de overrides (esquerda) e lista de overrides
 * ativos (direita).
 *
 * Usage:
 *   tsx scripts/dice-override-cli.ts
 *   pnpm dice-override-cli
 *
 * Controles:
 *   Ctrl+N  adicionar jogador
 *   ↑↓      navegar
 *   Enter   confirmar / avançar
 *   ESC     voltar etapa anterior
 *   Ctrl+R  forçar refresh da lista de overrides
 *   Ctrl+C  sair
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import terminal from 'terminal-kit';
import mongoose from 'mongoose';
import { upsertDiceOverride, listDiceOverrides, clearDiceOverrides } from '@/features/dice-roller/server/dice-override-service';
import { DICE_TYPES, type DiceType, type DiceRollOverrideRecord } from '@/features/dice-roller/types';
import type { DiceTarget } from '@/features/dice-roller/server/dice-target';

const term = terminal.terminal;

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const RESET      = '\x1b[0m';
const BOLD       = '\x1b[1m';
const INVERSE    = '\x1b[7m';
const FG_WHITE   = '\x1b[97m';
const FG_CYAN    = '\x1b[36m';
const FG_GREEN   = '\x1b[32m';
const FG_YELLOW  = '\x1b[33m';
const FG_RED     = '\x1b[31m';
const FG_MAGENTA = '\x1b[35m';
const FG_GRAY    = '\x1b[90m';
const BG_SEL     = '\x1b[48;5;238m'; // fundo de item selecionado
const BG_HEADER  = '\x1b[48;5;235m'; // fundo de header de seção

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Player {
    name: string;
    id: string;
}

type Method = 'min' | 'max' | 'range' | 'exact' | 'clear' | 'list';

type AppScreen =
    | { screen: 'player-list' }
    | { screen: 'add-player'; field: 'name' | 'id'; buffer: string; nameDraft?: string; cursorPos: number }
    | { screen: 'method-list'; player: Player; selectedMethod: number }
    | { screen: 'confirm-clear'; player: Player; dice: DiceType | undefined; selectedOpt: number }
    | { screen: 'param-dice'; player: Player; method: Method; selectedDice: number }
    | { screen: 'param-value'; player: Player; method: Method; dice: DiceType; field: 'value' | 'min' | 'max'; buffer: string; cursorPos: number; minValue?: number }

const METHODS: { id: Method; label: string; desc: string }[] = [
    { id: 'min',   label: 'min',   desc: 'Resultado mínimo garantido' },
    { id: 'max',   label: 'max',   desc: 'Resultado máximo limitado' },
    { id: 'range', label: 'range', desc: 'Faixa mín–máx' },
    { id: 'exact', label: 'exact', desc: 'Resultado exato fixo' },
    { id: 'clear', label: 'clear', desc: 'Remover overrides' },
    { id: 'list',  label: 'list',  desc: 'Ver overrides do jogador' },
];

// ─── Estado global ────────────────────────────────────────────────────────────

let players: Player[] = [];
let playerSelectedIndex = 0;
let currentScreen: AppScreen = { screen: 'player-list' };

let overrides: DiceRollOverrideRecord[] = [];
let overridesLoading = false;
let overridesLastRefresh: Date | null = null;
let statusMessage: { text: string; tone: 'ok' | 'error' } | null = null;
let statusTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

// ─── Serviços ─────────────────────────────────────────────────────────────────

/** Retorna o DiceTarget owlbear para um jogador */
function playerTarget(player: Player): DiceTarget {
    return { scope: 'owlbear', targetId: `player:${player.id.trim()}` };
}

/** Atualiza a lista de overrides (painel direito) — todos do banco */
async function refreshOverrides(): Promise<void> {
    if (overridesLoading) return;
    overridesLoading = true;
    try {
        const { DiceRollOverride } = await import('@/features/dice-roller/models/dice-roll-override');
        const docs = await DiceRollOverride.find({}).sort({ updatedAt: -1 }).lean();
        overrides = docs.map((doc: any) => ({
            id: String(doc._id),
            scope: doc.scope as 'local' | 'owlbear',
            targetId: String(doc.targetId),
            dice: doc.dice as DiceType,
            min: typeof doc.min === 'number' ? doc.min : undefined,
            max: typeof doc.max === 'number' ? doc.max : undefined,
            exact: typeof doc.exact === 'number' ? doc.exact : undefined,
            remainingUses: typeof doc.remainingUses === 'number' ? doc.remainingUses : 1,
            createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : undefined,
            updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : undefined,
        }));
        overridesLastRefresh = new Date();
    } catch (_err) {
        // silencia erros de refresh em background
    } finally {
        overridesLoading = false;
        render();
    }
}

function scheduleAutoRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { void refreshOverrides(); }, 5000);
}

// ─── Status message ───────────────────────────────────────────────────────────

function setStatus(text: string, tone: 'ok' | 'error' = 'ok'): void {
    if (statusTimer) clearTimeout(statusTimer);
    statusMessage = { text, tone };
    render();
    statusTimer = setTimeout(() => {
        statusMessage = null;
        statusTimer = null;
        render();
    }, 2500);
}

// ─── Utilitários de formatação ────────────────────────────────────────────────

/** Formata um override para exibição compacta */
function formatOverride(o: DiceRollOverrideRecord): string {
    if (typeof o.exact === 'number') return `${o.dice} = ${o.exact}`;
    if (typeof o.min === 'number' && typeof o.max === 'number') return `${o.dice} [${o.min}–${o.max}]`;
    if (typeof o.min === 'number') return `${o.dice} min ${o.min}`;
    if (typeof o.max === 'number') return `${o.dice} max ${o.max}`;
    return o.dice;
}

/** Tenta resolver um nome legível do targetId cruzando com players em memória */
function targetLabel(targetId: string): string {
    const match = /^(?:player|user|local):(.+)$/.exec(targetId);
    if (match) {
        const id = match[1];
        const found = players.find(p => p.id === id);
        return found ? found.name : id.slice(0, 24);
    }
    return targetId.slice(0, 24);
}

/** Trunca texto para caber em maxWidth caracteres */
function fitLine(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) return text;
    return text.slice(0, Math.max(0, maxWidth - 1)) + '…';
}

// ─── Primitivas de desenho ────────────────────────────────────────────────────

/**
 * Limpa e reescreve uma célula (região retangular de uma linha) sem afetar
 * o restante da linha. Usa sequências ANSI brutas para controle preciso.
 */
function writeCell(row: number, col: number, width: number, content: string): void {
    if (width <= 0) return;
    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(' '.repeat(width));
    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(fitLine(content, width));
}

/** Escreve com prefixo de cor (reset ao final) */
function writeCellColored(row: number, col: number, width: number, color: string, text: string): void {
    if (width <= 0) return;
    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(' '.repeat(width));
    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(color + fitLine(text, width) + RESET);
}

/** Renderiza uma linha de input com cursor destacado */
function writeInputLine(row: number, col: number, width: number, buffer: string, cursor: number, color: string): void {
    if (width <= 0) return;
    const prefix = '  > ';
    const maxContent = Math.max(1, width - prefix.length);

    // Janela deslizante para manter o cursor visível
    const windowStart = Math.max(0, cursor - maxContent + 1);
    const visible      = buffer.slice(windowStart, windowStart + maxContent);
    const localCursor  = cursor - windowStart;

    const before   = visible.slice(0, localCursor);
    const atCursor = visible[localCursor] ?? '_';
    const after    = visible.slice(localCursor + 1);

    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(' '.repeat(width));
    process.stdout.write(`\x1b[${row};${col}H`);
    process.stdout.write(color + prefix + before + INVERSE + atCursor + RESET + color + after + RESET);
}

// ─── Render principal ─────────────────────────────────────────────────────────

function render(): void {
    const W: number = (term as any).width  ?? 80;
    const H: number = (term as any).height ?? 30;

    const divCol       = Math.floor(W / 2);
    const leftW        = divCol - 1;
    const rightW       = W - divCol - 1;
    const leftStartCol = 1;
    const rightStart   = divCol + 2;

    // ── Divisor vertical ──────────────────────────────────────────────────────
    for (let r = 1; r <= H; r++) {
        process.stdout.write(`\x1b[${r};${divCol}H${FG_GRAY}│${RESET}`);
    }

    // ── Header esquerdo (linhas 1–3) ──────────────────────────────────────────
    writeCellColored(1, leftStartCol, leftW, BG_HEADER + BOLD + FG_CYAN,   '  Dice Override CLI');
    writeCellColored(2, leftStartCol, leftW, FG_GRAY, '  Ctrl+N add  ·  ↑↓ navegar  ·  Enter confirmar  ·  ESC voltar  ·  Ctrl+C sair');
    writeCellColored(3, leftStartCol, leftW, FG_GRAY, '─'.repeat(leftW));

    // ── Conteúdo esquerdo (linhas 4..H-2) ────────────────────────────────────
    const contentStartRow = 4;
    const contentEndRow   = H - 2;

    // Limpa área de conteúdo esquerdo
    for (let r = contentStartRow; r <= contentEndRow; r++) {
        writeCell(r, leftStartCol, leftW, '');
    }

    renderLeft(leftStartCol, leftW, contentStartRow, contentEndRow);

    // ── Footer esquerdo (linhas H-1, H) ──────────────────────────────────────
    writeCellColored(H - 1, leftStartCol, leftW, FG_GRAY, '─'.repeat(leftW));

    if (statusMessage) {
        const color = statusMessage.tone === 'ok' ? FG_GREEN : FG_RED;
        writeCellColored(H, leftStartCol, leftW, color, `  ${statusMessage.text}`);
    } else {
        writeCellColored(H, leftStartCol, leftW, FG_GRAY, getHint());
    }

    // ── Header direito (linhas 1–3) ───────────────────────────────────────────
    const refreshStr = overridesLastRefresh
        ? overridesLastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '--:--:--';
    writeCellColored(1, rightStart, rightW, BG_HEADER + BOLD + FG_YELLOW, `  Overrides ativos`);
    writeCellColored(2, rightStart, rightW, FG_GRAY, `  Ctrl+R refresh  ·  auto 5s  ·  ${refreshStr}`);
    writeCellColored(3, rightStart, rightW, FG_GRAY, '─'.repeat(rightW));

    // ── Lista de overrides (linhas 4..H) ──────────────────────────────────────
    for (let r = contentStartRow; r <= H; r++) {
        writeCell(r, rightStart, rightW, '');
    }

    renderRight(rightStart, rightW, contentStartRow, H);
}

function getHint(): string {
    const s = currentScreen;
    switch (s.screen) {
        case 'player-list':
            return players.length === 0
                ? '  Ctrl+N para adicionar o primeiro jogador'
                : '  ↑↓ navegar  ·  Enter: selecionar  ·  Ctrl+N: add jogador';
        case 'add-player':
            return s.field === 'name'
                ? '  Digite o nome do jogador  ·  Enter: avançar  ·  ESC: cancelar'
                : '  Digite o ID do Owlbear  ·  Enter: salvar  ·  ESC: voltar';
        case 'method-list':   return '  ↑↓ navegar  ·  Enter: escolher método  ·  ESC: voltar';
        case 'param-dice':    return '  ↑↓ navegar dado  ·  Enter: confirmar  ·  ESC: voltar';
        case 'param-value':   return '  Digite um número inteiro  ·  Enter: confirmar  ·  ESC: voltar';
        case 'confirm-clear': return '  ↑↓ navegar  ·  Enter: confirmar opção  ·  ESC: cancelar';
    }
}

// ─── Render coluna esquerda ───────────────────────────────────────────────────

function renderLeft(col: number, width: number, startRow: number, endRow: number): void {
    const s = currentScreen;
    switch (s.screen) {
        case 'player-list':   renderPlayerList(col, width, startRow, endRow); break;
        case 'add-player':    renderAddPlayer(col, width, startRow, endRow, s); break;
        case 'method-list':   renderMethodList(col, width, startRow, endRow, s); break;
        case 'param-dice':    renderParamDice(col, width, startRow, endRow, s); break;
        case 'param-value':   renderParamValue(col, width, startRow, endRow, s); break;
        case 'confirm-clear': renderConfirmClear(col, width, startRow, endRow, s); break;
    }
}

function renderPlayerList(col: number, width: number, startRow: number, endRow: number): void {
    let row = startRow;

    if (players.length === 0) {
        writeCellColored(row, col, width, FG_GRAY, '  (nenhum jogador)  —  Ctrl+N para adicionar');
        return;
    }

    writeCellColored(row++, col, width, BOLD + FG_WHITE, `  Jogadores (${players.length}):`);

    const maxItems = endRow - row;
    const windowStart = Math.max(0, playerSelectedIndex - Math.floor(maxItems / 2));
    const windowEnd   = Math.min(players.length - 1, windowStart + maxItems - 1);

    for (let i = windowStart; i <= windowEnd && row <= endRow; i++) {
        const p = players[i];
        if (!p) continue;
        if (i === playerSelectedIndex) {
            writeCellColored(row++, col, width, BG_SEL + FG_WHITE,
                `  > ${p.name}  ${FG_GRAY}id: ${p.id}`);
        } else {
            writeCellColored(row++, col, width, '',
                `    ${p.name}  ${FG_GRAY}id: ${p.id}`);
        }
    }
}

function renderAddPlayer(
    col: number, width: number, startRow: number, _endRow: number,
    s: Extract<AppScreen, { screen: 'add-player' }>
): void {
    let row = startRow;
    writeCellColored(row++, col, width, BOLD + FG_CYAN, '  Adicionar Jogador');
    row++;

    // Campo nome
    const nameLabel = '  Nome do jogador:';
    writeCellColored(row++, col, width, FG_GRAY, nameLabel);

    if (s.field === 'name') {
        writeInputLine(row++, col, width, s.buffer, s.cursorPos, FG_CYAN);
    } else {
        writeCellColored(row++, col, width, FG_WHITE, `  ${s.nameDraft ?? ''}`);
        row++;

        // Campo id
        writeCellColored(row++, col, width, FG_GRAY, '  ID do jogador no Owlbear:');
        writeInputLine(row++, col, width, s.buffer, s.cursorPos, FG_YELLOW);
    }
}

function renderMethodList(
    col: number, width: number, startRow: number, _endRow: number,
    s: Extract<AppScreen, { screen: 'method-list' }>
): void {
    let row = startRow;
    writeCellColored(row++, col, width, BOLD + FG_CYAN, `  ${s.player.name}`);
    writeCellColored(row++, col, width, FG_GRAY, `  id: ${s.player.id}`);
    row++;
    writeCellColored(row++, col, width, BOLD + FG_WHITE, '  Escolha o método:');

    for (let i = 0; i < METHODS.length; i++) {
        const m = METHODS[i];
        if (!m) continue;
        const pad = ' '.repeat(Math.max(0, 7 - m.label.length));
        if (i === s.selectedMethod) {
            writeCellColored(row++, col, width, BG_SEL + FG_WHITE,
                `  > ${m.label}${pad}  ${m.desc}`);
        } else {
            writeCellColored(row++, col, width, '',
                `    ${FG_CYAN}${m.label}${RESET}${pad}  ${FG_GRAY}${m.desc}${RESET}`);
        }
    }
}

function renderParamDice(
    col: number, width: number, startRow: number, _endRow: number,
    s: Extract<AppScreen, { screen: 'param-dice' }>
): void {
    let row = startRow;
    writeCellColored(row++, col, width, BOLD + FG_CYAN,
        `  ${s.player.name}  ${FG_GRAY}→  ${FG_YELLOW}${s.method}`);
    row++;
    writeCellColored(row++, col, width, BOLD + FG_WHITE, '  Escolha o dado:');

    for (let i = 0; i < DICE_TYPES.length; i++) {
        const dice = DICE_TYPES[i];
        if (!dice) continue;
        if (i === s.selectedDice) {
            writeCellColored(row++, col, width, BG_SEL + FG_WHITE, `  > ${dice}`);
        } else {
            writeCellColored(row++, col, width, '', `    ${FG_CYAN}${dice}${RESET}`);
        }
    }
}

function renderParamValue(
    col: number, width: number, startRow: number, _endRow: number,
    s: Extract<AppScreen, { screen: 'param-value' }>
): void {
    let row = startRow;
    writeCellColored(row++, col, width, BOLD + FG_CYAN,
        `  ${s.player.name}  ${FG_GRAY}→  ${FG_YELLOW}${s.method}  ${FG_MAGENTA}${s.dice}`);
    row++;

    if (s.method === 'range') {
        if (s.field === 'min') {
            writeCellColored(row++, col, width, FG_GRAY, '  Valor mínimo:');
            writeInputLine(row++, col, width, s.buffer, s.cursorPos, FG_GREEN);
        } else {
            writeCellColored(row++, col, width, FG_GRAY, `  Mínimo: ${s.minValue}`);
            row++;
            writeCellColored(row++, col, width, FG_GRAY, '  Valor máximo:');
            writeInputLine(row++, col, width, s.buffer, s.cursorPos, FG_GREEN);
        }
    } else {
        const label =
            s.method === 'min'   ? 'Valor mínimo' :
            s.method === 'max'   ? 'Valor máximo' :
            s.method === 'exact' ? 'Valor exato'  : 'Valor';
        writeCellColored(row++, col, width, FG_GRAY, `  ${label}:`);
        writeInputLine(row++, col, width, s.buffer, s.cursorPos, FG_GREEN);
    }
}

function renderConfirmClear(
    col: number, width: number, startRow: number, _endRow: number,
    s: Extract<AppScreen, { screen: 'confirm-clear' }>
): void {
    let row = startRow;
    const scope = s.dice ? `dado ${s.dice}` : 'todos os dados';

    writeCellColored(row++, col, width, BOLD + FG_RED, '  Confirmar remoção de overrides');
    row++;
    writeCellColored(row++, col, width, FG_WHITE, `  Jogador: ${s.player.name}`);
    writeCellColored(row++, col, width, FG_WHITE, `  Escopo:  ${scope}`);
    row++;

    const opts = [
        { label: 'Sim, remover',  color: FG_RED   },
        { label: 'Cancelar',      color: FG_WHITE  },
    ];

    for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        if (!opt) continue;
        if (i === s.selectedOpt) {
            writeCellColored(row++, col, width, BG_SEL + opt.color, `  > ${opt.label}`);
        } else {
            writeCellColored(row++, col, width, opt.color, `    ${opt.label}`);
        }
    }
}

// ─── Render coluna direita ────────────────────────────────────────────────────

function renderRight(col: number, width: number, startRow: number, endRow: number): void {
    let row = startRow;

    if (overridesLoading) {
        writeCellColored(row, col, width, FG_GRAY, '  Carregando...');
        return;
    }

    if (overrides.length === 0) {
        writeCellColored(row, col, width, FG_GRAY, '  (nenhum override ativo)');
        return;
    }

    // Agrupa por targetId mantendo ordem de entrada
    const order: string[] = [];
    const grouped = new Map<string, DiceRollOverrideRecord[]>();
    for (const o of overrides) {
        if (!grouped.has(o.targetId)) {
            order.push(o.targetId);
            grouped.set(o.targetId, []);
        }
        grouped.get(o.targetId)!.push(o);
    }

    for (const targetId of order) {
        if (row > endRow) break;
        const list = grouped.get(targetId)!;
        const label = targetLabel(targetId);
        writeCellColored(row++, col, width, BOLD + FG_YELLOW, `  ${label}`);

        for (const o of list) {
            if (row > endRow) break;
            writeCellColored(row++, col, width, '',
                `    ${FG_MAGENTA}${o.dice}${RESET}  ${FG_CYAN}${formatOverride(o)}${RESET}  ${FG_GRAY}×${o.remainingUses}${RESET}`);
        }

        if (row <= endRow) row++; // linha em branco entre grupos
    }
}

// ─── Keyboard handling ────────────────────────────────────────────────────────

function handleKey(name: string, data: { isCharacter?: boolean }): void {
    // Global
    if (name === 'CTRL_R') {
        void refreshOverrides();
        return;
    }

    const s = currentScreen;
    switch (s.screen) {
        case 'player-list':    handlePlayerList(name); return;
        case 'add-player':     handleAddPlayer(name, data, s); return;
        case 'method-list':    handleMethodList(name, s); return;
        case 'param-dice':     handleParamDice(name, s); return;
        case 'param-value':    handleParamValue(name, data, s); return;
        case 'confirm-clear':  handleConfirmClear(name, s); return;
    }
}

// player-list ─────────────────────────────────────────────────────────────────

function handlePlayerList(name: string): void {
    switch (name) {
        case 'CTRL_N':
            currentScreen = { screen: 'add-player', field: 'name', buffer: '', cursorPos: 0 };
            render();
            return;

        case 'UP':
            if (playerSelectedIndex > 0) {
                playerSelectedIndex--;
                render();
            }
            return;

        case 'DOWN':
            if (playerSelectedIndex < players.length - 1) {
                playerSelectedIndex++;
                render();
            }
            return;

        case 'ENTER': {
            const p = players[playerSelectedIndex];
            if (!p) return;
            currentScreen = { screen: 'method-list', player: p, selectedMethod: 0 };
            render();
            return;
        }
    }
}

// add-player ──────────────────────────────────────────────────────────────────

function handleAddPlayer(
    name: string,
    data: { isCharacter?: boolean },
    s: Extract<AppScreen, { screen: 'add-player' }>
): void {
    if (name === 'ESCAPE') {
        currentScreen = { screen: 'player-list' };
        render();
        return;
    }

    if (name === 'ENTER') {
        if (s.field === 'name') {
            if (!s.buffer.trim()) {
                setStatus('O nome não pode estar vazio', 'error');
                return;
            }
            currentScreen = { screen: 'add-player', field: 'id', buffer: '', nameDraft: s.buffer.trim(), cursorPos: 0 };
            render();
        } else {
            if (!s.buffer.trim()) {
                setStatus('O ID não pode estar vazio', 'error');
                return;
            }
            const newPlayer: Player = { name: s.nameDraft!, id: s.buffer.trim() };
            players.push(newPlayer);
            playerSelectedIndex = players.length - 1;
            currentScreen = { screen: 'player-list' };
            setStatus(`Jogador "${newPlayer.name}" adicionado`);
        }
        return;
    }

    updateBuffer(name, data, s.buffer, s.cursorPos, (buffer, cursorPos) => {
        currentScreen = { ...s, buffer, cursorPos };
        render();
    });
}

// method-list ─────────────────────────────────────────────────────────────────

function handleMethodList(name: string, s: Extract<AppScreen, { screen: 'method-list' }>): void {
    switch (name) {
        case 'ESCAPE':
            currentScreen = { screen: 'player-list' };
            render();
            return;

        case 'UP':
            if (s.selectedMethod > 0) {
                currentScreen = { ...s, selectedMethod: s.selectedMethod - 1 };
                render();
            }
            return;

        case 'DOWN':
            if (s.selectedMethod < METHODS.length - 1) {
                currentScreen = { ...s, selectedMethod: s.selectedMethod + 1 };
                render();
            }
            return;

        case 'ENTER': {
            const method = METHODS[s.selectedMethod]?.id;
            if (!method) return;

            if (method === 'list') {
                void handleListMethod(s.player);
                return;
            }

            if (method === 'clear') {
                // Vai direto para confirmação sem dado específico (clear all)
                currentScreen = { screen: 'confirm-clear', player: s.player, dice: undefined, selectedOpt: 1 };
                render();
                return;
            }

            // Métodos que precisam de dado (d20 pré-selecionado)
            const d20Index = DICE_TYPES.indexOf('d20');
            currentScreen = {
                screen: 'param-dice',
                player: s.player,
                method,
                selectedDice: d20Index >= 0 ? d20Index : 0,
            };
            render();
            return;
        }
    }
}

async function handleListMethod(player: Player): Promise<void> {
    try {
        const target = playerTarget(player);
        const list = await listDiceOverrides(target);

        // Mescla no painel direito imediatamente
        const others = overrides.filter(o => o.targetId !== target.targetId);
        overrides = [...list, ...others];
        overridesLastRefresh = new Date();

        if (list.length === 0) {
            setStatus(`${player.name}: sem overrides ativos`);
        } else {
            setStatus(`${player.name}: ${list.length} override(s) carregado(s)`);
        }
    } catch (err) {
        setStatus(`Erro: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
}

// param-dice ──────────────────────────────────────────────────────────────────

function handleParamDice(name: string, s: Extract<AppScreen, { screen: 'param-dice' }>): void {
    switch (name) {
        case 'ESCAPE': {
            const methodIdx = METHODS.findIndex(m => m.id === s.method);
            currentScreen = { screen: 'method-list', player: s.player, selectedMethod: methodIdx };
            render();
            return;
        }

        case 'UP':
            if (s.selectedDice > 0) {
                currentScreen = { ...s, selectedDice: s.selectedDice - 1 };
                render();
            }
            return;

        case 'DOWN':
            if (s.selectedDice < DICE_TYPES.length - 1) {
                currentScreen = { ...s, selectedDice: s.selectedDice + 1 };
                render();
            }
            return;

        case 'ENTER': {
            const dice = DICE_TYPES[s.selectedDice];
            if (!dice) return;

            const firstField: 'value' | 'min' = s.method === 'range' ? 'min' : 'value';
            currentScreen = {
                screen: 'param-value',
                player: s.player,
                method: s.method,
                dice,
                field: firstField,
                buffer: '',
                cursorPos: 0,
            };
            render();
            return;
        }
    }
}

// param-value ─────────────────────────────────────────────────────────────────

function handleParamValue(
    name: string,
    data: { isCharacter?: boolean },
    s: Extract<AppScreen, { screen: 'param-value' }>
): void {
    if (name === 'ESCAPE') {
        const diceIndex = DICE_TYPES.indexOf(s.dice);
        const d20Index  = DICE_TYPES.indexOf('d20');
        currentScreen = {
            screen: 'param-dice',
            player: s.player,
            method: s.method,
            selectedDice: diceIndex >= 0 ? diceIndex : (d20Index >= 0 ? d20Index : 0),
        };
        render();
        return;
    }

    if (name === 'ENTER') {
        const parsed = parseInt(s.buffer, 10);
        if (isNaN(parsed) || s.buffer.trim() === '') {
            setStatus('Digite um número válido', 'error');
            return;
        }

        if (s.method === 'range' && s.field === 'min') {
            currentScreen = { ...s, field: 'max', buffer: '', cursorPos: 0, minValue: parsed };
            render();
            return;
        }

        void persistOverride(s, parsed);
        return;
    }

    // Só aceita dígitos nos inputs numéricos
    if (data?.isCharacter) {
        if (!/^\d$/.test(name)) return;
        updateBuffer(name, data, s.buffer, s.cursorPos, (buffer, cursorPos) => {
            currentScreen = { ...s, buffer, cursorPos };
            render();
        });
        return;
    }

    // Teclas de navegação do cursor (backspace, delete, setas)
    updateBuffer(name, data, s.buffer, s.cursorPos, (buffer, cursorPos) => {
        if (/^\d*$/.test(buffer)) {
            currentScreen = { ...s, buffer, cursorPos };
            render();
        }
    });
}

async function persistOverride(s: Extract<AppScreen, { screen: 'param-value' }>, value: number): Promise<void> {
    try {
        const target = playerTarget(s.player);
        const input =
            s.method === 'min'   ? { dice: s.dice, min: value } :
            s.method === 'max'   ? { dice: s.dice, max: value } :
            s.method === 'exact' ? { dice: s.dice, exact: value } :
            /* range */             { dice: s.dice, min: s.minValue!, max: value };

        const record = await upsertDiceOverride(target, input);

        // Atualiza painel direito imediatamente
        overrides = overrides.filter(o => !(o.targetId === target.targetId && o.dice === s.dice));
        overrides.unshift(record);
        overridesLastRefresh = new Date();

        const methodIdx = METHODS.findIndex(m => m.id === s.method);
        setStatus(`Salvo: ${s.player.name} — ${formatOverride(record)}`);
        currentScreen = { screen: 'method-list', player: s.player, selectedMethod: methodIdx };
    } catch (err) {
        setStatus(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'error');
        currentScreen = { screen: 'method-list', player: s.player, selectedMethod: 0 };
    }
    render();
}

// confirm-clear ────────────────────────────────────────────────────────────────

function handleConfirmClear(name: string, s: Extract<AppScreen, { screen: 'confirm-clear' }>): void {
    const clearMethodIdx = METHODS.findIndex(m => m.id === 'clear');

    switch (name) {
        case 'ESCAPE':
            currentScreen = { screen: 'method-list', player: s.player, selectedMethod: clearMethodIdx };
            render();
            return;

        case 'UP':
        case 'DOWN':
            currentScreen = { ...s, selectedOpt: s.selectedOpt === 0 ? 1 : 0 };
            render();
            return;

        case 'ENTER':
            if (s.selectedOpt === 1) {
                // Cancelar
                currentScreen = { screen: 'method-list', player: s.player, selectedMethod: clearMethodIdx };
                render();
            } else {
                void executeClear(s);
            }
            return;
    }
}

async function executeClear(s: Extract<AppScreen, { screen: 'confirm-clear' }>): Promise<void> {
    const clearMethodIdx = METHODS.findIndex(m => m.id === 'clear');
    try {
        const target = playerTarget(s.player);
        const result = await clearDiceOverrides(target, s.dice);

        // Atualiza painel direito
        if (s.dice) {
            overrides = overrides.filter(o => !(o.targetId === target.targetId && o.dice === s.dice));
        } else {
            overrides = overrides.filter(o => o.targetId !== target.targetId);
        }
        overridesLastRefresh = new Date();

        const scope = s.dice ?? 'todos os dados';
        setStatus(`${result.deletedCount} override(s) removido(s) — ${scope}`);
    } catch (err) {
        setStatus(`Erro ao limpar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    currentScreen = { screen: 'method-list', player: s.player, selectedMethod: clearMethodIdx };
    render();
}

// ─── Utilitário de edição de buffer de texto ──────────────────────────────────

function wordStart(s: string, pos: number): number {
    let i = pos - 1;
    while (i > 0 && s[i - 1] === ' ') i--;
    while (i > 0 && s[i - 1] !== ' ') i--;
    return Math.max(0, i);
}

function wordEnd(s: string, pos: number): number {
    let i = pos;
    while (i < s.length && s[i] === ' ') i++;
    while (i < s.length && s[i] !== ' ') i++;
    return i;
}

type BufferUpdater = (buffer: string, cursorPos: number) => void;

function updateBuffer(
    name: string,
    data: { isCharacter?: boolean },
    buffer: string,
    cursorPos: number,
    cb: BufferUpdater
): void {
    switch (name) {
        case 'LEFT':
            if (cursorPos > 0) cb(buffer, cursorPos - 1);
            return;
        case 'RIGHT':
            if (cursorPos < buffer.length) cb(buffer, cursorPos + 1);
            return;
        case 'CTRL_LEFT':
            cb(buffer, wordStart(buffer, cursorPos));
            return;
        case 'CTRL_RIGHT':
            cb(buffer, wordEnd(buffer, cursorPos));
            return;
        case 'BACKSPACE':
            if (cursorPos > 0) {
                cb(buffer.slice(0, cursorPos - 1) + buffer.slice(cursorPos), cursorPos - 1);
            }
            return;
        case 'DELETE':
            if (cursorPos < buffer.length) {
                cb(buffer.slice(0, cursorPos) + buffer.slice(cursorPos + 1), cursorPos);
            }
            return;
        case 'CTRL_BACKSPACE':
        case 'ALT_BACKSPACE': {
            const newPos = wordStart(buffer, cursorPos);
            cb(buffer.slice(0, newPos) + buffer.slice(cursorPos), newPos);
            return;
        }
        default:
            if (data?.isCharacter && name.length === 1) {
                cb(buffer.slice(0, cursorPos) + name + buffer.slice(cursorPos), cursorPos + 1);
            }
    }
}

// ─── Setup e cleanup ──────────────────────────────────────────────────────────

function setupInput(): void {
    term.grabInput(true);
    term.on('key', (name: string, _matches: string[], data: { isCharacter?: boolean }) => {
        if (name === 'CTRL_C') {
            cleanup();
            process.exit(0);
        }
        handleKey(name, data);
    });
}

function cleanup(): void {
    if (statusTimer)  { clearTimeout(statusTimer);   statusTimer = null; }
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    term.grabInput(false);
    term.hideCursor(false);
    term.fullscreen(false);
    void mongoose.disconnect();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    term.clear();
    term.bold.cyan('\n  Dice Override CLI\n\n');

    try {
        term.cyan('  Conectando ao banco de dados...\n');
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error('MONGODB_URI não está definido no .env');
        await mongoose.connect(mongoUri, { bufferCommands: false });
        term.green('  Conectado!\n\n');
    } catch (err) {
        term.red(`\n  Erro ao conectar: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    term.cyan('  Carregando overrides...\n');
    await refreshOverrides();

    term.fullscreen(true);
    term.hideCursor(true);

    currentScreen = { screen: 'player-list' };
    playerSelectedIndex = 0;
    render();

    setupInput();
    scheduleAutoRefresh();
}

process.on('unhandledRejection', (reason) => {
    cleanup();
    term.red(`\nErro não tratado: ${reason}\n`);
    process.exit(1);
});

main().catch((err) => {
    term.red(`\nErro fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
