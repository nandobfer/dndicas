/**
 * @fileoverview Seed Data Script — Entry Point
 *
 * Loads environment, connects to MongoDB, lets the user select a provider
 * via a terminal-kit menu, and runs it.
 *
 * Usage:
 *   tsx scripts/seed-data/index.ts
 *
 * To reset progress for a provider, delete/edit scripts/seed-data/progress.json.
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import terminal from 'terminal-kit';

// Type-only imports — erased at compile time, generate no require() calls.
import type { BaseProvider, RateLimitConfig } from './base-provider';

// Load .env FIRST — must happen before requiring any module that reads env vars
// at load time (e.g. src/core/ai/genai.ts reads GOOGLE_API_KEY at module level).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SpellsProvider } = require('./providers/spells-provider') as typeof import('./providers/spells-provider');

const term = terminal.terminal;

// ─── Register providers here ──────────────────────────────────────────────────
// When new providers are created, just add them to this array.

const providers: BaseProvider<unknown, unknown>[] = [
    new SpellsProvider(),
];

// ─── Database ─────────────────────────────────────────────────────────────────

async function connectDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set. Check your .env file.');
    }
    await mongoose.connect(mongoUri);
}

// ─── List models ──────────────────────────────────────────────────────────────

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

// ─── AI / Rate limit config ───────────────────────────────────────────────────

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
    // Handle --list-models flag before any interactive UI
    if (process.argv.includes('--list-models')) {
        dotenv.config({ path: path.resolve(__dirname, '../../.env') });
        await listAvailableModels();
        process.exit(0);
    }

    setupExitHandler();

    let provider: BaseProvider<unknown, unknown>;
    let rateLimitConfig: RateLimitConfig;

    try {
        provider = await selectProvider();
        rateLimitConfig = await askRateLimitConfig();
    } catch {
        term('\n');
        term.yellow('Exiting.\n');
        process.exit(0);
    }

    provider!.configure(rateLimitConfig!);

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
    } catch {
        exitCode = 1;
    } finally {
        await mongoose.disconnect();
        term.cyan('\nDisconnected from database.\n');
        process.exit(exitCode);
    }
}

main();