import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/core/auth';
import { uploadFile } from '@/core/storage/s3';
import { ApiResponse } from '@/core/types';

/**
 * @openapi
 * /api/core/storage/upload:
 *   post:
 *     summary: Upload de arquivo
 *     description: Exemplo de upload para S3/Minio
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Arquivo enviado com sucesso
 *       400:
 *         description: Arquivo não fornecido
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro no upload
 */
export async function POST(request: NextRequest) {
  try {
    // Autenticação
    const userId = await requireAuth();

    // Obter arquivo do FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      const response: ApiResponse = {
        success: false,
        error: 'Arquivo não fornecido',
        code: 'FILE_REQUIRED',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Converter para Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Gerar nome único
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}-${file.name}`;

    // Upload
    await uploadFile(fileName, buffer, file.type);

    const response: ApiResponse = {
      success: true,
      data: {
        key: fileName,
        name: file.name,
        size: file.size,
        type: file.type,
        message: 'Arquivo enviado com sucesso',
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);

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
      error: 'Erro ao fazer upload do arquivo',
      code: 'UPLOAD_ERROR',
    };

    return NextResponse.json(response, { status: 500 });
  }
}
