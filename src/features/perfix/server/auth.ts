import { User } from "@/features/users/models/user"
import { requestAccess } from "./access"

/** A identidade exposta a ownership é a efetiva; o ator real fica no contexto de auditoria. */
export async function auth() {
    const context = await requestAccess()
    return { userId: context?.userId ?? null }
}
export async function currentUser() {
    const context = await requestAccess()
    if (!context) return null
    const user = await User.findById(context.userId).lean()
    if (!user) return null
    const parts = user.name?.trim().split(/\s+/).filter(Boolean) ?? []
    return { id: context.userId, username: user.username, firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null,
        fullName: user.name || user.username, imageUrl: user.avatarUrl ?? null,
        emailAddresses: [{ emailAddress: user.email }], primaryEmailAddress: { emailAddress: user.email },
        permissions: [...context.effective], roles: context.roles, isAdmin: context.effective.has("*"),
        can: (key: string) => context.effective.has("*") || context.effective.has(key), realUserId: context.realUserId }
}
export type AuthServerUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>
