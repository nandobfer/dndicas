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

const SESSION_RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const
const MAX_SESSION_OPEN_ATTEMPTS = 8
const SESSION_REFRESH_SKEW_MS = 60 * 1000
const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647

function getSessionRetryDelay(attempt: number) {
    return SESSION_RETRY_DELAYS_MS[Math.min(attempt, SESSION_RETRY_DELAYS_MS.length - 1)]
}

function isRetryableSessionError(error: Error & { status?: number }, isSignedIn: boolean) {
    if (error.status === 401 && isSignedIn) return true
    if (!error.status) return true
    return error.status >= 500
}

export function useOwlbearSession(runtime: OwlbearRuntimeState) {
    const { isLoaded, isSignedIn, userId } = useAuth()
    const [session, setSession] = React.useState<OwlbearSessionState>({
        sessionStatus: "idle",
        sessionToken: null,
        sessionExpiresAt: null,
    })
    const lastRuntimeIdentityRef = React.useRef<string | null>(null)
    const sessionRef = React.useRef(session)
    const [refreshSequence, setRefreshSequence] = React.useState(0)

    React.useEffect(() => {
        sessionRef.current = session
    }, [session])

    React.useEffect(() => {
        if (session.sessionStatus !== "ready" || !session.sessionExpiresAt) return

        const expiresAt = Date.parse(session.sessionExpiresAt)
        if (Number.isNaN(expiresAt)) return

        const refreshDelay = Math.min(MAX_BROWSER_TIMEOUT_MS, Math.max(0, expiresAt - Date.now() - SESSION_REFRESH_SKEW_MS))
        const refreshTimer = setTimeout(() => {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
            })
            setRefreshSequence((current) => current + 1)
        }, refreshDelay)

        return () => clearTimeout(refreshTimer)
    }, [session.sessionExpiresAt, session.sessionStatus])

    React.useEffect(() => {
        if (runtime.status !== "ready" || !runtime.roomId || !runtime.playerId || !runtime.role) return
        if (!isLoaded) return

        if (isSignedIn && !userId) {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
            })
            return
        }

        const roomId = runtime.roomId
        const owlbearPlayerId = runtime.playerId
        const owlbearRole = runtime.role
        const authIdentity = isSignedIn ? `auth:${userId}` : "anon"
        const runtimeIdentity = `${roomId}:${owlbearPlayerId}:${owlbearRole}:${authIdentity}`
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
        let retryTimer: ReturnType<typeof setTimeout> | undefined

        const waitForRetry = (attempt: number) => new Promise<void>((resolve) => {
            retryTimer = setTimeout(resolve, getSessionRetryDelay(attempt))
        })

        setSession((current) => ({
            ...current,
            sessionStatus: "loading",
        }))

        void (async () => {
            for (let attempt = 0; attempt < MAX_SESSION_OPEN_ATTEMPTS; attempt += 1) {
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
                    return
                } catch (error) {
                    const sessionError = error as Error & { status?: number }
                    if (cancelled) return

                    const canRetry = attempt < MAX_SESSION_OPEN_ATTEMPTS - 1 && isRetryableSessionError(sessionError, Boolean(isSignedIn))
                    if (canRetry) {
                        console.warn("Retrying Owlbear backend session open", {
                            roomId,
                            owlbearPlayerId,
                            owlbearRole,
                            authIdentity,
                            attempt: attempt + 1,
                            status: sessionError.status,
                        })
                        await waitForRetry(attempt)
                        if (cancelled) return
                        continue
                    }

                    console.error("Failed to open Owlbear backend session", {
                        roomId,
                        owlbearPlayerId,
                        owlbearRole,
                        authIdentity,
                        status: sessionError.status,
                        error,
                    })
                    setSession({
                        sessionStatus: "error",
                        sessionToken: null,
                        sessionExpiresAt: null,
                    })
                    return
                }
            }
        })()

        return () => {
            cancelled = true
            if (retryTimer) clearTimeout(retryTimer)
        }
    }, [isLoaded, isSignedIn, refreshSequence, runtime.playerId, runtime.role, runtime.roomId, runtime.status, userId])

    return {
        session,
        isAuthLoaded: isLoaded,
        isAuthenticated: Boolean(isSignedIn),
    }
}
