"use client"

import * as React from "react"
import { SessionProvider } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/core/hooks/useAuth"
import { OWLBEAR_AUTH_BRIDGE_STORAGE_KEY } from "@/features/owlbear/config"

function isEmbeddedOwlbearSurface(pathname: string | null) {
    if (typeof window === "undefined") return false
    if (!pathname?.startsWith("/owlbear")) return false
    return window.self !== window.top
}

function removeOwlbearBridgeToken() {
    try {
        window.localStorage.removeItem(OWLBEAR_AUTH_BRIDGE_STORAGE_KEY)
    } catch (error) {
        console.warn("Owlbear auth bridge storage is unavailable", error)
    }
}

function saveOwlbearBridgeToken(token: string) {
    try {
        window.localStorage.setItem(OWLBEAR_AUTH_BRIDGE_STORAGE_KEY, token)
    } catch (error) {
        console.warn("Owlbear auth bridge storage is unavailable", error)
    }
}

function OwlbearAuthBridgeTokenSync() {
    const pathname = usePathname()
    const { isLoaded, isSignedIn } = useAuth()

    React.useEffect(() => {
        if (!isLoaded || typeof window === "undefined") return

        if (!isSignedIn) {
            if (!isEmbeddedOwlbearSurface(pathname)) {
                removeOwlbearBridgeToken()
            }
            return
        }

        let cancelled = false
        void (async () => {
            try {
                const response = await fetch("/api/owlbear/auth/bridge-token", {
                    cache: "no-store",
                    credentials: "same-origin",
                })
                if (!response.ok) return

                const payload = await response.json() as { token?: string }
                if (!cancelled && payload.token) {
                    saveOwlbearBridgeToken(payload.token)
                }
            } catch (error) {
                console.error("Failed to sync Owlbear auth bridge token", error)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [isLoaded, isSignedIn, pathname])

    return null
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <OwlbearAuthBridgeTokenSync />
            {children}
        </SessionProvider>
    )
}
