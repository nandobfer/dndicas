"use client"

import * as React from "react"
import { loadOwlbearSdk } from "../sdk"

export function useIsOwlbearAvailable() {
    const [isOwlbearAvailable, setIsOwlbearAvailable] = React.useState(false)

    React.useEffect(() => {
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
