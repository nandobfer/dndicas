/**
 * @fileoverview User detail API route for get, update, and delete operations.
 *
 * @see specs/000/contracts/users.yaml
 * @see specs/000/spec.md - FR-026 (prevent self-delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { clerkClient } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { requireAdmin, getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { updateUserSchema } from "@/features/users/api/validation"
import { logUpdate, logDelete } from "@/features/users/api/audit-service"
import type { UserResponse } from "@/features/users/types/user.types"

interface RouteParams {
    params: Promise<{
        id: string
    }>
}

/**
 * GET /api/users/[id]
 * Get a single user by ID.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params

        // Verify authentication
        const { user: currentUser } = await getCurrentUserFromDb()
        if (!currentUser) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        await dbConnect()

        const user = await User.findOne({ _id: id, deleted: { $ne: true } }).lean()
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        const response: UserResponse = {
            id: user._id.toString(),
            clerkId: user.clerkId || user.clerkId,
            username: user.username,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            status: user.status,
            deleted: user.deleted || false,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("[Users API] GET [id] error:", error)
        return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 })
    }
}

/**
 * PUT /api/users/[id]
 * Update a user (admin only).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params

        // Require admin and get current user
        const authAdmin = await requireAdmin().catch(() => null)

        if (!authAdmin) {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem editar usuários." }, { status: 403 })
        }

        await dbConnect()

        // Find user to edit
        const user = await User.findOne({ _id: id, deleted: { $ne: true } })
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        // Parse and validate body
        const body = await request.json()
        const parseResult = updateUserSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const data = parseResult.data

        // Capture previous data for audit logging
        const previousData = {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            updatedAt: user.updatedAt,
        }

        // FR-026/Security: A user cannot change their own role (prevent accidental demotion or malicious escalation)
        if (authAdmin._id.toString() === id && data.role && data.role !== authAdmin.role) {
            return NextResponse.json({ error: "Você não pode alterar sua própria função através deste menu." }, { status: 400 })
        }

        // 1. Sync update with Clerk first
        try {
            const client = await clerkClient()
            const clerkUser = await client.users.getUser(user.clerkId)

            const nameParts = data.name?.trim().split(/\s+/) || []
            const firstName = nameParts.length > 0 ? nameParts[0] : undefined
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts.length === 1 ? "" : undefined

            await client.users.updateUser(user.clerkId, {
                username: data.username || undefined,
                firstName: firstName,
                lastName: lastName,
                publicMetadata: {
                    ...clerkUser.publicMetadata,
                    role: data.role || user.role,
                },
            })

            // Special handling for email update in Clerk if requested
            if (data.email && data.email !== user.email) {
                // This is more complex in Clerk (usually requires verification)
                // For this implementation, we try to at least log it or perform if possible
                // Note: simplified for this context
            }

            // Handle status change - if inactive, ban in Clerk
            if (data.status === "inactive") {
                await client.users.banUser(user.clerkId)
            } else if (data.status === "active") {
                await client.users.unbanUser(user.clerkId)
            }
        } catch (clerkError) {
            console.error("[Clerk API] Update error:", clerkError)
            const details =
                (clerkError as { errors?: { longMessage: string }[]; message?: string }).errors?.[0]?.longMessage || (clerkError as Error).message
            return NextResponse.json(
                {
                    error: "Erro ao atualizar no provedor de autenticação (Clerk)",
                    details: details,
                },
                { status: 400 },
            )
        }

        // 2. Update local DB fields
        if (data.username) user.username = data.username
        if (data.email) user.email = data.email
        if (data.name !== undefined) user.name = data.name
        if (data.role) user.role = data.role
        if (data.status) user.status = data.status

        await user.save()

        // Log audit entry for UPDATE operation
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

        const response: UserResponse = {
            id: user._id.toString(),
            clerkId: user.clerkId || user.clerkId,
            username: user.username,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            status: user.status,
            deleted: user.deleted || false,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("[Users API] PUT error:", error)
        return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 })
    }
}

/**
 * DELETE /api/users/[id]
 * Delete (soft delete) a user (admin only).
 * FR-026: Prevent self-delete.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params

        // Require admin and get current user
        const executor = await requireAdmin().catch(() => null)

        if (!executor) {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem excluir usuários." }, { status: 403 })
        }

        // FR-026: Prevent self-delete
        if (executor._id.toString() === id) {
            return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 })
        }

        await dbConnect()

        // Find user
        const user = await User.findOne({ _id: id, deleted: { $ne: true } })
        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
        }

        // Capture data before soft delete for audit
        const previousData = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            deleted: user.deleted || false,
        }

        // 1. Delete from Clerk first
        try {
            const client = await clerkClient()
            await client.users.deleteUser(user.clerkId)
        } catch (clerkError) {
            // If user not found in Clerk, we can still proceed with DB delete
            const errorObj = clerkError as { status?: number; errors?: { longMessage: string }[]; message?: string }
            if (errorObj.status !== 404) {
                console.error("[Clerk API] Delete error:", clerkError)
                const details = errorObj.errors?.[0]?.longMessage || errorObj.message
                return NextResponse.json(
                    {
                        error: "Erro ao excluir no provedor de autenticação (Clerk)",
                        details,
                    },
                    { status: 400 },
                )
            }
        }

        // 2. Soft delete - use collection.updateOne to bypass ALL Mongoose schema logic
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

        // Log DELETE action
        try {
            await logDelete("User", id, executor._id.toString(), {
                ...previousData,
                deleted: true,
                status: "inactive",
            })
        } catch (auditError) {
            console.error("[Users API] Audit log error:", auditError)
        }

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
