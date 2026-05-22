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

export function useOwlbearRuntime() {
    const [runtime, setRuntime] = React.useState<OwlbearRuntimeState>(INITIAL_STATE)

    React.useEffect(() => {
        let mounted = true
        const cleanups: Array<() => void> = []
        void (async () => {
            const sdk = await loadOwlbearSdk()

            if (!mounted) return
            if (!sdk || !sdk.isAvailable) {
                setRuntime((current) => ({
                    ...current,
                    status: "unavailable",
                }))
                return
            }

            void bootstrapOwlbearRuntime().then((next) => {
                if (!mounted) return
                setRuntime(next)
            })

            if (!sdk.isReady) {
                const unsubscribeReady = sdk.onReady(() => {
                    void bootstrapOwlbearRuntime().then((next) => {
                        if (!mounted) return
                        setRuntime(next)
                    })
                })

                if (typeof unsubscribeReady === "function") {
                    cleanups.push(unsubscribeReady)
                }
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
        })()

        return () => {
            mounted = false
            cleanups.forEach((cleanup) => cleanup())
        }
    }, [])

    return runtime
}
