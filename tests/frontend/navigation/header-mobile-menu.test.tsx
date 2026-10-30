/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { HeaderMobileMenu } from "@/components/ui/header-mobile-menu"
import { getVisibleNavigation, resolveActiveNav } from "@/lib/config/navigation"

vi.mock("next/image", () => ({
    default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))

function renderMenu(pathname: string, granted: string[] = [], isSignedIn = true) {
    const categories = getVisibleNavigation({ isSignedIn, can: (key) => granted.includes(key) })
    return render(<HeaderMobileMenu categories={categories} active={resolveActiveNav(pathname, categories)} pathname={pathname} />)
}

describe("HeaderMobileMenu", () => {
    it("abre o painel com Início e as categorias, com a seção da tela atual expandida", () => {
        renderMenu("/spells/bola-de-fogo")
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        const panel = within(screen.getByRole("dialog"))
        expect(panel.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/")
        expect(panel.getByRole("button", { name: "Fichas" })).toHaveAttribute("aria-expanded", "false")
        expect(panel.getByRole("button", { name: "Catálogo" })).toHaveAttribute("aria-expanded", "true")
        expect(panel.getByRole("link", { name: "Magias" })).toHaveAttribute("aria-current", "page")
        expect(panel.queryByRole("button", { name: "Administração" })).not.toBeInTheDocument()
    })

    it("expande e recolhe as seções", () => {
        renderMenu("/")
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        const panel = within(screen.getByRole("dialog"))
        expect(panel.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page")
        fireEvent.click(panel.getByRole("button", { name: "Fichas" }))
        expect(panel.getByRole("link", { name: "Meus NPCs" })).toHaveAttribute("href", "/my-npcs")
        fireEvent.click(panel.getByRole("button", { name: "Fichas" }))
        expect(panel.queryByRole("link", { name: "Meus NPCs" })).not.toBeInTheDocument()
    })

    it("fecha ao escolher um item", async () => {
        renderMenu("/", ["users.view"])
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Administração" }))
        fireEvent.click(screen.getByRole("link", { name: "Usuários" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("fecha no botão de fechar", async () => {
        renderMenu("/")
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        fireEvent.click(screen.getByRole("button", { name: "Fechar menu" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("fecha ao tocar fora", async () => {
        renderMenu("/")
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        // O Radix só passa a ouvir o toque fora no ciclo seguinte à abertura.
        await new Promise((done) => setTimeout(done, 0))
        fireEvent.pointerDown(screen.getByTestId("header-mobile-menu-backdrop"))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("fecha ao mudar de rota", async () => {
        const { rerender } = renderMenu("/")
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        const categories = getVisibleNavigation({ isSignedIn: true, can: () => false })
        rerender(<HeaderMobileMenu categories={categories} active={resolveActiveNav("/spells", categories)} pathname="/spells" />)
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })
})
