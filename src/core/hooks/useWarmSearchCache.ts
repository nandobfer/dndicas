import { useEffect } from "react"
import { warmSearchCache } from "@/core/utils/search-engine"

/**
 * Pre-populates the unified search cache on mount so the first `@` mention
 * lookup is instant instead of waiting for the initial network fetch.
 */
export function useWarmSearchCache(): void {
    useEffect(() => {
        warmSearchCache()
    }, [])
}
