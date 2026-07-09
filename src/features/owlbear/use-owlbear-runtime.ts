"use client"

import * as React from "react"
import { logOwlbearDebug } from "./debug"
import { bootstrapOwlbearRuntime, loadOwlbearSdk } from "./sdk"
import { preloadedOwlbearSdk } from "./owlbear-sdk-client"
import type { OwlbearRuntimeState, OwlbearSdkLike } from "./types"

const INITIAL_STATE: OwlbearRuntimeState = {
    status: "booting",
    role: null,
    roomId: null,
    playerId: null,
    themeMode: "dark",
    sceneReady: false,
}

const RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const
const RUNTIME_LOG_PREFIX = "[Dndicas Owlbear Runtime]"
const RUNTIME_INSTANCE_ID = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

function isOwlbearRuntimeContext() {
    if (typeof window === "undefined") return false
    if (window.location.pathname.startsWith("/owlbear")) return true
    if (window.location.search.includes("obrref=")) return true
    try {
        return window.self !== window.top
    } catch {
        return true
    }
}

function getRetryDelay(attempt: number) {
    return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
}

function logRuntimeDebug(message: string, details?: Record<string, unknown>) {
    logOwlbearDebug(RUNTIME_LOG_PREFIX, message, {
        runtimeInstanceId: RUNTIME_INSTANCE_ID,
        ...(details ?? {}),
    })
}

export function useOwlbearRuntime() {
    const [runtime, setRuntime] = React.useState<OwlbearRuntimeState>(INITIAL_STATE)

    React.useEffect(() => {
        let mounted = true
        let subscriptionsReady = false
        let runtimeSubscriptionsReady = false
        let retryTimer: number | undefined
        const cleanups: Array<() => void> = []

        const clearRetry = () => {
            if (retryTimer === undefined) return
            window.clearTimeout(retryTimer)
            retryTimer = undefined
        }

        const scheduleRetry = (attempt: number, callback: (nextAttempt: number) => void) => {
            clearRetry()
            const delayMs = getRetryDelay(attempt)
            logRuntimeDebug("schedule retry", { attempt, nextAttempt: attempt + 1, delayMs })
            retryTimer = window.setTimeout(() => callback(attempt + 1), delayMs)
        }

        const bootstrapRuntime = async (attempt = 0) => {
            const isTransientContext = isOwlbearRuntimeContext()
            logRuntimeDebug("bootstrap attempt", {
                attempt,
                isTransientContext,
                pathname: window.location.pathname,
                search: window.location.search,
            })
            const sdk: OwlbearSdkLike | null = preloadedOwlbearSdk
                ?? await loadOwlbearSdk().catch((error) => {
                    console.error(RUNTIME_LOG_PREFIX, "fallback sdk import failed", error)
                    return null
                })
            if (!mounted) return

            logRuntimeDebug("sdk import result", {
                attempt,
                hasSdk: Boolean(sdk),
                isAvailable: sdk?.isAvailable ?? null,
                isReady: sdk?.isReady ?? null,
                roomId: sdk?.room?.id ?? null,
            })

            if (!sdk || !sdk.isAvailable) {
                if (isTransientContext) {
                    logRuntimeDebug("sdk unavailable in transient context; keep booting", { attempt })
                    setRuntime((current) => ({ ...current, status: "booting" }))
                    scheduleRetry(attempt, bootstrapRuntime)
                    return
                }

                logRuntimeDebug("sdk unavailable outside transient context", { attempt })
                setRuntime((current) => ({ ...current, status: "unavailable" }))
                return
            }

            if (!subscriptionsReady) {
                subscriptionsReady = true

                const unsubscribeReady = sdk.onReady(() => {
                    logRuntimeDebug("sdk onReady fired", {
                        isAvailable: sdk.isAvailable,
                        isReady: sdk.isReady,
                        roomId: sdk.room?.id ?? null,
                    })
                    void bootstrapRuntime(0)
                })

                if (typeof unsubscribeReady === "function") {
                    cleanups.push(unsubscribeReady)
                }
            }

            if (!sdk.isReady) {
                logRuntimeDebug("sdk available but not ready; keep booting", {
                    attempt,
                    roomId: sdk.room?.id ?? null,
                })
                setRuntime((current) => ({ ...current, status: "booting" }))
                scheduleRetry(attempt, bootstrapRuntime)
                return
            }

            logRuntimeDebug("sdk ready; bootstrap runtime state", { attempt, roomId: sdk.room?.id ?? null })
            const next = await bootstrapOwlbearRuntime(sdk)
            if (!mounted) return

            logRuntimeDebug("bootstrap runtime result", { ...next })

            if (next.status === "ready") {
                if (!runtimeSubscriptionsReady) {
                    runtimeSubscriptionsReady = true

                    const unsubscribeTheme = sdk.theme.onChange((theme) => {
                        if (!mounted) return
                        setRuntime((current) => ({
                            ...current,
                            themeMode: theme.mode === "LIGHT" ? "light" : "dark",
                        }))
                    })

                    if (typeof unsubscribeTheme === "function") {
                        cleanups.push(unsubscribeTheme)
                    }

                    const unsubscribeScene = sdk.scene.onReadyChange((ready) => {
                        if (!mounted) return
                        setRuntime((current) => ({
                            ...current,
                            sceneReady: ready,
                        }))
                    })

                    if (typeof unsubscribeScene === "function") {
                        cleanups.push(unsubscribeScene)
                    }
                }

                clearRetry()
                setRuntime(next)
                return
            }

            if (isTransientContext) {
                setRuntime((current) => ({ ...current, status: "booting" }))
                scheduleRetry(attempt, bootstrapRuntime)
                return
            }

            setRuntime(next)
        }

        void (async () => {
            await bootstrapRuntime()
        })()

        return () => {
            mounted = false
            clearRetry()
            cleanups.forEach((cleanup) => cleanup())
        }
    }, [])

    return runtime
}
