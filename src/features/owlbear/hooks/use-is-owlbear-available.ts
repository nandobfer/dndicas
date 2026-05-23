"use client"

import * as React from "react"
import { loadOwlbearSdk } from "../sdk"
import { shouldLoadOwlbearSdk } from "../should-load-owlbear-sdk"

export function useIsOwlbearAvailable() {
    const [isOwlbearAvailable, setIsOwlbearAvailable] = React.useState(false)

    React.useEffect(() => {
        if (!shouldLoadOwlbearSdk(window)) {
            setIsOwlbearAvailable(false)
            return
        }

        let mounted = true

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!mounted) return

            setIsOwlbearAvailable(Boolean(sdk?.isAvailable))
        })()

        return () => {
            mounted = false
        }
    }, [])

    return isOwlbearAvailable
}
