"use client"

import * as React from "react"
import { bootstrapOwlbearRuntime, loadOwlbearSdk } from "./sdk"
import type { OwlbearRuntimeState } from "./types"

const INITIAL_STATE: OwlbearRuntimeState = {
    status: "booting",
    role: null,
    roomId: null,
    playerId: null,
    themeMode: "dark",
    sceneReady: false,
}

const RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const

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

export function useOwlbearRuntime() {
    const [runtime, setRuntime] = React.useState<OwlbearRuntimeState>(INITIAL_STATE)

    React.useEffect(() => {
        let mounted = true
        let subscriptionsReady = false
        let retryTimer: number | undefined
        const cleanups: Array<() => void> = []

        const clearRetry = () => {
            if (retryTimer === undefined) return
            window.clearTimeout(retryTimer)
            retryTimer = undefined
        }

        const scheduleRetry = (attempt: number, callback: (nextAttempt: number) => void) => {
            clearRetry()
            retryTimer = window.setTimeout(() => callback(attempt + 1), getRetryDelay(attempt))
        }

        const bootstrapRuntime = async (attempt = 0) => {
            const isTransientContext = isOwlbearRuntimeContext()
            const sdk = await loadOwlbearSdk().catch(() => null)
            if (!mounted) return

            if (!sdk || !sdk.isAvailable) {
                if (isTransientContext) {
                    setRuntime((current) => ({ ...current, status: "booting" }))
                    scheduleRetry(attempt, bootstrapRuntime)
                    return
                }

                setRuntime((current) => ({ ...current, status: "unavailable" }))
                return
            }

            if (!subscriptionsReady) {
                subscriptionsReady = true

                const unsubscribeReady = sdk.onReady(() => {
                    void bootstrapRuntime(0)
                })

                if (typeof unsubscribeReady === "function") {
                    cleanups.push(unsubscribeReady)
                }

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

            const next = await bootstrapOwlbearRuntime()
            if (!mounted) return

            if (next.status === "ready") {
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
