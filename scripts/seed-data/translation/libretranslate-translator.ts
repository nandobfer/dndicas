/**
 * @fileoverview LibreTranslate self-hosted translator.
 *
 * Translates D&D items from English to Portuguese using a locally hosted
 * LibreTranslate instance. Supports HTML format natively, preserving all HTML
 * tags during translation.
 *
 * Model preference (detected automatically at startup):
 *   1. en→pb  Portuguese (Brazil) — from bundled translate-en_pb-1_9.argosmodel
 *   2. en→pt  Portuguese (Portugal) — fallback from argostranslate index
 *
 * Setup is handled automatically when this translator is selected:
 *   1. Checks if libretranslate Python package is installed
 *   2. Checks if the en→pt translation model is downloaded
 *   3. Runs setup if needed (installs package + downloads model)
 *   4. Starts the local server and waits until it's ready
 *
 * The server is stopped automatically when the script exits.
 *
 * Env vars (optional):
 *   LIBRETRANSLATE_URL     — override server URL (default: http://localhost:5000)
 *   LIBRETRANSLATE_PORT    — override port (default: 5000)
 *   LIBRETRANSLATE_API_KEY — API key if your instance requires authentication
 */

import axios from 'axios';
import terminal from 'terminal-kit';
import { BaseTranslator } from './base-translator';
import { convertFeetToMeters } from '../base-provider';
import { LibreTranslateServer } from '../libretranslate/server';

const term = terminal.terminal;

export class LibreTranslateTranslator extends BaseTranslator {
    readonly name = 'LibreTranslate (self-hosted)';

    private readonly baseUrl: string;
    private readonly port: number;
    private readonly apiKey: string | undefined;
    private server: LibreTranslateServer | null = null;

    constructor() {
        super();
        this.port = parseInt(process.env.LIBRETRANSLATE_PORT ?? '5000', 10);
        this.baseUrl = (process.env.LIBRETRANSLATE_URL ?? `http://localhost:${this.port}`).replace(/\/$/, '');
        this.apiKey = process.env.LIBRETRANSLATE_API_KEY;
    }

    // ─── Server lifecycle ─────────────────────────────────────────────────────

    /**
     * Verifies the setup (installs if needed) and starts the LibreTranslate
     * server. Must be called before translateItem().
     */
    async ensureServerRunning(): Promise<void> {
        this.server = new LibreTranslateServer(this.port);

        term.cyan('\n🐍 Verificando LibreTranslate...\n');

        const packageOk = await this.server.isPackageInstalled();
        const modelsOk = packageOk && await this.server.areModelsInstalled();

        if (packageOk && modelsOk) {
            term.green('   ✓ LibreTranslate está pronto.\n');
        } else {
            if (!packageOk) {
                term.yellow('   ✗ Pacote libretranslate não está instalado.\n');
            } else {
                term.yellow('   ✗ Modelos de tradução en→pt não encontrados.\n');
            }
            term.cyan('⚙  Executando setup do LibreTranslate...\n');
            await this.server.runSetup();
        }

        await this.server.start();
    }

    /**
     * Stops the LibreTranslate server. Called automatically on process exit.
     */
    shutdown(): void {
        this.server?.stop();
    }

    // ─── Translation ──────────────────────────────────────────────────────────

    private async translateHtml(html: string): Promise<string> {
        if (!html.trim()) return '';

        // Use the model code detected at server startup:
        //   'pb' = Portuguese (Brazil) — from bundled translate-en_pb-1_9.argosmodel
        //   'pt' = Portuguese (Portugal) — fallback from argostranslate index
        const target = this.server?.activeTargetCode ?? 'pt';

        const body: Record<string, string> = {
            q: html,
            source: 'en',
            target,
            format: 'html',
        };

        if (this.apiKey) {
            body['api_key'] = this.apiKey;
        }

        const response = await axios.post<{ translatedText: string }>(
            `${this.baseUrl}/translate`,
            body,
            { headers: { 'Content-Type': 'application/json' } },
        );

        const translated = response.data?.translatedText;
        if (!translated) {
            throw new Error('LibreTranslate returned empty response.');
        }
        return translated;
    }

    async translateItem(
        name: string,
        descriptionHtml: string,
    ): Promise<{ name: string; description: string }> {
        const [translatedName, translatedHtml] = await Promise.all([
            this.translateHtml(name),
            this.translateHtml(descriptionHtml),
        ]);

        return {
            name: translatedName,
            description: convertFeetToMeters(translatedHtml),
        };
    }
}
