import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/core/auth';
import { getFileUrl } from '@/core/storage/s3';
import { ApiResponse } from '@/core/types';

/**
 * @openapi
 * /api/core/storage/download:
 *   get:
 *     summary: Obter URL de download
 *     description: Gera URL assinada para download de arquivo do S3/Minio
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Chave do arquivo no S3
 *     responses:
 *       200:
 *         description: URL gerada com sucesso
 *       400:
 *         description: Chave não fornecida
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao gerar URL
 */
export async function GET(request: NextRequest) {
  try {
      // Obter key dos query params
      const { searchParams } = new URL(request.url)
      const key = searchParams.get("key")

      if (!key) {
          const response: ApiResponse = {
              success: false,
              error: "Chave do arquivo não fornecida",
              code: "KEY_REQUIRED"
          }
          return NextResponse.json(response, { status: 400 })
      }

      // Gerar URL assinada
      const url = await getFileUrl(key)

      const response: ApiResponse = {
          success: true,
          data: {
              url,
              key,
              expiresIn: 3600 // 1 hora
          }
      }

      return NextResponse.json(response, { status: 200 })
  } catch (error) {
      console.error("Download URL error:", error)

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
          error: "Erro ao gerar URL de download",
          code: "DOWNLOAD_URL_ERROR"
      }

      return NextResponse.json(response, { status: 500 })
  }
}
