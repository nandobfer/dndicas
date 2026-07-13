import { auth } from "@/core/auth/server"
import dbConnect from "@/core/database/db"
import { User, type IUser } from "../models/user"

export interface CurrentUserResult {
    success: boolean
    user: IUser | null
    userId: string | null
    legacyClerkId?: string | null
    error?: string
}

export async function getLocalUserById(userId: string): Promise<IUser | null> {
    await dbConnect()
    return User.findOne({ _id: userId, deleted: { $ne: true } })
}

export async function getLocalUserByLegacyClerkId(legacyClerkId: string): Promise<IUser | null> {
    await dbConnect()
    return User.findByLegacyClerkId(legacyClerkId)
}

export async function getCurrentUserFromDb(): Promise<CurrentUserResult> {
    try {
        const { userId } = await auth()

        if (!userId) {
            return {
                success: false,
                user: null,
                userId: null,
                error: "Not authenticated",
            }
        }

        await dbConnect()
        const user = await User.findOne({ _id: userId, deleted: { $ne: true } })

        if (!user) {
            return {
                success: false,
                user: null,
                userId,
                error: "Usuário não encontrado",
            }
        }

        if (user.status === "inactive") {
            return {
                success: false,
                user: null,
                userId,
                legacyClerkId: user.legacyClerkId ?? null,
                error: "Usuário inativo",
            }
        }

        return {
            success: true,
            user,
            userId,
            legacyClerkId: user.legacyClerkId ?? null,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error("[getCurrentUserFromDb] Error:", message)

        return {
            success: false,
            user: null,
            userId: null,
            error: message,
        }
    }
}

export async function requireCurrentUser(): Promise<IUser> {
    const result = await getCurrentUserFromDb()

    if (!result.success || !result.user) {
        throw new Error(result.error || "User not found")
    }

    return result.user
}

export async function isCurrentUserAdmin(): Promise<boolean> {
    const result = await getCurrentUserFromDb()
    return result.user?.role === "admin"
}

export async function requireAdmin(): Promise<IUser> {
    const user = await requireCurrentUser()

    if (user.role !== "admin") {
        throw new Error("Admin access required")
    }

    return user
}
