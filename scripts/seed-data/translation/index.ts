export { BaseTranslator } from './base-translator';
export { GenAITranslator } from './genai-translator';
export type { RateLimitConfig } from './genai-translator';
export { GoogleCloudTranslator } from './google-cloud-translator';
export { LibreTranslateTranslator } from './libretranslate-translator';

import { GenAITranslator } from './genai-translator';
import { GoogleCloudTranslator } from './google-cloud-translator';
import { LibreTranslateTranslator } from './libretranslate-translator';
import type { BaseTranslator } from './base-translator';

/** All available translation providers, in display order. */
export const ALL_TRANSLATORS: BaseTranslator[] = [
    new GenAITranslator(),
    new GoogleCloudTranslator(),
    new LibreTranslateTranslator(),
];
