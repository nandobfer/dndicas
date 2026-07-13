"use client"

import * as React from "react"
import { signOut } from "next-auth/react"
import { AUTH_SESSION_CHANGED_EVENT, notifyAuthSessionChanged } from "@/features/auth/auth-session-events"

type AuthSessionUser = {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    username?: string | null
    role?: "admin" | "user"
}

type AuthSessionResponse = {
    user?: AuthSessionUser | null
}

export function useAuth() {
    const [user, setUser] = React.useState<AuthSessionUser | null>(null)
    const [isLoaded, setIsLoaded] = React.useState(true)

    const loadSession = React.useCallback(async (signal?: AbortSignal) => {
        if (typeof fetch !== "function") return
        setIsLoaded(false)
        try {
            const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal })
            if (!response.ok) {
                setUser(null)
                return
            }
            const session = await response.json() as AuthSessionResponse
            setUser(session.user ?? null)
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return
            setUser(null)
        } finally {
            setIsLoaded(true)
        }
    }, [])

    React.useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        const handleSessionChanged = (event: Event) => {
            if (cancelled) return
            const reason = event instanceof CustomEvent ? event.detail : "refresh"
            if (reason === "signed-out") {
                setUser(null)
                setIsLoaded(true)
                return
            }
            void loadSession()
        }

        void loadSession(controller.signal)
        window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged)
        return () => {
            cancelled = true
            controller.abort()
            window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged)
        }
    }, [loadSession])

    const nameParts = user?.name?.trim().split(/\s+/).filter(Boolean) ?? []

    return {
        user,
        userId: user?.id ?? null,
        isLoaded,
        isSignedIn: Boolean(user?.id),
        signOut: (callbackUrl = "/sign-in") => {
            notifyAuthSessionChanged("signed-out")
            return signOut({ callbackUrl, redirect: false })
        },
        email: user?.email || null,
        fullName: user?.name || null,
        firstName: nameParts[0] ?? null,
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
        imageUrl: user?.image || null,
        isAdmin: user?.role === "admin",
    }
}
