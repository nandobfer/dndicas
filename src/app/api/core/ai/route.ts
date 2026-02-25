import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/auth';
import { generateText } from '@/core/ai/genai';
import { ApiResponse } from '@/core/types';

const GenerateTextSchema = z.object({
  prompt: z.string().min(1, 'Prompt é obrigatório'),
  model: z.string().optional(),
});

/**
 * @openapi
 * /api/core/ai:
 *   post:
 *     summary: Gera texto usando IA
 *     description: Exemplo de uso do serviço de IA (Gemini)
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
 *                 description: Texto do prompt
 *               model:
 *                 type: string
 *                 description: Modelo a usar (opcional)
 *     responses:
 *       200:
 *         description: Texto gerado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao gerar texto
 */
export async function POST(request: NextRequest) {
  try {
      // Validação
      const body = await request.json()
      const { prompt, model } = GenerateTextSchema.parse(body)

      // Gerar texto
      const text = await generateText(prompt, model, userId)

      const response: ApiResponse<{ text: string }> = {
          success: true,
          data: {
              text
          }
      }

      return NextResponse.json(response, { status: 200 })
  } catch (error) {
      console.error("AI generation error:", error)

      if (error instanceof z.ZodError) {
          const response: ApiResponse = {
              success: false,
              error: "Dados inválidos",
              code: "VALIDATION_ERROR",
              details: error.issues
          }
          return NextResponse.json(response, { status: 400 })
      }

      if (error instanceof Error && error.message === "UNAUTHORIZED") {
          const response: ApiResponse = {
              success: false,
              error: "Não autenticado",
              code: "UNAUTHORIZED"
          }
          return NextResponse.json(response, { status: 401 })
      }

      const response: ApiResponse = {
          success: false,
          error: "Erro ao gerar texto",
          code: "AI_GENERATION_ERROR"
      }

      return NextResponse.json(response, { status: 500 })
  }
}
