/**
 * Google GenAI (Gemini) Service
 * Wrapper para a SDK do Google Gemini com logging automático de uso
 */

import { GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration } from "@google/genai";
import { logUsage } from "./usage-log";

const API_KEY = process.env.GOOGLE_API_KEY;
const HIGH_DEMAND_RETRY_DELAY_MS = 1000;
const GENAI_FALLBACK_BASE_URL = process.env.GENAI_BASE_URL;
const GENAI_FALLBACK_API_KEY = process.env.GENAI_API_KEY;
const GENAI_FALLBACK_MODEL = process.env.GENAI_FALLBACK_MODEL;
const DEFAULT_GENAI_FALLBACK_TIMEOUT_MS = 90_000;

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
    operation: () => Promise<T>,
    options?: { maxRetries?: number }
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

            if (options?.maxRetries !== undefined && attempt > options.maxRetries) {
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
export const defaultModel = "gemini-3.1-flash-lite";
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

interface GenAIFallbackUsage {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
}

interface GenAIFallbackGenerateOutput {
    id: string;
    model: string;
    text: string;
    usage?: GenAIFallbackUsage;
    costUsd: number | null;
    latencyMs: number;
}

interface GenAIFallbackErrorBody {
    error?: {
        code?: string;
        message?: string;
        requestId?: string;
    };
}

export interface GeneratedImagePayload {
    buffer: Buffer;
    mimeType: string;
}

export type GenAIToolDeclaration = {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    parametersJsonSchema?: unknown;
};

export type GenAIToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export type GenAITool = {
    declaration: GenAIToolDeclaration;
    execute: GenAIToolHandler;
};

export type GenAIChatMessage = { role: 'user' | 'model'; parts: string };

export interface ChatWithToolsStreamInput {
    history: GenAIChatMessage[];
    tools: GenAITool[];
    onChunk: (text: string) => void;
    modelName?: string;
    userId?: string;
    maxToolRounds?: number;
    systemInstruction?: string;
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

const mapHistoryToContents = (history: GenAIChatMessage[]): Content[] => history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.parts }],
}));

const mapToolDeclarations = (tools: GenAITool[]): FunctionDeclaration[] => tools.map((tool) => ({
    name: tool.declaration.name,
    description: tool.declaration.description,
    ...(tool.declaration.parameters ? { parametersJsonSchema: tool.declaration.parameters } : {}),
    ...(tool.declaration.parametersJsonSchema ? { parametersJsonSchema: tool.declaration.parametersJsonSchema } : {}),
}));

const getFunctionCallsFromResponse = (response: unknown): FunctionCall[] => {
    const candidate = response as { functionCalls?: FunctionCall[] };
    return Array.isArray(candidate.functionCalls) ? candidate.functionCalls : [];
}

const createFunctionCallContent = (functionCalls: FunctionCall[]): Content => ({
    role: 'model',
    parts: functionCalls.map((functionCall) => ({
        functionCall: {
            ...(functionCall.id ? { id: functionCall.id } : {}),
            name: functionCall.name,
            args: functionCall.args ?? {},
        },
    })),
});

const createFunctionResponseContent = (functionCall: FunctionCall, response: unknown, isError = false): Content => ({
    role: 'user',
    parts: [{
        functionResponse: {
            ...(functionCall.id ? { id: functionCall.id } : {}),
            name: functionCall.name,
            response: isError ? { error: response } : { output: response },
        },
    }],
});

const logResponseUsage = async (modelName: string, usageMetadata: GenAIUsageMetadata | undefined, userId?: string): Promise<void> => {
    if (!usageMetadata) return;

    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = usageMetadata;

    await logUsage(
        modelName,
        promptTokenCount || 0,
        candidatesTokenCount || 0,
        totalTokenCount || 0,
        userId
    );
}

const getFallbackTimeoutMs = (): number => {
    const parsed = Number(process.env.GENAI_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GENAI_FALLBACK_TIMEOUT_MS;
}

const isGenAIFallbackConfigured = (): boolean => Boolean(GENAI_FALLBACK_BASE_URL && GENAI_FALLBACK_API_KEY);

const isGenAIFallbackEligibleError = (error: unknown): boolean => {
    const status = getErrorStatus(error);
    const message = stringifyError(error).toLowerCase();

    if (status === 429) {
        return true;
    }

    if (status === 503 && getGeminiRetryableUnavailableReason(error)) {
        return true;
    }

    return (
        message.includes('quota') ||
        message.includes('rate limit') ||
        message.includes('resource exhausted') ||
        message.includes('too many requests') ||
        message.includes('limit') ||
        message.includes('exceeded')
    );
}

const getFallbackErrorMessage = async (response: Response): Promise<string> => {
    const body = await response.json().catch(() => null) as GenAIFallbackErrorBody | null;
    return body?.error?.message ?? `GenAI fallback error: ${response.status}`;
}

const generateTextWithFallbackService = async (
    prompt: string,
    sourceModelName: string,
    userId?: string
): Promise<string> => {
    if (!GENAI_FALLBACK_BASE_URL || !GENAI_FALLBACK_API_KEY) {
        throw new Error('GENAI_BASE_URL and GENAI_API_KEY must be set to use GenAI fallback.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getFallbackTimeoutMs());
    const baseUrl = GENAI_FALLBACK_BASE_URL.replace(/\/+$/, '');

    try {
        const response = await fetch(`${baseUrl}/generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${GENAI_FALLBACK_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                ...(GENAI_FALLBACK_MODEL ? { model: GENAI_FALLBACK_MODEL } : {}),
                metadata: {
                    app: 'dndicas',
                    feature: 'core-ai-generate-text-fallback',
                    sourceModel: sourceModelName,
                    ...(userId ? { userId } : {}),
                },
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(await getFallbackErrorMessage(response));
        }

        const data = await response.json() as GenAIFallbackGenerateOutput;

        if (!data || typeof data.text !== 'string') {
            throw new Error('GenAI fallback response did not include generated text.');
        }

        if (data.usage) {
            await logUsage(
                data.model || GENAI_FALLBACK_MODEL || 'genai-fallback',
                data.usage.inputTokens ?? 0,
                data.usage.outputTokens ?? 0,
                data.usage.totalTokens ?? 0,
                userId
            );
        }

        console.log(`GenAI fallback used: ${data.model} (${data.latencyMs}ms)`);

        return data.text;
    } finally {
        clearTimeout(timeout);
    }
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
        }, { maxRetries: 1 });
    } catch (error) {
        if (isGenAIFallbackEligibleError(error)) {
            if (!isGenAIFallbackConfigured()) {
                console.warn('GenAI fallback skipped because GENAI_BASE_URL or GENAI_API_KEY is not set.');
            } else {
                try {
                    console.warn('GenAI generateText failed due to quota/limit/unavailability. Trying GenAI fallback service.');
                    return await generateTextWithFallbackService(prompt, modelName, userId);
                } catch (fallbackError) {
                    console.error('GenAI Fallback Error:', fallbackError);
                    throw new Error(`Failed to generate text: primary provider failed (${error instanceof Error ? error.message : 'Unknown error'}); fallback provider failed (${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'})`);
                }
            }
        }

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
 * Chat multi-turno com suporte a function-calling/tools e streaming da resposta final.
 * As tools sao executadas exclusivamente no servidor chamador.
 */
export async function chatWithToolsStream({
    history,
    tools,
    onChunk,
    modelName = defaultModel,
    userId,
    maxToolRounds = 4,
    systemInstruction,
}: ChatWithToolsStreamInput): Promise<void> {
    const ai = getGenAIClient();
    const toolHandlers = new Map(tools.map((tool) => [tool.declaration.name, tool.execute]));
    const contents = mapHistoryToContents(history);
    const functionDeclarations = mapToolDeclarations(tools);
    const config = {
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
        ...(systemInstruction ? { systemInstruction } : {}),
    };

    try {
        for (let round = 0; round <= maxToolRounds; round += 1) {
            const functionCalls: FunctionCall[] = [];
            let finalUsageMetadata: GenAIUsageMetadata | undefined;

            await withRetryableUnavailableRetry('chatWithToolsStream', async () => {
                const response = await ai.models.generateContentStream({
                    model: modelName,
                    contents,
                    config,
                });

                for await (const chunk of response) {
                    const chunkFunctionCalls = getFunctionCallsFromResponse(chunk);

                    if (chunkFunctionCalls.length > 0) {
                        functionCalls.push(...chunkFunctionCalls);
                        continue;
                    }

                    const text = chunk.text || '';
                    if (text) {
                        onChunk(text);
                    }

                    if (chunk.usageMetadata) {
                        finalUsageMetadata = chunk.usageMetadata;
                    }
                }
            });

            await logResponseUsage(modelName, finalUsageMetadata, userId);

            if (functionCalls.length === 0) {
                return;
            }

            if (round === maxToolRounds) {
                throw new Error('Maximum GenAI tool rounds reached before a final response.');
            }

            contents.push(createFunctionCallContent(functionCalls));

            for (const functionCall of functionCalls) {
                const functionName = functionCall.name;
                if (!functionName) {
                    contents.push(createFunctionResponseContent(functionCall, 'Chamada de ferramenta sem nome.', true));
                    continue;
                }

                const handler = toolHandlers.get(functionName);
                if (!handler) {
                    contents.push(createFunctionResponseContent(functionCall, `Ferramenta desconhecida: ${functionName}.`, true));
                    continue;
                }

                try {
                    const result = await handler(functionCall.args ?? {});
                    contents.push(createFunctionResponseContent(functionCall, result));
                } catch (error) {
                    contents.push(createFunctionResponseContent(functionCall, stringifyError(error), true));
                }
            }
        }
    } catch (error) {
        console.error("GenAI Tools Stream Error:", error);
        throw new Error(`Failed to chat with tools stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
