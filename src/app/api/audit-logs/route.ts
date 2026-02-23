import { NextRequest, NextResponse } from 'next/server';
import mongoose from "mongoose"
import { requireAuth, hasRole } from '@/core/auth';
import dbConnect from '@/core/database/db';
import { AuditLogExtended, IAuditLogExtended } from "@/features/users/models/audit-log-extended"
import { User } from "@/features/users/models/user"
import { ApiResponse, PaginatedResponse } from "@/core/types"

/**
 * Lista logs de auditoria com paginação e filtros
 * Apenas administradores têm acesso
 */
export async function GET(request: NextRequest) {
    try {
        await requireAuth()

        // Verifica se o usuário é admin
        const isAdmin = await hasRole("admin")
        if (!isAdmin) {
            const response: ApiResponse = {
                success: false,
                error: "Acesso negado. Apenas administradores podem visualizar logs de auditoria.",
                code: "FORBIDDEN"
            }
            return NextResponse.json(response, { status: 403 })
        }

        await dbConnect()

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "10")
        const startDate = searchParams.get("startDate")
        const endDate = searchParams.get("endDate")
        const filterUserId = searchParams.get("userId")
        const actions = searchParams.getAll("action")
        const collectionName = searchParams.get("collectionName")
        const actorEmail = searchParams.get("actorEmail")
        const entityTypes = searchParams.getAll("entityType")

        const skip = (page - 1) * limit

        // Construir query com filtros compatíveis com log legado e moderno
        const andConditions: any[] = []

        // Filtro de data
        if (startDate || endDate) {
            const dateQuery: Record<string, Date> = {}
            if (startDate) {
                const start = new Date(startDate)
                start.setUTCHours(0, 0, 0, 0)
                dateQuery.$gte = start
            }
            if (endDate) {
                const end = new Date(endDate)
                end.setUTCHours(23, 59, 59, 999)
                dateQuery.$lte = end
            }

            // Query both createdAt (modern) and timestamp (legacy)
            andConditions.push({ $or: [{ createdAt: dateQuery }, { timestamp: dateQuery }] })
        }

        // Filtro de usuário (checa ambos os campos: legível e moderno)
        if (filterUserId) {
            andConditions.push({ $or: [{ performedBy: filterUserId }, { userId: filterUserId }] })
        }

        // Filtro de ação
        if (actions && actions.length > 0) {
            andConditions.push({ action: { $in: actions } })
        }

        // Filtro de entidade/coleção legado (parâmetro individual)
        if (collectionName) {
            const variations = [collectionName]
            if (collectionName === "Rule") variations.push("Reference")
            if (collectionName === "Reference") variations.push("Rule")

            andConditions.push({ $or: [{ entity: { $in: variations } }, { collectionName: { $in: variations } }] })
        }

        // O campo de busca (actorEmail) deve buscar APENAS pelo autor (nome, email ou username)
        if (actorEmail) {
            andConditions.push({
                $or: [
                    { actorEmail: { $regex: actorEmail, $options: "i" } },
                    { actorName: { $regex: actorEmail, $options: "i" } },
                    { actorUsername: { $regex: actorEmail, $options: "i" } },
                    { "performedByUser.email": { $regex: actorEmail, $options: "i" } },
                    { "performedByUser.name": { $regex: actorEmail, $options: "i" } },
                    { "performedByUser.username": { $regex: actorEmail, $options: "i" } }
                ]
            })
        }

        // Filtro de tipo de entidade (múltiplas seleções)
        if (entityTypes && entityTypes.length > 0) {
            // Mapeamento para suportar nomes amigáveis no filtro
            const variations = [...entityTypes]
            if (entityTypes.includes("Rule") || entityTypes.includes("Regra")) {
                if (!variations.includes("Reference")) variations.push("Reference")
                if (!variations.includes("Rule")) variations.push("Rule")
            }
            if (entityTypes.includes("Reference")) {
                if (!variations.includes("Rule")) variations.push("Rule")
            }
            if (entityTypes.includes("User") || entityTypes.includes("Usuário")) {
                if (!variations.includes("User")) variations.push("User")
            }
            if (entityTypes.includes("Habilidade") || entityTypes.includes("Trait")) {
                if (!variations.includes("Trait")) variations.push("Trait")
            }

            andConditions.push({
                $or: [{ entity: { $in: variations } }, { entityType: { $in: variations } }, { collectionName: { $in: variations } }]
            })
        }

        const query = andConditions.length > 0 ? { $and: andConditions } : {}

        const [logs, total] = await Promise.all([
            AuditLogExtended.find(query as any)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1, timestamp: -1 }),
            AuditLogExtended.countDocuments(query as any)
        ])

        // Extrair IDs únicos de usuários para enriquecer logs
        const performerIds = Array.from(
            new Set(
                logs
                    .map((log) => log.performedBy || (log as unknown as Record<string, string>).userId)
                    .filter((id): id is string => !!(id && id !== "system"))
            )
        )

        // Busca os usuários atuais para garantir que avatar e status estejam presentes (especialmente para logs antigos)
        const currentUsers = await User.find({
            $or: [{ _id: { $in: performerIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(id)) } }, { clerkId: { $in: performerIds } }]
        }).lean()

        const userMap = new Map()
        currentUsers.forEach((u) => {
            userMap.set(String(u._id), u)
            userMap.set(u.clerkId, u)
        })

        const normalizedLogs = logs.map((log) => {
            const logObj = log.toObject() as unknown as Record<string, unknown>
            const performerId = (logObj.performedBy || logObj.userId) as string
            const currentUser = userMap.get(performerId)

            // Se já existe performedByUser no log, usamos como base, senão tentamos montar do logObj
            const baseUser = (logObj.performedByUser || {
                name: logObj.actorName,
                email: logObj.actorEmail,
                username: logObj.actorUsername // Se existir no futuro
            }) as Record<string, unknown>

            return {
                ...logObj,
                entity: logObj.entity || logObj.collectionName || "System",
                entityId: logObj.entityId || logObj.documentId || "N/A",
                performedBy: performerId || "system",
                createdAt: logObj.createdAt || logObj.timestamp || new Date(),
                performedByUser:
                    performerId === "system"
                        ? null
                        : {
                              ...baseUser,
                              avatarUrl: baseUser.avatarUrl || currentUser?.avatarUrl,
                              status: baseUser.status || currentUser?.status || "active",
                              role: baseUser.role || currentUser?.role || "user",
                              name: baseUser.name || currentUser?.name || (baseUser.email as string)?.split("@")[0],
                              username: baseUser.username || currentUser?.username || (baseUser.email as string)?.split("@")[0]
                          }
            }
        })

        const response: PaginatedResponse<unknown> = {
            success: true,
            data: normalizedLogs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }

        return NextResponse.json(response, { status: 200 })
    } catch (error) {
        console.error("Error fetching audit logs:", error)

        const response: ApiResponse = {
            success: false,
            error: error instanceof Error && error.message === "UNAUTHORIZED" ? "Não autenticado" : "Erro ao buscar logs de auditoria",
            code: error instanceof Error && error.message === "UNAUTHORIZED" ? "UNAUTHORIZED" : "FETCH_ERROR",
        }

        const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500
        return NextResponse.json(response, { status })
    }
}
