import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/core/database/db';
import { ApiResponse } from '@/core/types';

/**
 * @openapi
 * /api/core/health:
 *   get:
 *     summary: Health check da aplicação
 *     description: Verifica se a aplicação e o banco de dados estão funcionando
 *     responses:
 *       200:
 *         description: Sistema funcionando normalmente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     database:
 *                       type: string
 *       500:
 *         description: Erro no sistema
 */
export async function GET(request: NextRequest) {
  try {
    // Testa conexão com banco de dados
    let dbStatus = 'disconnected';
    try {
      await dbConnect();
      dbStatus = 'connected';
    } catch (error) {
      console.error('Database connection error:', error);
      dbStatus = 'error';
    }

    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Health check error:', error);

    const response: ApiResponse = {
      success: false,
      error: 'Health check failed',
      code: 'HEALTH_CHECK_ERROR',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
