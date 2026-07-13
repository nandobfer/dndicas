"use client"

import * as React from "react"
import type { Channel } from "pusher-js"
import { useAuth } from "@/core/hooks/useAuth"
import { getPusherBrowserConfig } from "@/core/realtime/pusher-browser-config"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"
import { OWLBEAR_AUTH_HANDOFF_CHANNEL_PREFIX, OWLBEAR_AUTH_HANDOFF_EVENT, OWLBEAR_SESSION_INVALID_EVENT } from "./config"
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

function createRandomBridgeValue() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function isRetryableSessionError(error: Error & { status?: number }, isSignedIn: boolean) {
    if (error.status === 401 && isSignedIn) return true
    if (!error.status) return true
    return error.status >= 500
}

export function useOwlbearSession(runtime: OwlbearRuntimeState) {
    const { isLoaded, isSignedIn, userId } = useAuth()
    const [authBridgeCredentials] = React.useState(() => ({
        channelId: createRandomBridgeValue(),
        nonce: createRandomBridgeValue(),
    }))
    const [authBridgeStatus, setAuthBridgeStatus] = React.useState<"idle" | "connecting" | "ready" | "received" | "unavailable">("idle")
    const [handoffToken, setHandoffToken] = React.useState<string | null>(null)
    const [session, setSession] = React.useState<OwlbearSessionState>({
        sessionStatus: "idle",
        sessionToken: null,
        sessionExpiresAt: null,
        isAuthenticated: false,
    })
    const lastRuntimeIdentityRef = React.useRef<string | null>(null)
    const sessionRef = React.useRef(session)
    const [refreshSequence, setRefreshSequence] = React.useState(0)
    const authBridgeUrl = React.useMemo(() => {
        return `/owlbear/auth/bridge?channelId=${encodeURIComponent(authBridgeCredentials.channelId)}&nonce=${encodeURIComponent(authBridgeCredentials.nonce)}`
    }, [authBridgeCredentials.channelId, authBridgeCredentials.nonce])

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
            hasHandoffToken: Boolean(handoffToken),
            authBridgeStatus,
            sessionStatus: session.sessionStatus,
            hasToken: Boolean(session.sessionToken),
            expiresAt: session.sessionExpiresAt,
            sessionAuthenticated: session.isAuthenticated,
        })
    }, [authBridgeStatus, handoffToken, isLoaded, isSignedIn, runtime.playerId, runtime.role, runtime.roomId, runtime.status, session.isAuthenticated, session.sessionExpiresAt, session.sessionStatus, session.sessionToken, userId])

    React.useEffect(() => {
        if (runtime.status !== "ready" || !isLoaded || isSignedIn || handoffToken || session.isAuthenticated) return

        let cancelled = false
        let channelName: string | null = null
        let subscribedChannel: Channel | null = null
        let handler: ((payload: { handoffToken?: string; nonce?: string }) => void) | null = null
        const pusherService = PusherBrowserService.getInstance()

        setAuthBridgeStatus("connecting")

        void (async () => {
            try {
                const config = await getPusherBrowserConfig()
                if (cancelled) return
                if (!config) {
                    console.warn("[Dndicas Owlbear Auth] Pusher indisponível para handoff de login.")
                    setAuthBridgeStatus("unavailable")
                    return
                }

                channelName = `${OWLBEAR_AUTH_HANDOFF_CHANNEL_PREFIX}-${authBridgeCredentials.channelId}`
                const channel = pusherService.subscribe(config, channelName)
                subscribedChannel = channel
                handler = (payload) => {
                    logOwlbearDebug("[Dndicas Owlbear Auth]", "handoff event received", {
                        channelName,
                        nonceMatches: payload.nonce === authBridgeCredentials.nonce,
                        hasToken: Boolean(payload.handoffToken),
                    })

                    if (payload.nonce !== authBridgeCredentials.nonce || !payload.handoffToken) {
                        console.warn("[Dndicas Owlbear Auth] Handoff ignorado por nonce inválido ou token ausente.")
                        return
                    }

                    setHandoffToken(payload.handoffToken)
                    setAuthBridgeStatus("received")
                    setSession({
                        sessionStatus: "idle",
                        sessionToken: null,
                        sessionExpiresAt: null,
                        isAuthenticated: false,
                    })
                    setRefreshSequence((current) => current + 1)
                }
                channel.bind(OWLBEAR_AUTH_HANDOFF_EVENT, handler)
                setAuthBridgeStatus("ready")
                logOwlbearDebug("[Dndicas Owlbear Auth]", "subscribed to handoff channel", { channelName })
            } catch (error) {
                console.error("[Dndicas Owlbear Auth] Failed to subscribe to handoff channel", error)
                if (cancelled) return
                setAuthBridgeStatus("unavailable")
            }
        })()

        return () => {
            cancelled = true
            if (channelName && handler) {
                subscribedChannel?.unbind(OWLBEAR_AUTH_HANDOFF_EVENT, handler)
                pusherService.unsubscribe(channelName)
            } else if (channelName) {
                pusherService.unsubscribe(channelName)
            }
        }
    }, [authBridgeCredentials.channelId, authBridgeCredentials.nonce, handoffToken, isLoaded, isSignedIn, runtime.status, session.isAuthenticated])

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
        const effectiveHandoffToken = isSignedIn ? null : handoffToken
        const authIdentity = isSignedIn ? `auth:${userId}` : effectiveHandoffToken ? "handoff" : "anon"
        const runtimeIdentity = `${roomId}:${owlbearPlayerId}:${owlbearRole}:${authIdentity}`
        const identityChanged = lastRuntimeIdentityRef.current !== null && lastRuntimeIdentityRef.current !== runtimeIdentity

        lastRuntimeIdentityRef.current = runtimeIdentity

        // Owlbear actions run inside a cross-origin iframe (owlbear.io -> dndicas.com.br).
        // Browsers block third-party cookies in iframes (SameSite=Lax, Safari ITP, Firefox ETP),
        // so the auth session cookie may not be sent and isSignedIn can stay false even when the user
        // is logged in on the main dndicas.com.br tab. We therefore open a backend session for
        // all roles unconditionally; the server issues an anonymous token when no authenticated userId
        // is present, a full authenticated token when the cookie does reach the server,
        // or a full authenticated token when the external login tab sends a handoff
        // through the Pusher channel subscribed by this action.

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
                        ...(effectiveHandoffToken ? { handoffToken: effectiveHandoffToken } : {}),
                    })

                    if (cancelled) return
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
    }, [handoffToken, isLoaded, isSignedIn, refreshSequence, runtime.playerId, runtime.role, runtime.roomId, runtime.status, userId])

    return {
        session,
        isAuthLoaded: isLoaded,
        isAuthenticated: Boolean(isSignedIn || session.isAuthenticated),
        authBridgeUrl,
        authBridgeStatus,
    }
}
