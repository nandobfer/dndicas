/**
 * @fileoverview GenAI translator — uses the configured AI model (Gemini) to
 * translate D&D items from English to Brazilian Portuguese.
 *
 * Extracted from base-provider.ts. Handles RPM/RPD rate limits and retries
 * automatically on 429 errors.
 *
 * Requires: GOOGLE_API_KEY in environment.
 */

import { generateText, defaultModel } from '../../../src/core/ai/genai';
import { BaseTranslator } from './base-translator';
import { convertFeetToMeters } from '../base-provider';
import terminal from 'terminal-kit';

const term = terminal.terminal;

export interface RateLimitConfig {
    /** AI model name — empty string means use defaultModel */
    model: string;
    /** Max requests per minute (0 = no limit) */
    rpm: number;
    /** Max requests per day (0 = no limit) */
    rpd: number;
}

export class GenAITranslator extends BaseTranslator {
    readonly name = 'GenAI (Gemini)';

    private aiModel: string = defaultModel;
    private rateLimitRpm = 0;
    private rateLimitRpd = 0;

    /** Timestamps (ms) of each AI request made this session, for RPM tracking */
    private requestTimestamps: number[] = [];
    /** Total AI requests made this session, for RPD tracking */
    private dailyRequestCount = 0;

    configure(config: RateLimitConfig): void {
        this.aiModel = config.model || defaultModel;
        this.rateLimitRpm = config.rpm;
        this.rateLimitRpd = config.rpd;
    }

    // ─── Sleep / rate limit ───────────────────────────────────────────────────

    async sleep(ms: number, reason: string): Promise<void> {
        const seconds = Math.ceil(ms / 1000);
        term.yellow(`⚠ Rate limit reached (${reason}). Waiting ${seconds}s...\n`);

        const end = Date.now() + ms;
        while (Date.now() < end) {
            const remaining = Math.ceil((end - Date.now()) / 1000);
            process.stdout.write(`\r  ⏳ Resuming in ${remaining}s...   `);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
        term.gray(`  Resuming...\n`);
    }

    private async enforceRateLimits(): Promise<void> {
        if (this.rateLimitRpd > 0 && this.dailyRequestCount >= this.rateLimitRpd) {
            await this.sleep(60 * 60 * 1000, `daily limit of ${this.rateLimitRpd} req/day reached`);
            this.dailyRequestCount = 0;
        }

        if (this.rateLimitRpm > 0) {
            const now = Date.now();
            const windowStart = now - 60_000;
            this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);

            if (this.requestTimestamps.length >= this.rateLimitRpm) {
                const oldestInWindow = this.requestTimestamps[0];
                const waitMs = oldestInWindow + 60_000 - now + 500;
                await this.sleep(waitMs, `RPM limit of ${this.rateLimitRpm} req/min reached`);
                const after = Date.now();
                this.requestTimestamps = this.requestTimestamps.filter((t) => t > after - 60_000);
            }
        }
    }

    private recordRequest(): void {
        this.requestTimestamps.push(Date.now());
        this.dailyRequestCount++;
    }

    // ─── Translation ──────────────────────────────────────────────────────────

    async translateItem(
        name: string,
        descriptionHtml: string,
    ): Promise<{ name: string; description: string }> {
        const prompt = `You are a D&D 5e expert and Brazilian Portuguese translator.
Translate the following D&D 5e item from English to Brazilian Portuguese (pt-BR).

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
  "name": "<translated name in pt-BR>",
  "description": "<translated HTML in pt-BR>"
}

For the description:
- Preserve ALL HTML tags exactly as-is (<p>, <strong>, etc.).
- Only translate the text content between the tags.
- "At Higher Levels." → "Em Níveis Superiores."
- Keep dice notation as plain text (e.g. 8d6, 1d4+1).
- Do NOT convert distances — keep the original feet/miles values. They will be converted separately.

═══ INPUT ═══
Name (English): ${name}

Description (HTML, English):
${descriptionHtml}`;

        await this.enforceRateLimits();

        let aiResponse: string;
        try {
            this.recordRequest();
            aiResponse = await generateText(prompt, this.aiModel, 'seed-script');
        } catch (err) {
            const isRateLimit =
                err instanceof Error &&
                (err.message.includes('429') ||
                    err.message.toLowerCase().includes('resource_exhausted') ||
                    err.message.toLowerCase().includes('quota'));

            if (isRateLimit) {
                const retryMatch = err instanceof Error
                    ? err.message.match(/"retryDelay"\s*:\s*"(\d+)s"/)
                    : null;
                const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) + 5 : 65;
                await this.sleep(retrySeconds * 1000, `429 from API — retry in ${retrySeconds}s`);
                this.recordRequest();
                aiResponse = await generateText(prompt, this.aiModel, 'seed-script');
            } else {
                throw err;
            }
        }

        const clean = aiResponse
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/, '')
            .trim();

        let translated: { name: string; description: string };
        try {
            translated = JSON.parse(clean);
        } catch {
            throw new Error(
                `AI returned invalid JSON for "${name}": ${aiResponse.slice(0, 300)}`,
            );
        }

        if (!translated.name || !translated.description) {
            throw new Error(`AI response missing name or description for "${name}"`);
        }

        return {
            name: translated.name,
            description: convertFeetToMeters(translated.description),
        };
    }
}
