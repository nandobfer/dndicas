/**
 * @fileoverview Users API route for listing and creating users.
 *
 * @see specs/000/contracts/users.yaml
 */

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { User, IUser } from "@/features/users/models/user"
import { requireAdmin, getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { createUserSchema, userFiltersSchema } from "@/features/users/api/validation"
import { logCreate, logUpdate } from "@/features/users/api/audit-service"
import { syncUserFromClerk } from "@/features/users/api/sync"
import { UserFilters, UsersListResponse, UserResponse, UserStatus, UserRole } from "@/features/users/types/user.types"

/**
 * GET /api/users
 * List users with pagination and filters.
 */
export async function GET(request: NextRequest) {
    try {
        await dbConnect()

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const rawFilters = {
            search: searchParams.get("search") || "",
            role: searchParams.get("role") || "all",
            status: searchParams.get("status") || "active",
            page: searchParams.get("page") || "1",
            limit: searchParams.get("limit") || "10"
        }

        // Validate filters
        const parseResult = userFiltersSchema.safeParse({
            ...rawFilters,
            page: parseInt(rawFilters.page, 10),
            limit: parseInt(rawFilters.limit, 10)
        })

        if (!parseResult.success) {
            return NextResponse.json({ error: "Filtros inválidos", details: parseResult.error.flatten() }, { status: 400 })
        }

        const filters: UserFilters = parseResult.data

        // Build query
        // We use $and to ensure deleted filter is ALWAYS applied even if other filters are added
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query: any = {
            $and: [{ deleted: { $ne: true } }]
        }

        // Status filter
        if (filters.status && filters.status !== "all") {
            query.$and!.push({ status: filters.status })
        } else if (!filters.status || filters.status === "all") {
            query.$and!.push({ status: { $in: ["active", "inactive"] } })
        }

        // Role filter
        if (filters.role && filters.role !== "all") {
            query.$and!.push({ role: filters.role })
        }

        // Search filter
        if (filters.search) {
            query.$and!.push({
                $or: [
                    { username: { $regex: filters.search, $options: "i" } },
                    { email: { $regex: filters.search, $options: "i" } },
                    { name: { $regex: filters.search, $options: "i" } }
                ]
            })
        }

        // Pagination
        const page = filters.page || 1
        const limit = filters.limit || 10
        const skip = (page - 1) * limit

        // Execute query
        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(query)
        ])

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
                updatedAt: user.updatedAt.toISOString()
            })),
            total,
            page,
            totalPages: Math.ceil(total / limit)
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
            emailAddress: [data.email]
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
                        role: data.role || "user"
                    },
                    // Important: we don't handle passwords here as per user schema
                    // Users will need to use forgot password or magic links
                    skipPasswordChecks: true,
                    skipPasswordRequirement: true
                })
                isNewClerkUser = true
            } catch (clerkError) {
                console.error("[Clerk API] Create error:", clerkError)
                const details =
                    (clerkError as { errors?: { longMessage: string }[]; message?: string }).errors?.[0]?.longMessage || (clerkError as Error).message
                return NextResponse.json(
                    {
                        error: "Erro ao criar usuário no Clerk",
                        details: details
                    },
                    { status: 400 }
                )
            }
        }

        // 4. Sync user with our database using the synchronization service
        // This handles both creation and updating if user already exists
        const clerkUserData = {
            id: clerkUser.id,
            username: clerkUser.username || data.username,
            email_addresses: clerkUser.emailAddresses.map((e) => ({
                id: e.id,
                email_address: e.emailAddress
            })),
            primary_email_address_id: clerkUser.primaryEmailAddressId,
            first_name: clerkUser.firstName,
            last_name: clerkUser.lastName,
            image_url: clerkUser.imageUrl,
            public_metadata: {
                role: (data.role as UserRole) || (clerkUser.publicMetadata?.role as UserRole) || "user"
            }
        }

        const syncResult = await syncUserFromClerk(clerkUserData)

        if (!syncResult.success || !syncResult.user) {
            return NextResponse.json({ error: "Erro ao sincronizar usuário com o banco", details: syncResult.error }, { status: 500 })
        }

        const user = syncResult.user

        // Get current user for audit logging
        const { user: currentUser } = await getCurrentUserFromDb()

        // 5. Log audit entry based on action
        if (syncResult.action === "created") {
            await logCreate("User", user._id.toString(), currentUser?._id.toString() || "unknown", {
                _id: user._id.toString(),
                username: user.username,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            })
        } else if (syncResult.action === "updated") {
            await logUpdate(
                "User",
                user._id.toString(),
                currentUser?._id.toString() || "unknown",
                {}, // prev data (simplified)
                {
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    status: user.status
                }
            )
        }

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
            updatedAt: user.updatedAt.toISOString()
        }

        return NextResponse.json(response, { status: 201 })
    } catch (error) {
        console.error("[Users API] POST error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json({ error: "Erro ao criar usuário", details: message }, { status: 500 })
    }
}
