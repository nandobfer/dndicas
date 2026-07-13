import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { requireAdmin, getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { createUserSchema, userFiltersSchema } from "@/features/users/api/validation"
import { logCreate, logUpdate } from "@/features/users/api/audit-service"
import type { UserFilters, UsersListResponse, UserResponse, UserStatus } from "@/features/users/types/user.types"

function toUserResponse(user: {
    _id: { toString(): string }
    legacyClerkId?: string
    username: string
    email: string
    name?: string
    avatarUrl?: string
    role: "admin" | "user"
    status: "active" | "inactive"
    deleted?: boolean
    passwordSetupRequired?: boolean
    lastLoginAt?: Date
    createdAt: Date
    updatedAt: Date
}): UserResponse {
    return {
        id: user._id.toString(),
        legacyClerkId: user.legacyClerkId,
        username: user.username,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status as UserStatus,
        deleted: user.deleted || false,
        passwordSetupRequired: user.passwordSetupRequired || false,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
    }
}

export async function GET(request: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(request.url)
        const rawFilters = {
            search: searchParams.get("search") || "",
            role: searchParams.get("role") || "all",
            status: searchParams.get("status") || "active",
            page: searchParams.get("page") || "1",
            limit: searchParams.get("limit") || "10",
        }

        const parseResult = userFiltersSchema.safeParse({
            ...rawFilters,
            page: parseInt(rawFilters.page, 10),
            limit: parseInt(rawFilters.limit, 10),
        })

        if (!parseResult.success) {
            return NextResponse.json({ error: "Filtros inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const filters: UserFilters = parseResult.data
        const query: { $and: Record<string, unknown>[] } = {
            $and: [{ deleted: { $ne: true } }],
        }

        if (filters.status && filters.status !== "all") {
            query.$and.push({ status: filters.status })
        } else {
            query.$and.push({ status: { $in: ["active", "inactive"] } })
        }

        if (filters.role && filters.role !== "all") {
            query.$and.push({ role: filters.role })
        }

        if (filters.search) {
            query.$and.push({
                $or: [
                    { username: { $regex: filters.search, $options: "i" } },
                    { email: { $regex: filters.search, $options: "i" } },
                    { name: { $regex: filters.search, $options: "i" } },
                ],
            })
        }

        const page = filters.page || 1
        const limit = filters.limit || 10
        const skip = (page - 1) * limit

        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(query),
        ])

        const response: UsersListResponse = {
            items: users.map(toUserResponse),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("[Users API] GET error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json({ error: "Erro ao listar usuários", details: message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        try {
            await requireAdmin()
        } catch {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem criar usuários." }, { status: 403 })
        }

        await dbConnect()

        const body = await request.json()
        const parseResult = createUserSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const data = parseResult.data
        const existing = await User.findOne({
            deleted: { $ne: true },
            $or: [{ email: data.email }, { username: data.username }],
        })

        if (existing) {
            return NextResponse.json({ error: "Já existe um usuário com este email ou username." }, { status: 409 })
        }

        const user = await User.create({
            username: data.username,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl || undefined,
            role: data.role || "user",
            status: "active",
            deleted: false,
            passwordSetupRequired: true,
        })

        const { user: currentUser } = await getCurrentUserFromDb()

        await logCreate("User", user._id.toString(), currentUser?._id.toString() || "unknown", {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        })

        await logUpdate("User", user._id.toString(), currentUser?._id.toString() || "unknown", {}, { passwordSetupRequired: true })

        return NextResponse.json(toUserResponse(user), { status: 201 })
    } catch (error) {
        console.error("[Users API] POST error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json({ error: "Erro ao criar usuário", details: message }, { status: 500 })
    }
}
