import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RaceFilters } from "@/features/races/components/race-filters"

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({ isAdmin: false }),
}))

vi.mock("@/components/ui/search-input", () => ({
    SearchInput: ({
        value,
        onChange,
        placeholder,
    }: {
        value: string
        onChange: (value: string) => void
        placeholder?: string
    }) => <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />,
}))

vi.mock("@/components/ui/source-filter", () => ({
    SourceFilter: () => <div>source-filter</div>,
}))

vi.mock("@/components/ui/status-chips", () => ({
    StatusChips: () => <div>status-chips</div>,
}))

describe("RaceFilters", () => {
    it("describes the search as name or original name only", () => {
        render(
            <RaceFilters
                filters={{ search: "", status: "all", sources: [] }}
                onSearchChange={vi.fn()}
                onStatusChange={vi.fn()}
                onSourcesChange={vi.fn()}
            />
        )

        expect(screen.getByPlaceholderText("Buscar raças por nome ou nome original...")).toBeInTheDocument()
        expect(screen.queryByPlaceholderText("Buscar raças por nome, descrição ou fonte...")).not.toBeInTheDocument()
    })
})
