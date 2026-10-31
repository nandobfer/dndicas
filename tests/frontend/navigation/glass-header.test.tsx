/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GlassHeader } from "@/components/ui/glass-header"
import { CATEGORY_CLOSE_DELAY_MS, PANEL_VIEWPORT_MARGIN, anchorPanelLeft } from "@/components/ui/header-category-menu"

let pathname = "/"
let signedIn = true
let granted: string[] = []

vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
    useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("next/image", () => ({
    default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({
        isLoaded: true,
        isSignedIn: signedIn,
        can: (key: string) => granted.includes("*") || granted.includes(key),
        fullName: signedIn ? "Nando Burgos" : null,
        email: signedIn ? "nando@example.com" : null,
        imageUrl: null,
        signOut: vi.fn(),
    }),
}))

const desktop = () => within(screen.getByTestId("header-desktop-nav"))
const mouse = { pointerType: "mouse" }

describe("GlassHeader (desktop)", () => {
    beforeEach(() => {
        pathname = "/"
        signedIn = true
        granted = []
    })

    it("mostra o logo como link para o Início e Início como link direto", () => {
        render(<GlassHeader />)
        expect(screen.getByRole("link", { name: "Dungeons & Dicas: Início" })).toHaveAttribute("href", "/")
        expect(desktop().getByRole("link", { name: "Início" })).toHaveAttribute("href", "/")
        expect(desktop().getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page")
    })

    it("ações extras (ex.: 'Visualizar como') entram à direita, antes do usuário", () => {
        render(<GlassHeader actions={<button type="button">Visualizar como</button>} />)
        const action = screen.getByRole("button", { name: "Visualizar como" })
        const right = action.parentElement!
        expect(right.className).toContain("ml-auto")
        expect(right.firstElementChild).toBe(action)
    })

    it("não tem sidebar nem drawer lateral", () => {
        const { container } = render(<GlassHeader />)
        expect(container.querySelector("aside")).toBeNull()
    })

    it("esconde Campanhas e Administração de quem não tem permissão", () => {
        render(<GlassHeader />)
        expect(desktop().getByRole("button", { name: "Fichas" })).toBeInTheDocument()
        expect(desktop().getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(desktop().queryByRole("button", { name: "Campanhas" })).not.toBeInTheDocument()
        expect(desktop().queryByRole("button", { name: "Administração" })).not.toBeInTheDocument()
    })

    it("mostra Campanhas Maddox com maddox.play e acompanha a troca de permissões", () => {
        const { rerender } = render(<GlassHeader />)
        expect(desktop().queryByRole("button", { name: "Campanhas" })).not.toBeInTheDocument()
        granted = ["maddox.play", "audit.view"]
        rerender(<GlassHeader />)
        fireEvent.click(desktop().getByRole("button", { name: "Campanhas" }))
        expect(desktop().getByRole("link", { name: "Campanhas Maddox" })).toHaveAttribute("href", "/campanhas")
        fireEvent.click(desktop().getByRole("button", { name: "Administração" }))
        expect(within(desktop().getByRole("region")).getAllByRole("link").map((link) => link.textContent)).toEqual(["Logs"])
    })

    it("abre o container no hover do mouse com os itens na ordem", () => {
        render(<GlassHeader />)
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), mouse)
        const region = desktop().getByRole("region", { name: "Catálogo" })
        expect(within(region).getAllByRole("link").map((link) => link.textContent)).toEqual([
            "Classes", "Raças", "Origens", "Regras", "Habilidades", "Talentos", "Magias", "Itens", "Monstros",
        ])
        expect(desktop().getByRole("button", { name: "Catálogo" })).toHaveAttribute("aria-expanded", "true")
    })

    it("não abre no hover do toque (o toque usa o clique)", () => {
        render(<GlassHeader />)
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), { pointerType: "touch" })
        expect(desktop().queryByRole("region")).not.toBeInTheDocument()
    })

    it("alterna no clique", async () => {
        render(<GlassHeader />)
        const trigger = desktop().getByRole("button", { name: "Fichas" })
        fireEvent.click(trigger)
        expect(desktop().getByRole("region", { name: "Fichas" })).toBeInTheDocument()
        fireEvent.click(trigger)
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
    })

    it("fecha com Esc e devolve o foco à categoria", async () => {
        render(<GlassHeader />)
        const trigger = desktop().getByRole("button", { name: "Fichas" })
        fireEvent.click(trigger)
        const item = desktop().getByRole("link", { name: "Minhas Fichas" })
        item.focus()
        fireEvent.keyDown(item, { key: "Escape" })
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
        expect(trigger).toHaveFocus()
    })

    it("fecha com Esc o container aberto só pelo hover, sem foco no menu", async () => {
        render(<GlassHeader />)
        const trigger = desktop().getByRole("button", { name: "Catálogo" })
        fireEvent.pointerEnter(trigger, mouse)
        expect(desktop().getByRole("region", { name: "Catálogo" })).toBeInTheDocument()
        expect(document.activeElement).toBe(document.body)
        fireEvent.keyDown(document.body, { key: "Escape" })
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
        expect(trigger).not.toHaveFocus()
    })

    it("com mouse, clicar depois do hover mantém o container aberto", () => {
        render(<GlassHeader />)
        const trigger = desktop().getByRole("button", { name: "Catálogo" })
        fireEvent.pointerEnter(trigger, mouse)
        fireEvent.pointerDown(trigger, mouse)
        fireEvent.click(trigger)
        expect(desktop().getByRole("region", { name: "Catálogo" })).toBeInTheDocument()
        fireEvent.pointerDown(trigger, mouse)
        fireEvent.click(trigger)
        expect(desktop().getByRole("region", { name: "Catálogo" })).toBeInTheDocument()
    })

    it("no toque, o clique abre e fecha", async () => {
        render(<GlassHeader />)
        const trigger = desktop().getByRole("button", { name: "Catálogo" })
        fireEvent.pointerDown(trigger, { pointerType: "touch" })
        fireEvent.click(trigger)
        expect(desktop().getByRole("region", { name: "Catálogo" })).toBeInTheDocument()
        fireEvent.pointerDown(trigger, { pointerType: "touch" })
        fireEvent.click(trigger)
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
    })

    it("fecha ao clicar fora e ao escolher um item", async () => {
        render(<GlassHeader />)
        fireEvent.click(desktop().getByRole("button", { name: "Fichas" }))
        fireEvent.mouseDown(document.body)
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())

        fireEvent.click(desktop().getByRole("button", { name: "Fichas" }))
        fireEvent.click(desktop().getByRole("link", { name: "Meus NPCs" }))
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
    })

    it("não fecha ao ir do botão ao container, e troca de categoria sem fechar", () => {
        vi.useFakeTimers()
        try {
            render(<GlassHeader />)
            const fichas = desktop().getByRole("button", { name: "Fichas" })
            fireEvent.pointerEnter(fichas, mouse)
            fireEvent.pointerLeave(fichas.parentElement!, mouse)
            fireEvent.pointerEnter(fichas.parentElement!, mouse)
            act(() => vi.advanceTimersByTime(CATEGORY_CLOSE_DELAY_MS * 2))
            expect(desktop().getByRole("region", { name: "Fichas" })).toBeInTheDocument()

            fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), mouse)
            expect(desktop().getAllByRole("region")).toHaveLength(1)
            expect(desktop().getByRole("region", { name: "Catálogo" })).toBeInTheDocument()

            fireEvent.pointerLeave(fichas.parentElement!, mouse)
            act(() => vi.advanceTimersByTime(CATEGORY_CLOSE_DELAY_MS + 10))
        } finally {
            vi.useRealTimers()
        }
    })

    it("abre pelo teclado e percorre os itens com as setas", () => {
        render(<GlassHeader />)
        fireEvent.keyDown(desktop().getByRole("button", { name: "Catálogo" }), { key: "ArrowDown" })
        expect(desktop().getByRole("link", { name: "Classes" })).toHaveFocus()
        fireEvent.keyDown(desktop().getByRole("link", { name: "Classes" }), { key: "ArrowDown" })
        expect(desktop().getByRole("link", { name: "Raças" })).toHaveFocus()
        fireEvent.keyDown(desktop().getByRole("link", { name: "Raças" }), { key: "End" })
        expect(desktop().getByRole("link", { name: "Monstros" })).toHaveFocus()
        fireEvent.keyDown(desktop().getByRole("link", { name: "Monstros" }), { key: "ArrowDown" })
        expect(desktop().getByRole("link", { name: "Classes" })).toHaveFocus()
    })

    it("destaca a categoria e o item da subtela atual", () => {
        pathname = "/spells/bola-de-fogo"
        render(<GlassHeader />)
        const catalogo = desktop().getByRole("button", { name: "Catálogo" })
        expect(catalogo).toHaveAttribute("data-active", "true")
        expect(catalogo.className).toContain("bg-white/15")
        expect(desktop().getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current")
        fireEvent.click(catalogo)
        expect(desktop().getByRole("link", { name: "Magias" })).toHaveAttribute("aria-current", "page")
        expect(desktop().getByRole("link", { name: "Classes" })).not.toHaveAttribute("aria-current")
    })

    it("destaca Fichas › Minhas Fichas na ficha aberta pelo admin", () => {
        pathname = "/sheets/abc"
        granted = ["*"]
        render(<GlassHeader />)
        expect(desktop().getByRole("button", { name: "Fichas" })).toHaveAttribute("data-active", "true")
        expect(desktop().getByRole("button", { name: "Administração" })).not.toHaveAttribute("data-active")
    })

    it("destaca Administração › Integrações nas subtelas", () => {
        pathname = "/integracoes/ia/openai"
        granted = ["integrations.access"]
        render(<GlassHeader />)
        fireEvent.click(desktop().getByRole("button", { name: "Administração" }))
        expect(desktop().getByRole("link", { name: "Integrações" })).toHaveAttribute("aria-current", "page")
    })

    it("fecha o container ao mudar de rota", async () => {
        const { rerender } = render(<GlassHeader />)
        fireEvent.click(desktop().getByRole("button", { name: "Fichas" }))
        pathname = "/my-sheets"
        rerender(<GlassHeader />)
        await waitFor(() => expect(desktop().queryByRole("region")).not.toBeInTheDocument())
    })

    it("mostra ao visitante só Fichas e Catálogo e o botão Entrar / Cadastrar", () => {
        signedIn = false
        render(<GlassHeader />)
        expect(desktop().getAllByRole("button").map((button) => button.textContent)).toEqual(["Fichas", "Catálogo"])
        fireEvent.click(desktop().getByRole("button", { name: "Fichas" }))
        expect(within(desktop().getByRole("region")).getAllByRole("link").map((link) => link.textContent)).toEqual(["Minhas Fichas"])
        expect(screen.getByRole("link", { name: "Entrar / Cadastrar" })).toHaveAttribute("href", "/sign-in")
    })
})

describe("GlassHeader › espaçamento e alinhamento", () => {
    beforeEach(() => {
        pathname = "/"
        signedIn = true
        granted = []
    })

    it("usa o mesmo espaçamento (10px) nos quatro lados da barra", () => {
        render(<GlassHeader />)
        const classes = screen.getByTestId("glass-header-bar").className.split(/\s+/)
        expect(classes).toContain("p-2.5")
        expect(classes.filter((name) => /^(?:[a-z]+:)?p[xytrbl]?-/.test(name))).toEqual(["p-2.5"])
        expect(screen.getByRole("banner").className).toContain("h-16")
        expect(screen.getByRole("banner")).toHaveAttribute("data-app-header")
    })

    it("alinha a navegação à esquerda, logo após o logo, e leva o usuário para a direita", () => {
        render(<GlassHeader />)
        const start = screen.getByTestId("header-start")
        const nav = screen.getByTestId("header-desktop-nav")
        expect(start.firstElementChild).toBe(screen.getByRole("link", { name: "Dungeons & Dicas: Início" }))
        expect(start.children[1]).toBe(nav)
        expect(nav.className).not.toMatch(/justify-center|flex-1/)
        expect(screen.getByTestId("glass-header-bar").className).not.toContain("justify-between")
        expect(screen.getByTestId("header-mobile-nav").parentElement!.className).toContain("ml-auto")
    })
})

describe("GlassHeader › container ancorado na categoria", () => {
    const original = Element.prototype.getBoundingClientRect
    let positions: Record<string, number>

    const rect = (left: number, width: number) =>
        ({ left, right: left + width, top: 0, bottom: 40, width, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect

    beforeEach(() => {
        pathname = "/"
        signedIn = true
        granted = ["*"]
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
        positions = { root: 100, Fichas: 180, Campanhas: 260, "Catálogo": 380, "Administração": 480 }
        Element.prototype.getBoundingClientRect = function (this: Element) {
            if (this.getAttribute("aria-haspopup") === "true") return rect(positions[this.textContent ?? ""] ?? 0, 90)
            if (this.querySelector?.('[aria-haspopup="true"]') && this.parentElement?.getAttribute("data-testid") === "header-desktop-nav") return rect(positions.root, 600)
            return original.call(this)
        }
    })

    afterEach(() => {
        Element.prototype.getBoundingClientRect = original
    })

    const panel = () => desktop().getByRole("region")

    it("alinha a borda esquerda do container com a da categoria aberta", () => {
        render(<GlassHeader />)
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), mouse)
        expect(panel().style.left).toBe("280px")
        expect(panel().className).not.toMatch(/left-1\/2|-translate-x-1\/2/)
    })

    it("ao trocar de categoria, reposiciona o mesmo container sob a nova", () => {
        render(<GlassHeader />)
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), mouse)
        const first = panel()
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Fichas" }), mouse)
        expect(desktop().getAllByRole("region")).toHaveLength(1)
        expect(panel()).toBe(first)
        expect(panel().style.left).toBe("80px")
    })

    it("não deixa o container passar da borda direita da janela", () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 })
        render(<GlassHeader />)
        // Catálogo tem 9 itens (container de 440px): 800 - 10 - 440 - 100 = 250.
        fireEvent.pointerEnter(desktop().getByRole("button", { name: "Catálogo" }), mouse)
        expect(panel().style.left).toBe("250px")
    })
})

describe("anchorPanelLeft", () => {
    it("alinha à categoria quando cabe e respeita as bordas da janela", () => {
        expect(anchorPanelLeft({ left: 100 }, { left: 260 }, 260, 1280)).toBe(160)
        expect(anchorPanelLeft({ left: 100 }, { left: 900 }, 440, 1280)).toBe(1280 - PANEL_VIEWPORT_MARGIN - 440 - 100)
        expect(anchorPanelLeft({ left: 100 }, { left: 0 }, 260, 1280)).toBe(PANEL_VIEWPORT_MARGIN - 100)
    })
})
