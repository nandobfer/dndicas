import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { requireAdmin } from "@/features/users/api/get-current-user"
import { updateUserSchema } from "@/features/users/api/validation"
import { logUpdate, logDelete } from "@/features/users/api/audit-service"
import type { UserResponse } from "@/features/users/types/user.types"

interface RouteParams {
    params: Promise<{ id: string }>
}

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
        status: user.status,
        deleted: user.deleted || false,
        passwordSetupRequired: user.passwordSetupRequired || false,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
    }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        await dbConnect()

        const user = await User.findOne({ _id: id, deleted: { $ne: true } }).lean()
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        return NextResponse.json(toUserResponse(user))
    } catch (error) {
        console.error("[Users API] GET [id] error:", error)
        return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 })
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const authAdmin = await requireAdmin().catch(() => null)

        if (!authAdmin) {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem editar usuários." }, { status: 403 })
        }

        await dbConnect()

        const user = await User.findOne({ _id: id, deleted: { $ne: true } })
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        const body = await request.json()
        const parseResult = updateUserSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const data = parseResult.data
        const previousData = {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            updatedAt: user.updatedAt,
        }

        if (authAdmin._id.toString() === id && data.role && data.role !== authAdmin.role) {
            return NextResponse.json({ error: "Você não pode alterar sua própria função através deste menu." }, { status: 400 })
        }

        if (data.username) user.username = data.username
        if (data.email) user.email = data.email
        if (data.name !== undefined) user.name = data.name
        if (data.avatarUrl !== undefined) user.avatarUrl = data.avatarUrl || undefined
        if (data.role) user.role = data.role
        if (data.status) user.status = data.status

        await user.save()

        const newData = {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            updatedAt: user.updatedAt,
        }

        await logUpdate("User", user._id.toString(), authAdmin._id.toString(), previousData, newData)

        return NextResponse.json(toUserResponse(user))
    } catch (error) {
        console.error("[Users API] PUT error:", error)
        return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 })
    }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const executor = await requireAdmin().catch(() => null)

        if (!executor) {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem excluir usuários." }, { status: 403 })
        }

        if (executor._id.toString() === id) {
            return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 })
        }

        await dbConnect()

        const user = await User.findOne({ _id: id, deleted: { $ne: true } })
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        const previousData = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            deleted: user.deleted || false,
        }

        const updateResult = await User.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            {
                $set: {
                    deleted: true,
                    status: "inactive",
                    updatedAt: new Date(),
                },
            },
        )

        if (!updateResult.matchedCount) {
            return NextResponse.json({ error: "Usuário não encontrado no banco de dados" }, { status: 404 })
        }

        await logDelete("User", id, executor._id.toString(), {
            ...previousData,
            deleted: true,
            status: "inactive",
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[Users API] DELETE fatal error:", error)
        return NextResponse.json(
            {
                error: "Erro ao excluir usuário",
                details: error instanceof Error ? error.message : "Erro desconhecido",
            },
            { status: 500 },
        )
    }
}
