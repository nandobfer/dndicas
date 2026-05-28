import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { generateImage } from '@/core/ai/genai';
import { requireAuth } from '@/core/auth';
import { uploadFile, buildFileProxyUrl, getImageExtensionFromMimeType } from '@/core/storage/s3';
import { ApiResponse } from '@/core/types';

const MAX_GENERATED_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_ASPECT_RATIO = '1:1';

const GenerateImageSchema = z.object({
    prompt: z.string().trim().min(1, 'Prompt é obrigatório').optional(),
    model: z.string().optional(),
    entityLabel: z.string().trim().min(1).optional(),
    preferredAspectRatio: z.string().trim().min(1).optional(),
    formData: z.unknown().optional(),
}).refine((value) => Boolean(value.prompt) || typeof value.formData !== 'undefined', {
    message: 'Prompt ou dados do formulário são obrigatórios',
    path: ['prompt'],
});

interface GenerateImageResponseData {
    key: string;
    url: string;
    mimeType: string;
}

const buildDndImagePrompt = ({
    entityLabel,
    formData,
    preferredAspectRatio,
}: {
    entityLabel?: string;
    formData: unknown;
    preferredAspectRatio?: string;
}): string => {
    const serializedFormData = JSON.stringify(formData, null, 2);

    return [
        'Você é um diretor de arte especializado em Dungeons & Dragons 5e, criando ilustrações com aparência premium de livro oficial.',
        `Crie uma única arte final em aspecto ${preferredAspectRatio || DEFAULT_ASPECT_RATIO}, priorizando composição 1:1, leitura clara do sujeito principal e enquadramento adequado para uso como imagem de catálogo.`,
        'A estética deve ser coerente com D&D: fantasia heroica, acabamento editorial, iluminação dramática, riqueza de materiais, silhueta legível e consistência com artes de sourcebooks oficiais.',
        'Regras obrigatórias: sem texto, sem logos, sem molduras, sem watermark, sem interface, sem colagem, sem múltiplos quadros e sem visual fotográfico moderno fora do tema de fantasia.',
        'Use TODO o JSON abaixo como fonte de verdade. Não dependa de campos específicos; leia o objeto inteiro e extraia dele o que for necessário para representar com precisão a entidade.',
        `Contexto principal da entidade: ${entityLabel || 'Entidade de D&D'}.`,
        'Prefira uma saída visualmente rica, mas com composição eficiente para web e adequada a um arquivo final de até 5MB.',
        'JSON do formulário:',
        serializedFormData,
    ].join('\n\n');
};

/**
 * @openapi
 * /api/core/ai/image:
 *   post:
 *     summary: Gera uma imagem usando IA e salva no bucket
 *     description: Gera uma imagem com Gemini, persiste no S3/Minio e retorna metadados do arquivo salvo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Texto livre opcional para geração da imagem
 *               formData:
 *                 type: object
 *                 description: JSON completo do formulário usado como contexto principal
 *               entityLabel:
 *                 type: string
 *                 description: Rótulo opcional da entidade (ex.: Classe, Magia, Monstro)
 *               preferredAspectRatio:
 *                 type: string
 *                 description: Aspect ratio preferido para a composição (ex.: 1:1)
 *               model:
 *                 type: string
 *                 description: Modelo Gemini com suporte a imagem (opcional)
 *     responses:
 *       201:
 *         description: Imagem gerada e salva com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao gerar ou salvar a imagem
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await requireAuth();
        const body = await request.json();
        const { prompt, model, formData, entityLabel, preferredAspectRatio } = GenerateImageSchema.parse(body);

        console.log('[AI image] Received payload', {
            prompt,
            model,
            entityLabel,
            preferredAspectRatio,
            formData,
        });

        const promptToUse = typeof formData === 'undefined'
            ? prompt!
            : buildDndImagePrompt({ entityLabel, formData, preferredAspectRatio });

        const generatedImage = await generateImage(promptToUse, model, userId);

        if (generatedImage.buffer.byteLength > MAX_GENERATED_IMAGE_SIZE_BYTES) {
            const response: ApiResponse = {
                success: false,
                error: 'A imagem gerada excedeu o limite de 5MB.',
                code: 'AI_IMAGE_TOO_LARGE',
            };

            return NextResponse.json(response, { status: 422 });
        }

        const fileExtension = getImageExtensionFromMimeType(generatedImage.mimeType);
        const key = `ai/generated/${userId}/${Date.now()}.${fileExtension}`;

        await uploadFile(key, generatedImage.buffer, generatedImage.mimeType);

        const response: ApiResponse<GenerateImageResponseData> = {
            success: true,
            data: {
                key,
                url: buildFileProxyUrl(key),
                mimeType: generatedImage.mimeType,
            },
        };

        return NextResponse.json(response, { status: 201 });
    } catch (error) {
        console.error("AI image generation error:", error);

        if (error instanceof z.ZodError) {
            const response: ApiResponse = {
                success: false,
                error: "Dados inválidos",
                code: "VALIDATION_ERROR",
                details: error.issues,
            };
            return NextResponse.json(response, { status: 400 });
        }

        if (error instanceof Error && error.message === "UNAUTHORIZED") {
            const response: ApiResponse = {
                success: false,
                error: "Não autenticado",
                code: "UNAUTHORIZED",
            };
            return NextResponse.json(response, { status: 401 });
        }

        const response: ApiResponse = {
            success: false,
            error: "Erro ao gerar imagem",
            code: "AI_IMAGE_GENERATION_ERROR",
        };

        return NextResponse.json(response, { status: 500 });
    }
}
