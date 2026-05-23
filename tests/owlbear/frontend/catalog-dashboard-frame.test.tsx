import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CatalogDashboardFrame, OWLBEAR_CATALOG_EMBED_PARAM } from "@/features/owlbear/catalog-dashboard-frame"

describe("CatalogDashboardFrame", () => {
    it("marks the embedded dashboard URL as Owlbear catalog content", () => {
        render(<CatalogDashboardFrame />)

        expect(screen.getByTitle("Dndicas Dashboard")).toHaveAttribute("src", `/?${OWLBEAR_CATALOG_EMBED_PARAM}=1`)
    })
})
