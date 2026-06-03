import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWarmSearchCache } from "@/core/hooks/useWarmSearchCache"

const mocks = vi.hoisted(() => ({
    warmSearchCache: vi.fn(),
    warmSearchWorkerCache: vi.fn(),
}))

vi.mock("@/core/utils/search-engine", () => ({
    warmSearchCache: mocks.warmSearchCache,
}))

vi.mock("@/core/utils/search-worker-client", () => ({
    warmSearchWorkerCache: mocks.warmSearchWorkerCache,
}))

function TestComponent() {
    useWarmSearchCache()
    return null
}

describe("useWarmSearchCache", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mocks.warmSearchCache.mockReset()
        mocks.warmSearchWorkerCache.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("delays search cache warmup to avoid blocking the initial render", () => {
        render(<TestComponent />)

        vi.advanceTimersByTime(1499)

        expect(mocks.warmSearchCache).not.toHaveBeenCalled()
        expect(mocks.warmSearchWorkerCache).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)

        expect(mocks.warmSearchCache).toHaveBeenCalledTimes(1)
        expect(mocks.warmSearchWorkerCache).toHaveBeenCalledTimes(1)
    })
})
