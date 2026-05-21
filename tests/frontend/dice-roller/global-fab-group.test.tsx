import { render, screen } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GlobalFabGroup } from "@/features/dice-roller/components/global-fab-group"

const useIsOwlbearAvailableMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/owlbear/hooks/use-is-owlbear-available", () => ({
    useIsOwlbearAvailable: () => useIsOwlbearAvailableMock(),
}))

vi.mock("@/features/dice-roller/components/dice-roller-fab", () => ({
    DiceRollerFab: () => <button type="button">Dice FAB</button>,
}))

vi.mock("@/components/ui/global-search-fab", () => ({
    GlobalSearchFAB: ({ embedded }: { embedded?: boolean }) => (
        <div data-testid="global-search-fab" data-embedded={String(embedded)}>
            Search FAB
        </div>
    ),
}))

describe("GlobalFabGroup", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.history.replaceState({}, "", "/")
    })

    it("renders the dice FAB outside Owlbear", () => {
        useIsOwlbearAvailableMock.mockReturnValue(false)

        render(<GlobalFabGroup />)

        expect(screen.getByRole("button", { name: "Dice FAB" })).toBeInTheDocument()
        expect(screen.getByTestId("global-search-fab")).toHaveAttribute("data-embedded", "true")
    })

    it("hides only the dice FAB when Owlbear is available", () => {
        useIsOwlbearAvailableMock.mockReturnValue(true)

        render(<GlobalFabGroup />)

        expect(screen.queryByRole("button", { name: "Dice FAB" })).not.toBeInTheDocument()
        expect(screen.getByTestId("global-search-fab")).toBeInTheDocument()
    })

    it("hides the dice FAB inside the Owlbear catalog iframe even without SDK access", () => {
        useIsOwlbearAvailableMock.mockReturnValue(false)
        window.history.replaceState({}, "", "/?owlbearCatalogEmbed=1")

        render(<GlobalFabGroup />)

        expect(screen.queryByRole("button", { name: "Dice FAB" })).not.toBeInTheDocument()
        expect(screen.getByTestId("global-search-fab")).toBeInTheDocument()
    })
})
