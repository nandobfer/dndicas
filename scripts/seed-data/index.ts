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
import type { BaseProvider } from './base-provider';

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
    setupExitHandler();

    let provider: BaseProvider<unknown, unknown>;

    try {
        provider = await selectProvider();
    } catch {
        term('\n');
        term.yellow('Exiting.\n');
        process.exit(0);
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
    } catch {
        exitCode = 1;
    } finally {
        await mongoose.disconnect();
        term.cyan('\nDisconnected from database.\n');
        process.exit(exitCode);
    }
}

main();