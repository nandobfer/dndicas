/**
 * @fileoverview Seed Data Script — Entry Point
 *
 * Loads environment, connects to MongoDB, lets the user select a provider
 * and a translation provider via terminal-kit menus, and runs it.
 *
 * Usage:
 *   tsx scripts/seed-data/index.ts [flags]
 *
 * Run with --help to see all available flags.
 * To reset progress for a provider, run with --reset-progress.
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import terminal from 'terminal-kit';

// Type-only imports — erased at compile time, generate no require() calls.
import type { BaseProvider } from './base-provider';
import type { BaseTranslator, RateLimitConfig, LibreTranslateTranslator as LibreTranslateTranslatorType } from './translation';
import { countEntries, clearAllEntries, backupGlossary, restoreGlossary } from './glossary/glossary-store';
import { listAllProgress, resetProgress } from './progress/progress-store';

// Load .env FIRST — must happen before requiring any module that reads env vars
// at load time (e.g. src/core/ai/genai.ts reads GOOGLE_API_KEY at module level).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SpellsProvider } = require('./providers/spells-provider') as typeof import('./providers/spells-provider');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RacesProvider } = require('./providers/races-provider') as typeof import('./providers/races-provider');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FeatsProvider } = require('./providers/feats-provider') as typeof import('./providers/feats-provider');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ItemsProvider } = require('./providers/items-provider') as typeof import('./providers/items-provider');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ALL_TRANSLATORS, GenAITranslator, LibreTranslateTranslator } = require('./translation') as typeof import('./translation');

const term = terminal.terminal;

// ─── Register providers here ──────────────────────────────────────────────────
// When new providers are created, just add them to this array.

const providers: BaseProvider<unknown, unknown>[] = [
    new SpellsProvider(),
    new RacesProvider(),
    new FeatsProvider(),
    new ItemsProvider(),
];

// ─── Database ─────────────────────────────────────────────────────────────────

async function connectDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set. Check your .env file.');
    }
    await mongoose.connect(mongoUri);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
    term.bold.cyan('\n🎲 D&D Seed Data Script\n');
    term('─────────────────────────────────────────\n\n');

    term.bold('Uso:\n');
    term('  tsx scripts/seed-data/index.ts [flags]\n\n');

    term.bold('Flags:\n');
    term.green('  --help             ');
    term('Exibe esta ajuda e encerra\n');
    term.green('  --list-models      ');
    term('Lista modelos GenAI disponíveis e encerra\n');
    term.green('  --clear-glossary   ');
    term('Backup + limpa o glossário no MongoDB e encerra\n');
    term.green('  --dump-glossary    ');
    term('Exporta o glossário via mongodump e encerra\n');
    term.green('  --restore-glossary ');
    term('[./path]  Restaura o glossário de um backup (path opcional; tab completion ✅)\n');
    term.green('  --reset-progress   ');
    term('Reseta o progresso de um provider no MongoDB e encerra\n');
    term.green('  --test / --dry-run ');
    term('Revisão interativa do 1º item, não salva no banco\n');
    term.green('  --auto             ');
    term('Processa todos os itens sem confirmação (batch)\n');
    term.green('  --from-start       ');
    term('Ignora o progresso salvo e começa a iterar do índice 0\n');
    term.green('  --from <índice>    ');
    term('Começa a iterar a partir do índice especificado (ex: --from 117)\n\n');
    term.green('  --filter <termo>   ');
    term('Filtra os dados por nome usando busca fuzzy; não usa nem salva progresso\n\n');

    term.bold('Modos de execução:\n\n');

    const col = [24, 20, 13];
    const line = `┌${'─'.repeat(col[0])}┬${'─'.repeat(col[1])}┬${'─'.repeat(col[2])}┐\n`;
    const mid   = `├${'─'.repeat(col[0])}┼${'─'.repeat(col[1])}┼${'─'.repeat(col[2])}┤\n`;
    const bot   = `└${'─'.repeat(col[0])}┴${'─'.repeat(col[1])}┴${'─'.repeat(col[2])}┘\n`;

    const row = (a: string, b: string, c: string) =>
        `│ ${a.padEnd(col[0] - 2)} │ ${b.padEnd(col[1] - 2)} │ ${c.padEnd(col[2] - 2)} │\n`;

    term(line);
    term.bold(row('Modo', 'Revisão interativa', 'Salva no DB'));
    term(mid);
    term(row('(padrão)', '✅', '✅'));
    term(mid);
    term(row('--test / --dry-run', '✅', '❌'));
    term(mid);
    term(row('--auto', '❌', '✅'));
    term(mid);
    term(row('--auto --dry-run', '❌', '❌'));
    term(bot);
    term('\n');
}

// ─── Reset progress ───────────────────────────────────────────────────────────

async function runResetProgress(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        term.red('✗ MONGODB_URI não está configurado no .env\n');
        process.exit(1);
    }

    term.bold.cyan('\n🔄  Resetar progresso\n');
    term('─────────────────────────────────────────\n\n');

    term.cyan('Conectando ao banco...\n');
    await mongoose.connect(mongoUri);

    const records = await listAllProgress();

    if (records.length === 0) {
        term.yellow('⚠  Nenhum progresso salvo. Nada a fazer.\n');
        await mongoose.disconnect();
        return;
    }

    term.bold('Providers com progresso salvo:\n\n');
    for (const r of records) {
        term.cyan(`  ${r.providerName}`);
        term.gray(` → último índice: ${r.lastIndex}\n`);
    }
    term('\n');

    const providerNames = records.map((r) => r.providerName);
    term('Selecione o provider para resetar:\n\n');

    const selected = await new Promise<string>((resolve, reject) => {
        term.singleColumnMenu(providerNames, { cancelable: true }, (error, response) => {
            if (error || response.canceled) {
                reject(new Error('Selection cancelled.'));
                return;
            }
            resolve(providerNames[response.selectedIndex]);
        });
    });

    term('\n');
    term.yellow(`⚠  Isso irá resetar o progresso de "${selected}" (índice → -1).\n`);
    term.cyan('Confirmar? ');
    term.gray('[y/N]: ');

    const answer = await new Promise<string>((resolve) => {
        term.inputField({}, (_, value) => {
            term('\n');
            resolve((value ?? '').trim().toLowerCase());
        });
    });

    if (answer !== 'y') {
        term.yellow('\n⚠  Operação cancelada.\n');
        await mongoose.disconnect();
        return;
    }

    await resetProgress(selected);
    term.green(`\n✓ Progresso de "${selected}" resetado. O próximo run começará do índice 0.\n`);

    await mongoose.disconnect();
}

// ─── Clear glossary ───────────────────────────────────────────────────────────

async function runClearGlossary(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        term.red('✗ MONGODB_URI não está configurado no .env\n');
        process.exit(1);
    }

    term.bold.cyan('\n🗑  Limpar glossário\n');
    term('─────────────────────────────────────────\n\n');

    term.cyan('Conectando ao banco...\n');
    await mongoose.connect(mongoUri);

    const count = await countEntries();

    if (count === 0) {
        term.yellow('⚠  O glossário já está vazio. Nada a fazer.\n');
        await mongoose.disconnect();
        return;
    }

    term.yellow(`⚠  ${count} entrada(s) encontrada(s) no glossário.\n\n`);
    term.bold('Esta ação irá:\n');
    term('  1. Fazer backup da collection via mongodump\n');
    term('  2. Apagar todas as entradas do glossário\n\n');
    term.red('Esta ação não pode ser desfeita (exceto pelo backup).\n\n');

    term.cyan('Confirmar? ');
    term.gray('[y/N]: ');

    const answer = await new Promise<string>((resolve) => {
        term.inputField({}, (_, value) => {
            term('\n');
            resolve((value ?? '').trim().toLowerCase());
        });
    });

    if (answer !== 'y') {
        term.yellow('\n⚠  Operação cancelada.\n');
        await mongoose.disconnect();
        return;
    }

    term('\n');
    term.cyan('📦 Fazendo backup com mongodump...\n');

    let backupPath: string;
    try {
        backupPath = backupGlossary(mongoUri);
        term.green(`  ✓ Backup salvo em: ${backupPath}\n`);
    } catch (err) {
        term.red(`  ✗ Falha no backup: ${err instanceof Error ? err.message : String(err)}\n`);
        term.yellow('  Abortando — glossário não foi apagado.\n');
        await mongoose.disconnect();
        process.exit(1);
    }

    term.cyan('🗑  Limpando glossário...\n');
    await clearAllEntries();
    term.green(`  ✓ ${count} entrada(s) removida(s).\n\n`);

    term.bold.green('✓ Glossário limpo com sucesso!\n');
    term.gray(`  Backup disponível em: ${backupPath}\n`);

    await mongoose.disconnect();
}

// ─── Dump glossary ────────────────────────────────────────────────────────────

async function runDumpGlossary(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        term.red('✗ MONGODB_URI não está configurado no .env\n');
        process.exit(1);
    }

    term.bold.cyan('\n📦 Exportar glossário\n');
    term('─────────────────────────────────────────\n\n');

    term.cyan('Conectando ao banco...\n');
    await mongoose.connect(mongoUri);

    const count = await countEntries();
    term.cyan(`  ${count} entrada(s) no glossário.\n\n`);

    term.cyan('📦 Fazendo dump com mongodump...\n');

    let backupPath: string;
    try {
        backupPath = backupGlossary(mongoUri);
        term.green(`\n✓ Dump salvo em: ${backupPath}\n`);
    } catch (err) {
        term.red(`✗ Falha no dump: ${err instanceof Error ? err.message : String(err)}\n`);
        await mongoose.disconnect();
        process.exit(1);
    }

    await mongoose.disconnect();
}

// ─── Restore glossary ─────────────────────────────────────────────────────────

async function runRestoreGlossary(filePath?: string): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        term.red('✗ MONGODB_URI não está configurado no .env\n');
        process.exit(1);
    }

    term.bold.cyan('\n♻️  Restaurar glossário\n');
    term('─────────────────────────────────────────\n\n');

    let resolvedPath = filePath;

    if (!resolvedPath) {
        term.cyan('Caminho do backup ');
        term.gray('(diretório gerado por --dump-glossary ou --clear-glossary)');
        term.cyan(': ');

        resolvedPath = await new Promise<string>((resolve) => {
            term.inputField({}, (_, value) => {
                term('\n');
                resolve((value ?? '').trim());
            });
        });
    }

    if (!resolvedPath) {
        term.yellow('\n⚠  Caminho não informado. Operação cancelada.\n');
        process.exit(0);
    }

    // Resolve relative to cwd so ./backups/... works naturally
    const absolutePath = path.resolve(process.cwd(), resolvedPath);

    const fs = await import('fs');
    if (!fs.existsSync(absolutePath)) {
        term.red(`✗ Diretório não encontrado: ${absolutePath}\n`);
        process.exit(1);
    }

    term.cyan('Conectando ao banco...\n');
    await mongoose.connect(mongoUri);

    const currentCount = await countEntries();
    term('\n');
    term.yellow(`⚠  Entradas atuais no glossário: ${currentCount}\n`);
    term.bold('Esta ação irá substituir todas as entradas atuais pelo conteúdo do backup.\n\n');
    term.red('Esta ação não pode ser desfeita.\n\n');

    term.cyan('Confirmar? ');
    term.gray('[y/N]: ');

    const answer = await new Promise<string>((resolve) => {
        term.inputField({}, (_, value) => {
            term('\n');
            resolve((value ?? '').trim().toLowerCase());
        });
    });

    if (answer !== 'y') {
        term.yellow('\n⚠  Operação cancelada.\n');
        await mongoose.disconnect();
        return;
    }

    term('\n');
    term.cyan('♻️  Restaurando com mongorestore...\n');

    try {
        restoreGlossary(mongoUri, absolutePath);
    } catch (err) {
        term.red(`✗ Falha na restauração: ${err instanceof Error ? err.message : String(err)}\n`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const newCount = await countEntries();
    term.green(`\n✓ Glossário restaurado com sucesso! ${newCount} entrada(s) carregada(s).\n`);

    await mongoose.disconnect();
}



async function listAvailableModels(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGenAIClient } = require('../../src/core/ai/genai') as typeof import('../../src/core/ai/genai');

    term.cyan('Fetching available models from Gemini API...\n\n');

    const ai = getGenAIClient();
    const models: string[] = [];

    // The Pager has a Symbol.asyncIterator at runtime but TS types don't expose it;
    // cast to any to iterate safely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pager = await ai.models.list() as any;
    for await (const model of pager) {
        if (model?.name && model.supportedActions?.includes('generateContent')) {
            models.push((model.name as string).replace('models/', ''));
        }
    }

    if (models.length === 0) {
        term.yellow('No models supporting generateContent found.\n');
        return;
    }

    term.bold('Available models (supports generateContent):\n');
    for (const m of models.sort()) {
        term.green(`  ${m}\n`);
    }
    term('\n');
}

// ─── GenAI / Rate limit config ────────────────────────────────────────────────

async function askRateLimitConfig(): Promise<RateLimitConfig> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { defaultModel } = require('../../src/core/ai/genai') as typeof import('../../src/core/ai/genai');

    term('\n');
    term.gray('  Tip: run with --list-models to see all available model IDs\n\n');

    const model = await new Promise<string>((resolve) => {
        term.cyan(`AI model `);
        term.gray(`(leave empty for default: ${defaultModel})`);
        term.cyan(`: `);
        term.inputField({}, (_, input) => {
            term('\n');
            resolve((input ?? '').trim());
        });
    });

    const rpmStr = await new Promise<string>((resolve) => {
        term.cyan('Requests per minute (RPM) ');
        term.gray('(0 = no limit): ');
        term.inputField({}, (_, input) => {
            term('\n');
            resolve((input ?? '').trim());
        });
    });

    const rpdStr = await new Promise<string>((resolve) => {
        term.cyan('Requests per day (RPD) ');
        term.gray('(0 = no limit): ');
        term.inputField({}, (_, input) => {
            term('\n');
            resolve((input ?? '').trim());
        });
    });

    const rpm = Math.max(0, parseInt(rpmStr || '0', 10) || 0);
    const rpd = Math.max(0, parseInt(rpdStr || '0', 10) || 0);

    term.dim(`  Model: ${model || defaultModel}  |  RPM: ${rpm || 'unlimited'}  |  RPD: ${rpd || 'unlimited'}\n`);

    return { model, rpm, rpd };
}

// ─── Translator selector ──────────────────────────────────────────────────────

async function selectTranslator(): Promise<BaseTranslator> {
    term('\nSelect a translation provider:\n\n');

    const menuItems = ALL_TRANSLATORS.map((t) => t.name);

    const translator = await new Promise<BaseTranslator>((resolve, reject) => {
        term.singleColumnMenu(menuItems, { cancelable: true }, (error, response) => {
            if (error || response.canceled) {
                reject(new Error('Selection cancelled.'));
                return;
            }
            resolve(ALL_TRANSLATORS[response.selectedIndex]);
        });
    });

    term('\n');

    if (translator instanceof GenAITranslator) {
        const rateLimitConfig = await askRateLimitConfig();
        translator.configure(rateLimitConfig);
    }

    if (translator instanceof LibreTranslateTranslator) {
        term('\n');
        term.gray('   Modelo ativo será detectado automaticamente ao iniciar o servidor.\n');
        term.gray('   Prefere en→pb (pt-BR) se disponível, caso contrário en→pt (pt-PT).\n');
    }

    return translator;
}

// ─── Provider selector ────────────────────────────────────────────────────────

async function selectProvider(): Promise<BaseProvider<unknown, unknown>> {
    term.bold.cyan('\n🎲 D&D Seed Data Script\n');
    term('─────────────────────────────────────────\n\n');
    term('Select a provider:\n\n');

    const menuItems = providers.map((p) => p.name);

    return new Promise((resolve, reject) => {
        term.singleColumnMenu(menuItems, { cancelable: true }, (error, response) => {
            if (error || response.canceled) {
                reject(new Error('Selection cancelled.'));
                return;
            }
            resolve(providers[response.selectedIndex]);
        });
    });
}

// ─── Exit handling ────────────────────────────────────────────────────────────

function setupExitHandler(): void {
    // terminal-kit grabs raw keyboard input, which prevents Node.js from
    // receiving SIGINT when Ctrl+C is pressed. Listening for the CTRL_C key
    // event on the term object is the reliable way to handle it.
    term.on('key', (name: string) => {
        if (name === 'CTRL_C') {
            term.grabInput(false);
            term('\n\n');
            term.yellow('⚠ Interrupted. Progress has been saved.\n');
            process.exit(0);
        }
    });

    // Fallback for when terminal-kit is not actively grabbing input
    // (e.g. during async DB/AI operations between menu and run loop).
    process.on('SIGINT', () => {
        term.grabInput(false);
        term('\n\n');
        term.yellow('⚠ Interrupted. Progress has been saved.\n');
        process.exit(0);
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    // Handle early-exit flags before any interactive UI
    if (process.argv.includes('--help')) {
        printHelp();
        process.exit(0);
    }

    if (process.argv.includes('--clear-glossary')) {
        await runClearGlossary();
        process.exit(0);
    }

    if (process.argv.includes('--dump-glossary')) {
        await runDumpGlossary();
        process.exit(0);
    }

    const restoreIdx = process.argv.indexOf('--restore-glossary');
    if (restoreIdx !== -1) {
        const nextArg = process.argv[restoreIdx + 1];
        const restorePath = nextArg && !nextArg.startsWith('--') ? nextArg : undefined;
        await runRestoreGlossary(restorePath);
        process.exit(0);
    }

    if (process.argv.includes('--reset-progress')) {
        await runResetProgress();
        process.exit(0);
    }

    // Handle --list-models flag before any interactive UI
    if (process.argv.includes('--list-models')) {
        dotenv.config({ path: path.resolve(__dirname, '../../.env') });
        await listAvailableModels();
        process.exit(0);
    }

    // Detect --test or --dry-run mode
    const testMode = process.argv.includes('--test') || process.argv.includes('--dry-run');
    const autoMode = process.argv.includes('--auto');
    const fromStart = process.argv.includes('--from-start');
    const filterIdx = process.argv.indexOf('--filter');
    const filterValue = filterIdx !== -1 ? process.argv[filterIdx + 1] : undefined;

    const fromIdx = process.argv.indexOf('--from');
    const fromIndex = fromIdx !== -1 ? parseInt(process.argv[fromIdx + 1] ?? '', 10) : NaN;

    if (filterIdx !== -1 && (!filterValue || filterValue.startsWith('--'))) {
        term.red('✗ --filter requer um valor. Exemplo: --filter yan-ti\n');
        process.exit(1);
    }

    if (filterIdx !== -1 && (fromStart || fromIdx !== -1)) {
        term.red('✗ --filter não pode ser combinado com --from ou --from-start\n');
        process.exit(1);
    }

    if (testMode) {
        term.yellow('\n🧪 TEST/DRY-RUN MODE ENABLED\n');
        term.dim('   • Will process only the first item\n');
        term.dim('   • Will NOT save to database\n');
        term.dim('   • Interactive glossary review enabled\n\n');
    } else if (autoMode) {
        term.cyan('\n⚡ AUTO MODE ENABLED\n');
        term.dim('   • Will process all items without confirmation\n');
        term.dim('   • Glossary will be applied automatically\n\n');
    } else {
        term.cyan('\n💬 INTERACTIVE MODE\n');
        term.dim('   • Each item will be shown for review\n');
        term.dim('   • You can add glossary corrections before confirming\n\n');
    }

    if (fromStart) {
        term.yellow('⏮  FROM-START MODE ENABLED\n');
        term.dim('   • Saved progress will be ignored\n');
        term.dim('   • Iteration will begin from index 0\n\n');
    }

    if (fromIdx !== -1) {
        if (isNaN(fromIndex)) {
            term.red('✗ --from requer um número válido. Exemplo: --from 117\n');
            process.exit(1);
        }
        term.yellow(`⏩  FROM INDEX: ${fromIndex}\n`);
        term.dim(`   • Saved progress will be ignored\n`);
        term.dim(`   • Iteration will begin from index ${fromIndex}\n\n`);
    }

    if (filterIdx !== -1) {
        term.yellow(`🔎  FILTER MODE: ${filterValue}\n`);
        term.dim('   • Will fuzzy-filter provider items by name\n');
        term.dim('   • Saved progress will be ignored\n');
        term.dim('   • No progress will be persisted for this run\n\n');
    }

    setupExitHandler();

    let provider: BaseProvider<unknown, unknown>;
    let translator: BaseTranslator;

    try {
        provider = await selectProvider();
        translator = await selectTranslator();
    } catch {
        term('\n');
        term.yellow('Exiting.\n');
        process.exit(0);
    }

    provider!.setTranslator(translator!);
    if (testMode) {
        provider!.setTestMode(true);
    }
    if (autoMode) {
        provider!.setAutoMode(true);
    }
    if (fromStart) {
        provider!.setFromStart(true);
    }
    if (!isNaN(fromIndex)) {
        provider!.setFromIndex(fromIndex);
    }
    if (filterValue) {
        provider!.setFilter(filterValue);
    }

    // If LibreTranslate was selected, start its server (and run setup if needed).
    // Register a cleanup handler so the server is stopped on any exit path.
    if (translator! instanceof LibreTranslateTranslator) {
        const libreTranslator = translator as LibreTranslateTranslatorType;
        try {
            await libreTranslator.ensureServerRunning();
        } catch (err) {
            term.red(`\n✗ Falha ao iniciar LibreTranslate: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
        }
        process.on('exit', () => libreTranslator.shutdown());
    }

    term('\n');
    term.cyan(`Connecting to database...\n`);

    try {
        await connectDatabase();
        term.green('✓ Connected to MongoDB\n');
    } catch (err) {
        term.red(`✗ Failed to connect: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    let exitCode = 0;
    try {
        await provider!.run();
    } catch (err) {
        exitCode = 1;
        term.red(`\n✗ Erro: ${err instanceof Error ? err.message : String(err)}\n`);
        if (err instanceof Error && err.stack) {
            term.gray(`${err.stack}\n`);
        }
    } finally {
        await mongoose.disconnect();
        term.cyan('\nDisconnected from database.\n');
        process.exit(exitCode);
    }
}

main();
