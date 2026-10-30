"use client"
import { signOut } from "next-auth/react"
import { useAppSession } from "@/features/perfix/components/PerfixProvider"
import { notifyAuthSessionChanged } from "@/features/auth/auth-session-events"
export function useAuth() {
    const { session, isLoaded } = useAppSession()
    const user = session?.user ?? null
    const permissions = session?.access.permissions ?? []
    const can = (key: string) => permissions.includes("*") || permissions.includes(key)
    const parts = user?.name?.trim().split(/\s+/) ?? []
    return { user, userId: user?.id ?? null, isLoaded, isSignedIn: Boolean(user), email: user?.email ?? null,
        fullName: user?.name ?? null, firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null, imageUrl: user?.image ?? null,
        roles: session?.access.roles ?? [], permissions, can, canAny: (...keys: string[]) => keys.some(can),
        isAdmin: can("admin.access"), realIsAdmin: session?.access.realIsAdministrator ?? false, isSimulating: Boolean(session?.access.simulation),
        signOut: (callbackUrl = "/sign-in") => { notifyAuthSessionChanged("signed-out"); return signOut({ callbackUrl, redirect: false }) } }
}
