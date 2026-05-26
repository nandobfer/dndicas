import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useSpellFilters } from "@/features/spells/hooks/useSpellFilters"

const routerReplace = vi.fn()

let currentPathname = "/spells"
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

describe("useSpellFilters", () => {
    beforeEach(() => {
        currentPathname = "/spells"
        currentSearchParams = new URLSearchParams()
        routerReplace.mockReset()
    })

    it("does not rewrite the url outside the spells catalog route", () => {
        currentPathname = "/classes/bruxo"
        currentSearchParams = new URLSearchParams("subclass=abc")

        renderHook(() => useSpellFilters())

        expect(routerReplace).not.toHaveBeenCalled()
    })

    it("keeps syncing the url on the spells catalog route", () => {
        renderHook(() => useSpellFilters())

        expect(routerReplace).toHaveBeenCalledWith("/spells", { scroll: false })
    })
})
