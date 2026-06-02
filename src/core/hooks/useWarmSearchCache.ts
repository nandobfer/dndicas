import { useEffect } from "react"
import { warmSearchCache } from "@/core/utils/search-engine"
import { warmSearchWorkerCache } from "@/core/utils/search-worker-client"

const WARM_SEARCH_CACHE_DELAY_MS = 1500

/**
 * Pre-populates the unified search cache on mount so the first `@` mention
 * lookup is instant instead of waiting for the initial network fetch.
 */
export function useWarmSearchCache(): void {
    useEffect(() => {
        const timer = window.setTimeout(() => {
            warmSearchCache()
            warmSearchWorkerCache()
        }, WARM_SEARCH_CACHE_DELAY_MS)

        return () => {
            window.clearTimeout(timer)
        }
    }, [])
}
