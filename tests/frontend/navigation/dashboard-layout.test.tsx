/** @vitest-environment happy-dom */
import { render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import DashboardLayout from "@/app/(dashboard)/layout"
import { motionConfig } from "@/lib/config/motion-configs"

const nav = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock("@/core/hooks/useWarmSearchCache", () => ({ useWarmSearchCache: () => undefined }))
vi.mock("@/components/ui/glass-background", () => ({ LiquidGlassBackground: () => null }))
vi.mock("@/components/ui/glass-header", () => ({ GlassHeader: ({ actions }: { actions?: React.ReactNode }) => <header data-testid="glass-header">{actions}</header> }))
vi.mock("@/features/perfix/components/view-as/HeaderViewAs", () => ({ HeaderViewAs: () => <div data-testid="header-view-as" /> }))
vi.mock("@/features/perfix/components/view-as/ViewAsBanner", () => ({ ViewAsBanner: () => <div data-testid="view-as-banner" /> }))
vi.mock("@/components/ui/glass-footer", () => ({ GlassFooter: () => <footer data-testid="glass-footer" /> }))
vi.mock("@/features/dice-roller/components/global-fab-group", () => ({ GlobalFabGroup: () => <div data-testid="fab-group" /> }))
vi.mock("@/features/dice-roller/components/dice-roll-context", () => ({
    DiceRollerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/features/opex-agent/components/OpexScopeProvider", () => ({
    OpexScopeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("DashboardLayout", () => {
    beforeEach(() => {
        nav.search = ""
        window.sessionStorage.clear()
    })

    it("mostra header, conteúdo em largura toda, rodapé e botões flutuantes, sem sidebar", () => {
        const { container } = render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>)
        expect(screen.getByTestId("glass-header")).toBeInTheDocument()
        expect(screen.getByTestId("glass-footer")).toBeInTheDocument()
        expect(screen.getByTestId("fab-group")).toBeInTheDocument()
        expect(container.querySelector("aside")).toBeNull()
        const content = screen.getByText("Conteúdo").closest("main")!.parentElement!
        expect(content.className).toContain("pt-16")
        expect(content.getAttribute("style") ?? "").not.toContain("margin-left")
        // O painel maximizado (Integrações › Logs) usa esta marca para ocupar só a área abaixo do header.
        expect(screen.getByText("Conteúdo").closest("main")).toHaveAttribute("data-dashboard-content")
    })

    it("no catálogo dentro do Owlbear mostra só o conteúdo, também após navegar sem o parâmetro", async () => {
        nav.search = "owlbearCatalogEmbed=1"
        const { rerender } = render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>)
        expect(screen.queryByTestId("glass-header")).not.toBeInTheDocument()
        expect(screen.queryByTestId("glass-footer")).not.toBeInTheDocument()
        expect(screen.getByText("Conteúdo").closest("main")!.parentElement!.className).not.toContain("pt-16")

        nav.search = ""
        rerender(<DashboardLayout><p>Outra tela</p></DashboardLayout>)
        await waitFor(() => expect(screen.getByText("Outra tela")).toBeInTheDocument())
        expect(screen.queryByTestId("glass-header")).not.toBeInTheDocument()
        expect(screen.queryByTestId("glass-footer")).not.toBeInTheDocument()
    })

    describe("espaço do topo igual ao lateral", () => {
        const spacing = (className: string) => className.split(/\s+/).filter((name) => /^(?:[a-z]+:)?(?:p|px|py|pt|pb|m|mt|my|mb|top)-/.test(name))

        it("abaixo do header só a compensação da altura dele (pt-16 = h-16), sem outro espaço no caminho até o conteúdo", async () => {
            const { GLASS_HEADER_HEIGHT } = await vi.importActual<typeof import("@/components/ui/glass-header")>("@/components/ui/glass-header")
            expect(GLASS_HEADER_HEIGHT).toBe(64)
            render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>)
            const main = screen.getByText("Conteúdo").closest("main")!
            const wrapper = main.parentElement!
            expect(spacing(wrapper.className)).toEqual(["pt-16"])
            expect(spacing(wrapper.parentElement!.className)).toEqual([])
        })

        it("o <main> tem o mesmo padding nos quatro lados (p-4 / lg:p-6), sem topo próprio", () => {
            render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>)
            const main = screen.getByText("Conteúdo").closest("main")!
            expect(spacing(main.className).sort()).toEqual(["lg:p-6", "p-4"])
        })

        it("a entrada da página só esmaece, sem deslocamento vertical", async () => {
            expect(motionConfig.variants.fade.initial).toEqual({ opacity: 0 })
            const { readFileSync } = await import("node:fs")
            const { join } = await import("node:path")
            const source = readFileSync(join(process.cwd(), "src/app/(dashboard)/layout.tsx"), "utf8")
            expect(source).toContain("variants={motionConfig.variants.fade}")
            expect(source).not.toContain("fadeInUp")
        })

        it("'Visualizar como' fica no header e a faixa da simulação logo abaixo dele, antes do conteúdo", () => {
            render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>)
            expect(screen.getByTestId("glass-header")).toContainElement(screen.getByTestId("header-view-as"))
            const wrapper = screen.getByText("Conteúdo").closest("main")!.parentElement!
            expect(wrapper.firstElementChild).toBe(screen.getByTestId("view-as-banner"))
        })
    })
})
