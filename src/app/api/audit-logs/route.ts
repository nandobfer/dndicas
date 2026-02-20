import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasRole } from '@/core/auth';
import dbConnect from '@/core/database/db';
import AuditLog from '@/core/database/audit-log';
import { ApiResponse, PaginatedResponse } from '@/core/types';

/**
 * Lista logs de auditoria com paginação e filtros
 * Apenas administradores têm acesso
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();

    // Verifica se o usuário é admin
    const isAdmin = await hasRole('admin');
    if (!isAdmin) {
      const response: ApiResponse = {
        success: false,
        error: 'Acesso negado. Apenas administradores podem visualizar logs de auditoria.',
        code: 'FORBIDDEN',
      };
      return NextResponse.json(response, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const filterUserId = searchParams.get('userId');
    const actions = searchParams.getAll('action');
    const collectionName = searchParams.get('collectionName');
    const actorEmail = searchParams.get("actorEmail")
    const entityType = searchParams.get("entityType")

    const skip = (page - 1) * limit

    // Construir query com filtros
    const query: any = {}

    // Filtro de data
    if (startDate || endDate) {
        query.timestamp = {}
        if (startDate) {
            query.timestamp.$gte = new Date(startDate)
        }
        if (endDate) {
            query.timestamp.$lte = new Date(endDate)
        }
    }

    // Filtro de usuário
    if (filterUserId) {
        query.userId = filterUserId
    }

    // Filtro de ação
    if (actions && actions.length > 0) {
        query.action = { $in: actions }
    }

    // Filtro de coleção
    if (collectionName) {
        query.collectionName = collectionName
    }

    // Filtro de email do ator (para logs estendidos)
    if (actorEmail) {
        query.actorEmail = { $regex: actorEmail, $options: "i" }
    }

    // Filtro de tipo de entidade (para logs estendidos)
    if (entityType) {
        query.entityType = entityType
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).skip(skip).limit(limit).sort({ timestamp: -1 }),
      AuditLog.countDocuments(query),
    ]);

    const normalizedLogs = logs.map((log) => {
        const logObj = log.toObject()
        return {
            ...logObj,
            entity: logObj.entity || logObj.collectionName || "System",
            entityId: logObj.entityId || logObj.documentId || "N/A",
            performedBy: logObj.performedBy || logObj.userId || "system",
            createdAt: logObj.createdAt || logObj.timestamp || new Date(),
        }
    })

    const response: PaginatedResponse<any> = {
        success: true,
        data: normalizedLogs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching audit logs:', error);

    const response: ApiResponse = {
      success: false,
      error: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'Não autenticado'
        : 'Erro ao buscar logs de auditoria',
      code: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'UNAUTHORIZED'
        : 'FETCH_ERROR',
    };

    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json(response, { status });
  }
}
