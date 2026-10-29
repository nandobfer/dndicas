export { BaseTranslator } from './base-translator';
export { AiTranslator } from './ai-translator';
export type { RateLimitConfig } from './ai-translator';
export { GoogleCloudTranslator } from './google-cloud-translator';
export { LibreTranslateTranslator } from './libretranslate-translator';

import { AiTranslator } from './ai-translator';
import { GoogleCloudTranslator } from './google-cloud-translator';
import { LibreTranslateTranslator } from './libretranslate-translator';
import type { BaseTranslator } from './base-translator';

/** All available translation providers, in display order. */
export const ALL_TRANSLATORS: BaseTranslator[] = [
    new AiTranslator(),
    new GoogleCloudTranslator(),
    new LibreTranslateTranslator(),
];
