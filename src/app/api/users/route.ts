/**
 * @fileoverview Users API route for listing and creating users.
 *
 * @see specs/000/contracts/users.yaml
 */

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { requireAdmin, getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { createUserSchema, userFiltersSchema } from "@/features/users/api/validation"
import { logCreate } from "@/features/users/api/audit-service"
import { UserFilters, UsersListResponse, UserResponse, UserStatus } from "@/features/users/types/user.types"

/**
 * GET /api/users
 * List users with pagination and filters.
 */
export async function GET(request: NextRequest) {
    try {
        // Verify authentication
        const { user: currentUser } = await getCurrentUserFromDb()
        if (!currentUser) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        await dbConnect()

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const rawFilters = {
            search: searchParams.get("search") || "",
            role: searchParams.get("role") || "all",
            status: searchParams.get("status") || "active",
            page: searchParams.get("page") || "1",
            limit: searchParams.get("limit") || "10",
        }

        // Validate filters
        const parseResult = userFiltersSchema.safeParse({
            ...rawFilters,
            page: parseInt(rawFilters.page, 10),
            limit: parseInt(rawFilters.limit, 10),
        })

        if (!parseResult.success) {
            return NextResponse.json({ error: "Filtros inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const filters: UserFilters = parseResult.data

        // Build query
        // We use $and to ensure deleted filter is ALWAYS applied even if other filters are added
        const query: any = {
            $and: [{ deleted: { $ne: true } }],
        }

        // Status filter
        if (filters.status && filters.status !== "all") {
            query.$and.push({ status: filters.status })
        } else if (!filters.status || filters.status === "all") {
            query.$and.push({ status: { $in: ["active", "inactive"] } })
        }

        // Role filter
        if (filters.role && filters.role !== "all") {
            query.$and.push({ role: filters.role })
        }

        // Search filter
        if (filters.search) {
            query.$and.push({
                $or: [{ username: { $regex: filters.search, $options: "i" } }, { email: { $regex: filters.search, $options: "i" } }, { name: { $regex: filters.search, $options: "i" } }],
            })
        }

        // Pagination
        const page = filters.page || 1
        const limit = filters.limit || 10
        const skip = (page - 1) * limit

        // Execute query
        const [users, total] = await Promise.all([User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(query)])

        const response: UsersListResponse = {
            items: users.map((user) => ({
                id: user._id.toString(),
                clerkId: user.clerkId,
                username: user.username,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                role: user.role,
                status: user.status as UserStatus,
                deleted: user.deleted || false,
                createdAt: user.createdAt.toISOString(),
                updatedAt: user.updatedAt.toISOString(),
            })),
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

/**
 * POST /api/users
 * Create a new user (admin only).
 */
export async function POST(request: NextRequest) {
    try {
        // Require admin
        try {
            await requireAdmin()
        } catch {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem criar usuários." }, { status: 403 })
        }

        await dbConnect()

        // Parse and validate body
        const body = await request.json()
        const parseResult = createUserSchema.safeParse(body)

        if (!parseResult.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const data = parseResult.data

        // 1. Clerk integration - Get Clerk client
        const client = await clerkClient()

        // 2. Check if user already exists in Clerk
        const clerkUsersResponse = await client.users.getUserList({
            emailAddress: [data.email],
        })

        let clerkUser = clerkUsersResponse.data[0]
        let isNewClerkUser = false

        if (!clerkUser) {
            // 3. Create user in Clerk if doesn't exist
            try {
                // Split name into first and last
                const nameParts = data.name?.trim().split(/\s+/) || []
                const firstName = nameParts[0] || ""
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""

                clerkUser = await client.users.createUser({
                    emailAddress: [data.email],
                    username: data.username,
                    firstName: firstName,
                    lastName: lastName,
                    publicMetadata: {
                        role: data.role || "user",
                    },
                    // Important: we don't handle passwords here as per user schema
                    // Users will need to use forgot password or magic links
                    skipPasswordChecks: true,
                    skipPasswordRequirement: true,
                })
                isNewClerkUser = true
            } catch (clerkError: any) {
                console.error("[Clerk API] Create error:", clerkError)
                return NextResponse.json(
                    {
                        error: "Erro ao criar usuário no Clerk",
                        details: clerkError.errors?.[0]?.longMessage || clerkError.message,
                    },
                    { status: 400 },
                )
            }
        }

        // 4. Check if user already exists in our DB by Clerk ID or Email
        const existingDbUser = await User.findOne({
            $or: [{ clerkId: clerkUser.id }, { email: data.email }],
        })

        if (existingDbUser) {
            // If user was just created in Clerk but exists in DB, this is a conflict state
            // that shouldn't happen normally but we handle it
            return NextResponse.json({ error: "Usuário já cadastrado no banco de dados" }, { status: 409 })
        }

        // 5. Create user in MongoDB using Clerk's data
        const user = await User.create({
            clerkId: clerkUser.id,
            username: data.username,
            email: data.email,
            name: data.name,
            role: data.role || "user",
            status: "active",
            avatarUrl: data.avatarUrl || clerkUser.imageUrl,
        })

        // Get current user for audit logging
        const { user: currentUser } = await getCurrentUserFromDb()

        // Log audit entry for CREATE operation
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

        const response: UserResponse = {
            id: user._id.toString(),
            clerkId: user.clerkId,
            username: user.username,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            status: user.status as UserStatus,
            deleted: user.deleted || false,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
        }

        return NextResponse.json(response, { status: 201 })
    } catch (error) {
        console.error("[Users API] POST error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json({ error: "Erro ao criar usuário", details: message }, { status: 500 })
    }
}
