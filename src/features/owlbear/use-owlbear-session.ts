"use client"

import * as React from "react"
import { useAuth } from "@/core/hooks/useAuth"
import { openOwlbearBackendSession } from "./sdk"
import type { OwlbearRuntimeState, OwlbearSessionState } from "./types"

function isSessionUsable(session: OwlbearSessionState) {
    if (session.sessionStatus !== "ready" || !session.sessionToken || !session.sessionExpiresAt) {
        return false
    }

    const expiresAt = Date.parse(session.sessionExpiresAt)
    if (Number.isNaN(expiresAt)) return false

    return expiresAt > Date.now()
}

export function useOwlbearSession(runtime: OwlbearRuntimeState) {
    const { isLoaded, isSignedIn } = useAuth()
    const [session, setSession] = React.useState<OwlbearSessionState>({
        sessionStatus: "idle",
        sessionToken: null,
        sessionExpiresAt: null,
    })
    const lastRuntimeIdentityRef = React.useRef<string | null>(null)
    const sessionRef = React.useRef(session)

    React.useEffect(() => {
        sessionRef.current = session
    }, [session])

    React.useEffect(() => {
        if (runtime.status !== "ready" || !runtime.roomId || !runtime.playerId || !runtime.role) return
        if (!isLoaded) return

        const roomId = runtime.roomId
        const owlbearPlayerId = runtime.playerId
        const owlbearRole = runtime.role
        const runtimeIdentity = `${roomId}:${owlbearPlayerId}:${owlbearRole}`
        const identityChanged = lastRuntimeIdentityRef.current !== null && lastRuntimeIdentityRef.current !== runtimeIdentity

        lastRuntimeIdentityRef.current = runtimeIdentity

        const requiresClerkAuth = owlbearRole === "PLAYER"

        if (requiresClerkAuth && !isSignedIn) {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
            })
            return
        }

        if (identityChanged) {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
            })
        } else if (isSessionUsable(sessionRef.current)) {
            return
        } else if (sessionRef.current.sessionStatus === "loading") {
            return
        }

        let cancelled = false

        setSession((current) => ({
            ...current,
            sessionStatus: "loading",
        }))

        void (async () => {
            try {
                const nextSession = await openOwlbearBackendSession({
                    roomId,
                    owlbearPlayerId,
                    owlbearRole,
                })

                if (cancelled) return
                setSession({
                    sessionStatus: "ready",
                    sessionToken: nextSession.token,
                    sessionExpiresAt: nextSession.expiresAt,
                })
            } catch (error) {
                const sessionError = error as Error & { status?: number }
                if (cancelled) return

                if (sessionError.status === 401) {
                    setSession({
                        sessionStatus: "idle",
                        sessionToken: null,
                        sessionExpiresAt: null,
                    })
                    return
                }

                console.error("Failed to open Owlbear backend session", error)
                setSession({
                    sessionStatus: "error",
                    sessionToken: null,
                    sessionExpiresAt: null,
                })
            }
        })()

        return () => {
            cancelled = true
        }
    }, [isLoaded, isSignedIn, runtime.playerId, runtime.role, runtime.roomId, runtime.status])

    return {
        session,
        isAuthLoaded: isLoaded,
        isAuthenticated: Boolean(isSignedIn),
    }
}
