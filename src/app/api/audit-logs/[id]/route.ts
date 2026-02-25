import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasRole } from '@/core/auth';
import dbConnect from '@/core/database/db';
import AuditLog from '@/core/database/audit-log';
import { ApiResponse } from '@/core/types';

/**
 * GET /api/audit-logs/[id]
 * Retrieve a specific audit log by ID
 * Aberto ao público conforme solicitado
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
      const { id } = await params

      // Validate ID format
      if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
          const response: ApiResponse = {
              success: false,
              error: "ID de log inválido",
              code: "INVALID_ID"
          }
          return NextResponse.json(response, { status: 400 })
      }

      await dbConnect()

      const log = await AuditLog.findById(id)

      if (!log) {
          const response: ApiResponse = {
              success: false,
              error: "Log de auditoria não encontrado",
              code: "NOT_FOUND"
          }
          return NextResponse.json(response, { status: 404 })
      }

      return NextResponse.json({
          success: true,
          data: log
      })
  } catch (error) {
      console.error("[Audit Logs API] GET by ID error:", error)

      const response: ApiResponse = {
          success: false,
          error: error instanceof Error && error.message === "UNAUTHORIZED" ? "Não autenticado" : "Erro ao buscar log de auditoria",
          code: error instanceof Error && error.message === "UNAUTHORIZED" ? "UNAUTHORIZED" : "FETCH_ERROR"
      }

      const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500
      return NextResponse.json(response, { status })
  }
}
