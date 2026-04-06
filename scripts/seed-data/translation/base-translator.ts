/**
 * @fileoverview Abstract base class for all translation providers.
 *
 * Each translator receives a D&D item name and a pre-built HTML description
 * (in English) and returns the translated name and HTML description in pt-BR.
 *
 * Usage:
 *   class MyTranslator extends BaseTranslator {
 *     async translateItem(name, descriptionHtml) { ... }
 *   }
 */

export abstract class BaseTranslator {
    abstract readonly name: string;

    /**
     * Translates a D&D item name and HTML description from English to pt-BR.
     *
     * @param name - Item name in English (plain text)
     * @param descriptionHtml - Item description as HTML with English text
     * @returns Translated name (plain text) and HTML description in pt-BR
     */
    abstract translateItem(
        name: string,
        descriptionHtml: string,
    ): Promise<{ name: string; description: string }>;
}

