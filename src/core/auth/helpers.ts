import { auth, currentUser } from "@/core/auth/server"
import { logAction } from "@/features/perfix/server/audit"

export async function getCurrentUserId(): Promise<string | null> {
    const { userId } = await auth()
    return userId
}

export async function getCurrentUser() {
    return currentUser()
}

export async function requireAuth(): Promise<string> {
    const { userId } = await auth()

    if (!userId) {
        throw new Error("UNAUTHORIZED")
    }

    return userId
}

export async function hasPermission(permission: string): Promise<boolean> {
    const user = await currentUser()
    return user?.can(permission) ?? false
}

export async function hasAnyPermission(permissions: string[]): Promise<boolean> {
    const user = await currentUser()
    return Boolean(user && permissions.some(permission => user.can(permission)))
}

export async function hasAllPermissions(permissions: string[]): Promise<boolean> {
    const user = await currentUser()
    return Boolean(user && permissions.every(permission => user.can(permission)))
}
export async function isAdmin() { return hasPermission("admin.access") }

export async function logAuthAction(
    action: "LOGIN" | "LOGOUT" | "SIGNUP" | "PASSWORD_RESET" | "SESSION_EXPIRED",
    details?: Record<string, unknown>,
) {
    try {
        const { userId } = await auth()

        await logAction(action, "Auth", userId || "anonymous", userId || undefined, {
            ...details,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error("Failed to log auth action:", error)
    }
}

export async function getUserInfo() {
    const user = await currentUser()

    if (!user) return null

    return {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress || null,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
    }
}

export async function isEmailVerified(): Promise<boolean> {
    return Boolean(await currentUser())
}
