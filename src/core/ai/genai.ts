/**
 * Google GenAI (Gemini) Service
 * Wrapper para a SDK do Google Gemini com logging automático de uso
 */

import { GoogleGenAI } from "@google/genai";
import { logUsage } from "./usage-log";

const API_KEY = process.env.GOOGLE_API_KEY;
const HIGH_DEMAND_RETRY_DELAY_MS = 1000;

if (!API_KEY) {
    console.warn("GOOGLE_API_KEY is not set. GenAI service will not work.");
}

// Singleton client
let client: GoogleGenAI | null = null;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const getErrorStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const candidate = error as { status?: unknown; code?: unknown; error?: { code?: unknown } };
    const status = candidate.status ?? candidate.code ?? candidate.error?.code;

    if (typeof status === 'number') {
        return status;
    }

    if (typeof status === 'string') {
        const parsed = Number(status);
        return Number.isNaN(parsed) ? undefined : parsed;
    }

    return undefined;
}

const stringifyError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

const getGeminiRetryableUnavailableReason = (error: unknown): string | null => {
    const status = getErrorStatus(error);
    const message = stringifyError(error).toLowerCase();

    if (status !== 503) {
        return null;
    }

    if (message.includes('high demand')) {
        return 'high demand';
    }

    if (
        message.includes('currently unavailable') ||
        message.includes('"status":"unavailable"') ||
        message.includes('"status": "unavailable"')
    ) {
        return 'temporary unavailability';
    }

    return null;
}

const withRetryableUnavailableRetry = async <T>(
    operationName: string,
    operation: () => Promise<T>
): Promise<T> => {
    let attempt = 1;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            const retryReason = getGeminiRetryableUnavailableReason(error);

            if (!retryReason) {
                throw error;
            }

            console.warn(`GenAI ${operationName} hit Gemini ${retryReason}. Retrying in 1s (attempt ${attempt + 1}).`);
            attempt += 1;
            await sleep(HIGH_DEMAND_RETRY_DELAY_MS);
        }
    }
}

/**
 * Obtém ou cria uma instância do cliente GenAI
 * @returns Cliente GoogleGenAI
 * @throws Error se GOOGLE_API_KEY não estiver configurada
 */
export const getGenAIClient = (): GoogleGenAI => {
    if (!client) {
        if (!API_KEY) {
            throw new Error("GOOGLE_API_KEY is not set. Please configure it in your environment variables.");
        }
        client = new GoogleGenAI({ apiKey: API_KEY });
    }
    return client;
}

/**
 * Modelo padrão para geração de texto
 * Usando gemini-2.0-flash-exp conforme SDK atual
 */
export const defaultModel = "gemini-2.5-flash-lite";
export const defaultImageModel = "gemini-2.5-flash-image";

interface GenAIInlineData {
    data?: string;
    mimeType?: string;
}

interface GenAIPart {
    text?: string;
    inlineData?: GenAIInlineData;
}

interface GenAICandidate {
    content?: {
        parts?: GenAIPart[];
    };
}

interface GenAIUsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

interface GenAIImageResponse {
    candidates?: GenAICandidate[];
    usageMetadata?: GenAIUsageMetadata;
}

export interface GeneratedImagePayload {
    buffer: Buffer;
    mimeType: string;
}

const extractImageParts = (response: GenAIImageResponse): GeneratedImagePayload[] => {
    const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? [];

    return parts.flatMap(part => {
        if (!part.inlineData?.data || !part.inlineData.mimeType) {
            return [];
        }

        return [{
            buffer: Buffer.from(part.inlineData.data, "base64"),
            mimeType: part.inlineData.mimeType,
        }];
    });
}

/**
 * Gera texto a partir de um prompt
 * @param prompt - Texto do prompt
 * @param modelName - Nome do modelo (opcional, usa defaultModel)
 * @param userId - ID do usuário para logging (opcional)
 * @returns Texto gerado
 *
 * @example
 * ```typescript
 * const response = await generateText('Explique o que é Next.js');
 * console.log(response);
 * ```
 */
export async function generateText(
    prompt: string,
    modelName: string = defaultModel,
    userId?: string
): Promise<string> {
    const ai = getGenAIClient();

    try {
        return await withRetryableUnavailableRetry('generateText', async () => {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
            });

            // Log de uso com tokens
            if (response.usageMetadata) {
                const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;

                await logUsage(
                    modelName,
                    promptTokenCount || 0,
                    candidatesTokenCount || 0,
                    totalTokenCount || 0,
                    userId
                );

                console.log(`GenAI Usage: ${totalTokenCount} tokens (in: ${promptTokenCount}, out: ${candidatesTokenCount})`);
            }

            return response.text || '';
        });
    } catch (error) {
        console.error("GenAI Error:", error);
        throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Gera texto com streaming (resposta em tempo real)
 * @param prompt - Texto do prompt
 * @param onChunk - Callback chamada para cada chunk de texto
 * @param modelName - Nome do modelo (opcional)
 * @param userId - ID do usuário para logging (opcional)
 *
 * @example
 * ```typescript
 * await generateTextStream(
 *   'Conte uma história',
 *   (chunk) => console.log(chunk)
 * );
 * ```
 */
export async function generateTextStream(
    prompt: string,
    onChunk: (text: string) => void,
    modelName: string = defaultModel,
    userId?: string
): Promise<void> {
    const ai = getGenAIClient();

    try {
        await withRetryableUnavailableRetry('generateTextStream', async () => {
            const response = await ai.models.generateContentStream({
                model: modelName,
                contents: prompt,
            });

            let fullText = '';
            let totalTokens = 0;
            let finalResponse;

            for await (const chunk of response) {
                const text = chunk.text || '';
                fullText += text;
                onChunk(text);

                if (chunk.usageMetadata) {
                    totalTokens = chunk.usageMetadata.totalTokenCount || 0;
                }
                finalResponse = chunk;
            }

            // Log final
            if (finalResponse?.usageMetadata) {
                const { promptTokenCount, candidatesTokenCount, totalTokenCount } = finalResponse.usageMetadata;

                await logUsage(
                    modelName,
                    promptTokenCount || 0,
                    candidatesTokenCount || 0,
                    totalTokenCount || totalTokens,
                    userId
                );
            }
        });
    } catch (error) {
        console.error("GenAI Stream Error:", error);
        throw new Error(`Failed to generate text stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Conta tokens de um texto sem fazer geração
 * @param text - Texto para contar tokens
 * @param modelName - Modelo para referência
 * @returns Número de tokens
 *
 * @example
 * ```typescript
 * const tokens = await countTokens('Hello, world!');
 * console.log(`Text has ${tokens} tokens`);
 * ```
 */
export async function countTokens(
    text: string,
    modelName: string = defaultModel
): Promise<number> {
    const ai = getGenAIClient();

    try {
        const response = await withRetryableUnavailableRetry('countTokens', () => ai.models.countTokens({
            model: modelName,
            contents: text,
        }));

        return response.totalTokens || 0;
    } catch (error) {
        console.error("Token Count Error:", error);
        return 0;
    }
}

/**
 * Gera uma imagem a partir de um prompt
 * @param prompt - Texto do prompt
 * @param modelName - Nome do modelo de imagem (opcional)
 * @param userId - ID do usuário para logging (opcional)
 * @returns Buffer e MIME type da primeira imagem retornada pelo Gemini
 */
export async function generateImage(
    prompt: string,
    modelName: string = defaultImageModel,
    userId?: string
): Promise<GeneratedImagePayload> {
    const ai = getGenAIClient();

    try {
        return await withRetryableUnavailableRetry('generateImage', async () => {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
            });

            if (response.usageMetadata) {
                const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;

                await logUsage(
                    modelName,
                    promptTokenCount || 0,
                    candidatesTokenCount || 0,
                    totalTokenCount || 0,
                    userId
                );
            }

            const images = extractImageParts(response);
            const firstImage = images[0];

            if (!firstImage) {
                throw new Error("Gemini response did not include an image.");
            }

            return firstImage;
        });
    } catch (error) {
        console.error("GenAI Image Error:", error);
        throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Chat multi-turno (conversação)
 * @param history - Histórico de mensagens
 * @param modelName - Nome do modelo
 * @param userId - ID do usuário para logging
 * @returns Resposta do modelo
 *
 * @example
 * ```typescript
 * const history = [
 *   { role: 'user', parts: 'Olá!' },
 *   { role: 'model', parts: 'Olá! Como posso ajudar?' },
 *   { role: 'user', parts: 'O que é TypeScript?' }
 * ];
 *
 * const response = await chat(history);
 * console.log(response);
 * ```
 */
export async function chat(
    history: Array<{ role: 'user' | 'model'; parts: string }>,
    modelName: string = defaultModel,
    userId?: string
): Promise<string> {
    const ai = getGenAIClient();

    try {
        const contents = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.parts }]
        }));

        return await withRetryableUnavailableRetry('chat', async () => {
            const response = await ai.models.generateContent({
                model: modelName,
                contents,
            });

            // Log de uso
            if (response.usageMetadata) {
                const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;

                await logUsage(
                    modelName,
                    promptTokenCount || 0,
                    candidatesTokenCount || 0,
                    totalTokenCount || 0,
                    userId
                );
            }

            return response.text || '';
        });
    } catch (error) {
        console.error("Chat Error:", error);
        throw new Error(`Failed to chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
