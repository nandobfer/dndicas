"use client"

import { useEffect } from "react"
import {
    clearChunkLoadReloadFlag,
    isRecoverableChunkLoadError,
    recoverFromChunkLoadError,
} from "@/core/utils/chunk-load-recovery"

export function ChunkLoadRecovery() {
    useEffect(() => {
        clearChunkLoadReloadFlag(window)

        const handleWindowError = (event: ErrorEvent) => {
            if (!isRecoverableChunkLoadError(event.error ?? event.message)) {
                return
            }

            if (recoverFromChunkLoadError(window)) {
                event.preventDefault()
            }
        }

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (!isRecoverableChunkLoadError(event.reason)) {
                return
            }

            if (recoverFromChunkLoadError(window)) {
                event.preventDefault()
            }
        }

        window.addEventListener("error", handleWindowError)
        window.addEventListener("unhandledrejection", handleUnhandledRejection)

        return () => {
            window.removeEventListener("error", handleWindowError)
            window.removeEventListener("unhandledrejection", handleUnhandledRejection)
        }
    }, [])

    return null
}
