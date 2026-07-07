import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useWarmSearchCache } from "@/core/hooks/useWarmSearchCache"

function TestComponent() {
    useWarmSearchCache()
    return null
}

describe("useWarmSearchCache", () => {
    it("does not preload searchable entities in the browser", () => {
        const setTimeoutSpy = vi.spyOn(window, "setTimeout")

        render(<TestComponent />)

        expect(setTimeoutSpy).not.toHaveBeenCalled()
        setTimeoutSpy.mockRestore()
    })
})
