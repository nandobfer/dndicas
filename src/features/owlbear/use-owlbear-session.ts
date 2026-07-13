"use client"

import * as React from "react"
import { useAuth } from "@/core/hooks/useAuth"
import { OWLBEAR_AUTH_BRIDGE_STORAGE_KEY, OWLBEAR_SESSION_INVALID_EVENT } from "./config"
import { logOwlbearDebug } from "./debug"
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

function readBridgeTokenFromStorage() {
    try {
        return window.localStorage.getItem(OWLBEAR_AUTH_BRIDGE_STORAGE_KEY)
    } catch (error) {
        console.warn("Owlbear auth bridge storage is unavailable", error)
        return null
    }
}

function removeBridgeTokenFromStorage() {
    try {
        window.localStorage.removeItem(OWLBEAR_AUTH_BRIDGE_STORAGE_KEY)
    } catch (error) {
        console.warn("Owlbear auth bridge storage is unavailable", error)
    }
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
        isAuthenticated: false,
    })
    const [bridgeToken, setBridgeToken] = React.useState<string | null>(null)
    const lastRuntimeIdentityRef = React.useRef<string | null>(null)
    const sessionRef = React.useRef(session)
    const [refreshSequence, setRefreshSequence] = React.useState(0)

    React.useEffect(() => {
        sessionRef.current = session
    }, [session])

    React.useEffect(() => {
        const handleInvalidSession = () => {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
                isAuthenticated: false,
            })
            setRefreshSequence((current) => current + 1)
        }

        window.addEventListener(OWLBEAR_SESSION_INVALID_EVENT, handleInvalidSession)
        return () => window.removeEventListener(OWLBEAR_SESSION_INVALID_EVENT, handleInvalidSession)
    }, [])

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
                isAuthenticated: false,
            })
            setRefreshSequence((current) => current + 1)
        }, refreshDelay)

        return () => clearTimeout(refreshTimer)
    }, [session.sessionExpiresAt, session.sessionStatus])

    React.useEffect(() => {
        logOwlbearDebug("[Dndicas Owlbear Session]", "state", {
            runtimeStatus: runtime.status,
            roomId: runtime.roomId,
            playerId: runtime.playerId,
            role: runtime.role,
            authLoaded: isLoaded,
            signedIn: isSignedIn,
            userId: userId ?? null,
            hasBridgeToken: Boolean(bridgeToken),
            sessionStatus: session.sessionStatus,
            hasToken: Boolean(session.sessionToken),
            expiresAt: session.sessionExpiresAt,
            sessionAuthenticated: session.isAuthenticated,
        })
    }, [bridgeToken, isLoaded, isSignedIn, runtime.playerId, runtime.role, runtime.roomId, runtime.status, session.isAuthenticated, session.sessionExpiresAt, session.sessionStatus, session.sessionToken, userId])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        setBridgeToken(readBridgeTokenFromStorage())
    }, [refreshSequence])

    React.useEffect(() => {
        if (runtime.status !== "ready" || !runtime.roomId || !runtime.playerId || !runtime.role) {
            logOwlbearDebug("[Dndicas Owlbear Session]", "waiting for runtime", {
                runtimeStatus: runtime.status,
                roomId: runtime.roomId,
                playerId: runtime.playerId,
                role: runtime.role,
            })
            return
        }
        if (!isLoaded) {
            logOwlbearDebug("[Dndicas Owlbear Session]", "waiting for auth load")
            return
        }

        if (isSignedIn && !userId) {
            logOwlbearDebug("[Dndicas Owlbear Session]", "waiting for authenticated userId")
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
                isAuthenticated: false,
            })
            return
        }

        const roomId = runtime.roomId
        const owlbearPlayerId = runtime.playerId
        const owlbearRole = runtime.role
        const effectiveBridgeToken = isSignedIn ? null : bridgeToken
        const authIdentity = isSignedIn ? `auth:${userId}` : effectiveBridgeToken ? "bridge" : "anon"
        const runtimeIdentity = `${roomId}:${owlbearPlayerId}:${owlbearRole}:${authIdentity}`
        const identityChanged = lastRuntimeIdentityRef.current !== null && lastRuntimeIdentityRef.current !== runtimeIdentity

        lastRuntimeIdentityRef.current = runtimeIdentity

        // Owlbear actions run inside a cross-origin iframe (owlbear.io -> dndicas.com.br).
        // Browsers block third-party cookies in iframes (SameSite=Lax, Safari ITP, Firefox ETP),
        // so the auth session cookie may not be sent and isSignedIn can stay false even when the user
        // is logged in on the main dndicas.com.br tab. We therefore open a backend session for
        // all roles unconditionally; the server issues an anonymous token when no authenticated userId
        // is present, a full authenticated token when the cookie does reach the server,
        // or a full authenticated token when a bridge token was saved by the top-level
        // Dndicas site in localStorage.

        if (identityChanged) {
            setSession({
                sessionStatus: "idle",
                sessionToken: null,
                sessionExpiresAt: null,
                isAuthenticated: false,
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
                        ...(effectiveBridgeToken ? { bridgeToken: effectiveBridgeToken } : {}),
                    })

                    if (cancelled) return
                    if (effectiveBridgeToken && !nextSession.isAuthenticated) {
                        removeBridgeTokenFromStorage()
                        setBridgeToken(null)
                    }
                    setSession({
                        sessionStatus: "ready",
                        sessionToken: nextSession.token,
                        sessionExpiresAt: nextSession.expiresAt,
                        isAuthenticated: Boolean(isSignedIn || nextSession.isAuthenticated),
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
                        isAuthenticated: false,
                    })
                    return
                }
            }
        })()

        return () => {
            cancelled = true
            if (retryTimer) clearTimeout(retryTimer)
        }
    }, [bridgeToken, isLoaded, isSignedIn, refreshSequence, runtime.playerId, runtime.role, runtime.roomId, runtime.status, userId])

    return {
        session,
        isAuthLoaded: isLoaded,
        isAuthenticated: Boolean(isSignedIn || session.isAuthenticated),
    }
}
