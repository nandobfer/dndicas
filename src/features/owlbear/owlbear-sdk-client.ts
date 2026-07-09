"use client"

import type { OwlbearSdkLike } from "./types"

function preloadOwlbearSdk(): OwlbearSdkLike | null {
    if (typeof window === "undefined") return null

    // Keep the browser load synchronous during module evaluation. The Owlbear SDK
    // registers its postMessage listener immediately and can miss OBR_READY if it
    // is loaded later from a React effect or an async import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdkModule = require("@owlbear-rodeo/sdk") as { default: OwlbearSdkLike }
    return sdkModule.default
}

export const preloadedOwlbearSdk = preloadOwlbearSdk()
