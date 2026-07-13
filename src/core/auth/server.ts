import { getServerSession } from "next-auth"
import { authOptions } from "@/features/auth/auth-options"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import type { UserRole } from "@/features/users/types/user.types"

export type AuthServerUser = {
    id: string
    username: string | null
    firstName: string | null
    lastName: string | null
    fullName: string | null
    imageUrl: string | null
    emailAddresses: Array<{ emailAddress: string }>
    primaryEmailAddress: { emailAddress: string } | null
    publicMetadata: { role?: UserRole }
}

function splitName(name?: string | null) {
    const parts = name?.trim().split(/\s+/).filter(Boolean) ?? []
    return {
        firstName: parts[0] ?? null,
        lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    }
}

function toAuthServerUser(user: {
    _id: { toString(): string }
    username: string
    email: string
    name?: string | null
    avatarUrl?: string | null
    role: UserRole
}): AuthServerUser {
    const { firstName, lastName } = splitName(user.name)
    return {
        id: user._id.toString(),
        username: user.username,
        firstName,
        lastName,
        fullName: user.name || user.username,
        imageUrl: user.avatarUrl ?? null,
        emailAddresses: [{ emailAddress: user.email }],
        primaryEmailAddress: { emailAddress: user.email },
        publicMetadata: { role: user.role },
    }
}

export async function auth(): Promise<{ userId: string | null }> {
    const session = await getServerSession(authOptions)
    return { userId: session?.user?.id ?? null }
}

export async function currentUser(): Promise<AuthServerUser | null> {
    const { userId } = await auth()
    if (!userId) return null

    await dbConnect()
    const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" }).lean()
    if (!user) return null

    return toAuthServerUser(user)
}
