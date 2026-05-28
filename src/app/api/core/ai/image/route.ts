import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { GeneratedImageTooLargeError, generateAndStoreDndImage } from '@/core/ai/dnd-image-generation-service';
import { requireAuth } from '@/core/auth';
import { ApiResponse } from '@/core/types';

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
        const generatedImage = await generateAndStoreDndImage({
            prompt,
            model,
            formData,
            entityLabel,
            preferredAspectRatio,
            userId,
        });

        const response: ApiResponse<GenerateImageResponseData> = {
            success: true,
            data: {
                key: generatedImage.key,
                url: generatedImage.url,
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

        if (error instanceof GeneratedImageTooLargeError) {
            const response: ApiResponse = {
                success: false,
                error: error.message,
                code: 'AI_IMAGE_TOO_LARGE',
            };

            return NextResponse.json(response, { status: 422 });
        }

        const response: ApiResponse = {
            success: false,
            error: "Erro ao gerar imagem",
            code: "AI_IMAGE_GENERATION_ERROR",
        };

        return NextResponse.json(response, { status: 500 });
    }
}
