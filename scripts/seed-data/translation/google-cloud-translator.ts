/**
 * @fileoverview Google Cloud Translation API translator.
 *
 * Translates D&D items from English to Brazilian Portuguese using the
 * Google Cloud Translation API (v2 REST). Supports HTML format natively,
 * preserving all HTML tags during translation.
 *
 * Free tier: 500,000 characters/month.
 * Requires: GOOGLE_CLOUD_TRANSLATION_API_KEY in environment.
 *
 * Setup:
 *   1. Enable "Cloud Translation API" in Google Cloud Console
 *   2. Create an API key (APIs & Services → Credentials)
 *   3. Add to .env: GOOGLE_CLOUD_TRANSLATION_API_KEY=your_key_here
 */

import axios from 'axios';
import { BaseTranslator } from './base-translator';
import { convertFeetToMeters } from '../base-provider';

const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

export class GoogleCloudTranslator extends BaseTranslator {
    readonly name = 'Google Cloud Translation';

    private readonly apiKey: string;

    constructor() {
        super();
        this.apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY ?? '';
    }

    private assertConfigured(): void {
        if (!this.apiKey) {
            throw new Error(
                'GOOGLE_CLOUD_TRANSLATION_API_KEY is not set in environment. ' +
                'Add it to your .env file.',
            );
        }
    }

    private async translateHtml(html: string): Promise<string> {
        if (!html.trim()) return '';

        this.assertConfigured();
        const response = await axios.post<{
            data: { translations: Array<{ translatedText: string }> };
        }>(
            TRANSLATE_URL,
            {
                q: html,
                source: 'en',
                target: 'pt-BR',
                format: 'html',
            },
            {
                params: { key: this.apiKey },
                headers: { 'Content-Type': 'application/json' },
            },
        );

        const translated = response.data?.data?.translations?.[0]?.translatedText;
        if (!translated) {
            throw new Error('Google Cloud Translation returned empty response.');
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
