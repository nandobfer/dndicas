/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GlobalFabGroup } from "@/features/dice-roller/components/global-fab-group"
import { FAB_ORDER_STORAGE_KEY } from "@/features/dice-roller/components/fab-order"
import { OWLBEAR_CATALOG_EMBED_STORAGE_KEY } from "@/features/owlbear/hooks/use-is-owlbear-catalog-embed"

const useIsOwlbearAvailableMock = vi.hoisted(() => vi.fn())
const opexEnabled = vi.hoisted(() => ({ value: true }))
const nav = vi.hoisted(() => ({ pathname: "/spells", search: "" }))
const diceClick = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(nav.search),
}))

vi.mock("@/features/owlbear/hooks/use-is-owlbear-available", () => ({
    useIsOwlbearAvailable: () => useIsOwlbearAvailableMock(),
}))

vi.mock("@/features/dice-roller/components/dice-roller-fab", () => ({
    DiceRollerFab: () => <button type="button" onClick={diceClick}>Dice FAB</button>,
}))

vi.mock("@/features/opex-agent/components/OpexFab", () => ({
    OpexFab: () => <button type="button">Opex FAB</button>,
    useOpexFabEnabled: () => opexEnabled.value,
}))

vi.mock("@/components/ui/global-search-fab", () => ({
    GlobalSearchFAB: ({ embedded }: { embedded?: boolean }) => (
        <div data-testid="global-search-fab" data-embedded={String(embedded)}>
            Search FAB
        </div>
    ),
}))

async function renderedOrder() {
    render(<GlobalFabGroup />)
    const group = await screen.findByTestId("global-fab-group")
    return Array.from(group.querySelectorAll("[data-fab-id]")).map((node) => node.getAttribute("data-fab-id"))
}

describe("GlobalFabGroup", () => {
    beforeEach(() => {
        useIsOwlbearAvailableMock.mockReturnValue(false)
        opexEnabled.value = true
        nav.pathname = "/spells"
        nav.search = ""
        window.localStorage.clear()
        window.sessionStorage.clear()
    })

    it("começa em Dados → Agente Opex → Busca, ancorado no canto inferior direito", async () => {
        expect(await renderedOrder()).toEqual(["dice", "opex", "search"])
        expect(screen.getByTestId("global-fab-group").className).toContain("fixed bottom-6 right-6")
        expect(screen.getByTestId("global-search-fab")).toHaveAttribute("data-embedded", "true")
    })

    it("respeita a ordem salva no navegador", async () => {
        window.localStorage.setItem(FAB_ORDER_STORAGE_KEY, JSON.stringify(["search", "opex", "dice"]))
        expect(await renderedOrder()).toEqual(["search", "opex", "dice"])
    })

    it("volta à ordem padrão com um valor salvo inválido ou antigo", async () => {
        window.localStorage.setItem(FAB_ORDER_STORAGE_KEY, JSON.stringify(["search", "chat", "dice"]))
        expect(await renderedOrder()).toEqual(["dice", "opex", "search"])
    })

    it("não reserva espaço para botões ocultos e mantém a ordem salva entre os demais", async () => {
        window.localStorage.setItem(FAB_ORDER_STORAGE_KEY, JSON.stringify(["search", "opex", "dice"]))
        nav.pathname = "/"
        expect(await renderedOrder()).toEqual(["opex", "dice"])
        expect(screen.queryByTestId("global-search-fab")).not.toBeInTheDocument()
    })

    it("esconde Dados quando o Owlbear está disponível", async () => {
        useIsOwlbearAvailableMock.mockReturnValue(true)
        expect(await renderedOrder()).toEqual(["opex", "search"])
    })

    it("esconde Dados no catálogo dentro do Owlbear, mesmo depois de navegar sem o parâmetro", async () => {
        nav.search = "owlbearCatalogEmbed=1"
        const { rerender } = render(<GlobalFabGroup />)
        await screen.findByTestId("global-fab-group")
        expect(screen.queryByRole("button", { name: "Dice FAB" })).not.toBeInTheDocument()
        expect(window.sessionStorage.getItem(OWLBEAR_CATALOG_EMBED_STORAGE_KEY)).toBe("1")

        nav.search = ""
        nav.pathname = "/spells/bola-de-fogo"
        rerender(<GlobalFabGroup />)
        await waitFor(() => expect(screen.getByTestId("global-search-fab")).toBeInTheDocument())
        expect(screen.queryByRole("button", { name: "Dice FAB" })).not.toBeInTheDocument()
    })

    it("lê a marca do embed guardada no iframe", async () => {
        window.sessionStorage.setItem(OWLBEAR_CATALOG_EMBED_STORAGE_KEY, "1")
        render(<GlobalFabGroup />)
        await waitFor(() => expect(screen.queryByRole("button", { name: "Dice FAB" })).not.toBeInTheDocument())
        expect(screen.getByRole("button", { name: "Opex FAB" })).toBeInTheDocument()
    })

    it("esconde o Agente Opex quando ele não está liberado", async () => {
        opexEnabled.value = false
        expect(await renderedOrder()).toEqual(["dice", "search"])
    })

    it("um clique simples abre o botão normalmente", async () => {
        render(<GlobalFabGroup />)
        fireEvent.click(await screen.findByRole("button", { name: "Dice FAB" }))
        expect(diceClick).toHaveBeenCalledTimes(1)
    })
})
