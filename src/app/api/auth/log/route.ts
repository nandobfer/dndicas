import { NextRequest, NextResponse } from 'next/server';
import { logAuthAction } from '@/core/auth';
import { ApiResponse } from '@/core/types';

/**
 * API para registrar eventos de autenticação
 * Chamada pelo client-side após login/logout
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, details } = body;

    if (!action) {
      const response: ApiResponse = {
        success: false,
        error: 'Ação não fornecida',
        code: 'MISSING_ACTION',
      };
      return NextResponse.json(response, { status: 400 });
    }

    await logAuthAction(action, details);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Log registrado com sucesso' },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error logging auth action:', error);

    const response: ApiResponse = {
      success: false,
      error: 'Erro ao registrar log',
      code: 'LOG_ERROR',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
