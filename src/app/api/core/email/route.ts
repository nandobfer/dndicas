import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/auth';
import { sendEmail } from '@/core/email/mailer';
import { ApiResponse } from '@/core/types';

const SendEmailSchema = z.object({
  to: z.string().email('Email inválido'),
  subject: z.string().min(1, 'Assunto é obrigatório'),
  html: z.string().min(1, 'Conteúdo HTML é obrigatório'),
});

/**
 * @openapi
 * /api/core/email:
 *   post:
 *     summary: Envia um email
 *     description: Exemplo de uso do serviço de email (Nodemailer)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - html
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *               subject:
 *                 type: string
 *               html:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email enviado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao enviar email
 */
export async function POST(request: NextRequest) {
  try {
    // Autenticação
    await requireAuth();

    // Validação
    const body = await request.json();
    const { to, subject, html } = SendEmailSchema.parse(body);

    // Enviar email
    await sendEmail(to, subject, html);

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Email enviado com sucesso',
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Email error:', error);

    if (error instanceof z.ZodError) {
      const response: ApiResponse = {
        success: false,
        error: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      const response: ApiResponse = {
        success: false,
        error: 'Não autenticado',
        code: 'UNAUTHORIZED',
      };
      return NextResponse.json(response, { status: 401 });
    }

    const response: ApiResponse = {
      success: false,
      error: 'Erro ao enviar email',
      code: 'EMAIL_ERROR',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
