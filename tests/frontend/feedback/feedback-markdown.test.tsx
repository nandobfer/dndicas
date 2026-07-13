import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FeedbackMarkdown } from "@/features/feedback/components/feedback-markdown"

describe("FeedbackMarkdown", () => {
    it("renderiza markdown GFM comum", () => {
        render(<FeedbackMarkdown>{"## Plano De Implementação\n\n- [x] Mapear APIs\n\n| Item | Status |\n| --- | --- |\n| Plano | OK |"}</FeedbackMarkdown>)

        expect(screen.getByRole("heading", { name: "Plano De Implementação" })).toBeInTheDocument()
        expect(screen.getByText("Mapear APIs")).toBeInTheDocument()
        expect(screen.getByRole("table")).toBeInTheDocument()
        expect(screen.getByText("Plano")).toBeInTheDocument()
    })

    it("não renderiza HTML bruto como elemento real", () => {
        render(<FeedbackMarkdown>{"<script>alert('xss')</script>\n\n<strong>texto</strong>"}</FeedbackMarkdown>)

        expect(document.querySelector("script")).not.toBeInTheDocument()
        expect(document.querySelector("strong")).not.toBeInTheDocument()
        expect(screen.getByText(/<script>alert/)).toBeInTheDocument()
    })
})
