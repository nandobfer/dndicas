/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HeaderUserMenu } from "@/components/ui/header-user-menu"
import { APP_VERSION } from "@/lib/config/version"

const replace = vi.fn()
const refresh = vi.fn()
const signOut = vi.fn()
let auth: { isLoaded: boolean; isSignedIn: boolean; fullName: string | null; email: string | null; imageUrl: string | null }

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace, refresh }),
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({ ...auth, can: () => false, signOut }),
}))

function openMenu() {
    const trigger = screen.getByRole("button", { name: /Menu do usuário/ })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
    return trigger
}

describe("HeaderUserMenu", () => {
    beforeEach(() => {
        auth = { isLoaded: true, isSignedIn: true, fullName: "Nando Burgos", email: "nando@example.com", imageUrl: "https://example.com/a.png" }
    })

    it("mostra avatar, nome e versão (detalhes só a partir de lg)", () => {
        render(<HeaderUserMenu />)
        expect(screen.getByRole("img", { name: "Nando Burgos" })).toHaveAttribute("src", "https://example.com/a.png")
        const details = screen.getByTestId("header-user-details")
        expect(details).toHaveTextContent("Nando Burgos")
        expect(details).toHaveTextContent(APP_VERSION)
        expect(details.className).toContain("hidden")
        expect(details.className).toContain("lg:flex")
    })

    it("usa o e-mail e depois \"Usuário\" quando falta o nome, e o ícone sem foto", () => {
        auth = { ...auth, fullName: null, imageUrl: null }
        const { rerender } = render(<HeaderUserMenu />)
        expect(screen.getByTestId("header-user-details")).toHaveTextContent("nando@example.com")
        expect(screen.queryByRole("img")).not.toBeInTheDocument()
        auth = { ...auth, email: null }
        rerender(<HeaderUserMenu />)
        expect(screen.getByTestId("header-user-details")).toHaveTextContent("Usuário")
    })

    it("abre o menu com Perfil, Feedback e Sair, nesta ordem", async () => {
        render(<HeaderUserMenu />)
        openMenu()
        const items = await screen.findAllByRole("menuitem")
        expect(items.map((item) => item.textContent)).toEqual(["Perfil", "Feedback", "Sair"])
        expect(items[0]).toHaveAttribute("href", "/profile")
        expect(items[1]).toHaveAttribute("href", "/feedback")
    })

    it("sai mostrando \"Saindo...\" e volta ao login", async () => {
        let resolve: () => void = () => {}
        signOut.mockReturnValue(new Promise<void>((done) => (resolve = done)))
        render(<HeaderUserMenu />)
        openMenu()
        fireEvent.click(await screen.findByRole("menuitem", { name: "Sair" }))
        expect(await screen.findByRole("menuitem", { name: "Saindo..." })).toHaveAttribute("data-disabled")
        expect(signOut).toHaveBeenCalledWith("/sign-in")
        resolve()
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"))
        expect(refresh).toHaveBeenCalled()
    })

    it("mostra ao visitante \"Entrar / Cadastrar\" (só o ícone no mobile), sem menu", () => {
        auth = { isLoaded: true, isSignedIn: false, fullName: null, email: null, imageUrl: null }
        render(<HeaderUserMenu />)
        const link = screen.getByRole("link", { name: "Entrar / Cadastrar" })
        expect(link).toHaveAttribute("href", "/sign-in")
        expect(screen.getByText("Entrar / Cadastrar").className).toContain("hidden lg:inline")
        expect(screen.queryByRole("button", { name: /Menu do usuário/ })).not.toBeInTheDocument()
    })
})
