import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useClassFilters } from "@/features/classes/hooks/useClassFilters"

const routerReplace = vi.fn()

let currentPathname = "/classes"
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
    usePathname: () => currentPathname,
    useRouter: () => ({
        replace: routerReplace,
    }),
    useSearchParams: () => currentSearchParams,
}))

vi.mock("@/core/hooks/useDebounce", () => ({
    useDebounce: (value: string) => value,
}))

describe("useClassFilters", () => {
    beforeEach(() => {
        currentPathname = "/classes"
        currentSearchParams = new URLSearchParams()
        routerReplace.mockReset()
    })

    it("does not rewrite the url outside the classes catalog route", () => {
        currentPathname = "/classes/bruxo"
        currentSearchParams = new URLSearchParams("subclass=abc")

        renderHook(() => useClassFilters())

        expect(routerReplace).not.toHaveBeenCalled()
    })

    it("keeps syncing the url on the classes catalog route", () => {
        renderHook(() => useClassFilters())

        expect(routerReplace).toHaveBeenCalledWith("/classes", { scroll: false })
    })
})
