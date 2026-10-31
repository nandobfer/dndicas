/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.hoisted(() => ({ realIsAdmin: false }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ realIsAdmin: auth.realIsAdmin }) }))
vi.mock("@/features/perfix/components/view-as/ViewAsSelector", () => ({ ViewAsSelector: () => <button type="button">Visualizar como</button> }))

const { HeaderViewAs } = await import("@/features/perfix/components/view-as/HeaderViewAs")

describe("'Visualizar como' no header", () => {
    beforeEach(() => {
        auth.realIsAdmin = false
    })

    it("só aparece para o administrador real", () => {
        const { rerender } = render(<HeaderViewAs />)
        expect(screen.queryByRole("button", { name: "Visualizar como" })).toBeNull()
        auth.realIsAdmin = true
        rerender(<HeaderViewAs />)
        expect(screen.getByTestId("header-view-as")).toContainElement(screen.getByRole("button", { name: "Visualizar como" }))
    })
})
