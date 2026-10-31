/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createPortal } from "react-dom"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GlobalFabGroup } from "@/features/dice-roller/components/global-fab-group"
import { FAB_ORDER_STORAGE_KEY } from "@/features/dice-roller/components/fab-order"
import { OWLBEAR_CATALOG_EMBED_STORAGE_KEY } from "@/features/owlbear/hooks/use-is-owlbear-catalog-embed"

const useIsOwlbearAvailableMock = vi.hoisted(() => vi.fn())
const opexEnabled = vi.hoisted(() => ({ value: true }))
const nav = vi.hoisted(() => ({ pathname: "/spells", search: "" }))
const diceClick = vi.hoisted(() => vi.fn())
const opexChatOpen = vi.hoisted(() => ({ value: false }))

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
    // Como o real: o chat abre num portal fora do grupo na DOM.
    OpexFab: () => (
        <>
            <button type="button">Opex FAB</button>
            {opexChatOpen.value && createPortal(<div data-testid="opex-chat">Mensagem do chat</div>, document.body)}
        </>
    ),
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

describe("GlobalFabGroup › arraste", () => {
    const SIZE = 50
    const GAP = 10
    let restoreRect: () => void

    /** Linha: Dados 0–50, Opex 60–110, Busca 120–170 (posições fixas da montagem). */
    function layoutRow() {
        const original = Element.prototype.getBoundingClientRect
        const slots: Record<string, number> = {}
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const make = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: SIZE, width, height: SIZE, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
            if (this.getAttribute("data-testid") === "global-fab-group") {
                const count = this.querySelectorAll("[data-fab-id]").length
                return make(0, count * SIZE + (count - 1) * GAP)
            }
            const fab = this.closest("[data-fab-id]")
            if (fab) {
                const id = fab.getAttribute("data-fab-id")!
                if (!(id in slots)) {
                    const all = Array.from(fab.parentElement!.querySelectorAll("[data-fab-id]"))
                    slots[id] = all.indexOf(fab) * (SIZE + GAP)
                }
                return make(slots[id], SIZE)
            }
            return original.call(this)
        }
        return () => {
            Element.prototype.getBoundingClientRect = original
        }
    }

    const center = (index: number) => index * (SIZE + GAP) + SIZE / 2

    async function drag(from: Element, to: { x: number; y: number }, start: { x: number; y: number }, clickAfter = false) {
        fireEvent.mouseDown(from, { button: 0, clientX: start.x, clientY: start.y })
        await act(async () => {
            fireEvent.mouseMove(document, { clientX: start.x + 10, clientY: start.y })
        })
        await act(async () => {
            fireEvent.mouseMove(document, { clientX: to.x, clientY: to.y })
        })
        await act(async () => {
            fireEvent.mouseUp(document, { clientX: to.x, clientY: to.y })
            // Como no navegador: o clique vem logo após o mouseup, na mesma tarefa.
            if (clickAfter) fireEvent.click(from)
        })
    }

    const savedOrder = () => JSON.parse(window.localStorage.getItem(FAB_ORDER_STORAGE_KEY) ?? "null")

    beforeEach(() => {
        useIsOwlbearAvailableMock.mockReturnValue(false)
        opexEnabled.value = true
        opexChatOpen.value = false
        nav.pathname = "/spells"
        nav.search = ""
        window.localStorage.clear()
        window.sessionStorage.clear()
        restoreRect = layoutRow()
    })

    afterEach(() => restoreRect())

    it("reordena ao soltar sobre outro botão da linha e salva a ordem", async () => {
        render(<GlobalFabGroup />)
        const search = await screen.findByTestId("global-search-fab")
        await drag(search, { x: center(0), y: 25 }, { x: center(2), y: 25 })
        await waitFor(() => expect(savedOrder()).toEqual(["search", "dice", "opex"]))
        const group = screen.getByTestId("global-fab-group")
        expect(Array.from(group.querySelectorAll("[data-fab-id]")).map((node) => node.getAttribute("data-fab-id"))).toEqual(["search", "dice", "opex"])
    })

    it("solto fora da linha, volta à posição de onde saiu e não muda a ordem salva", async () => {
        window.localStorage.setItem(FAB_ORDER_STORAGE_KEY, JSON.stringify(["dice", "opex", "search"]))
        render(<GlobalFabGroup />)
        const search = await screen.findByTestId("global-search-fab")
        await drag(search, { x: -600, y: -400 }, { x: center(2), y: 25 })
        expect(savedOrder()).toEqual(["dice", "opex", "search"])
        const group = screen.getByTestId("global-fab-group")
        expect(Array.from(group.querySelectorAll("[data-fab-id]")).map((node) => node.getAttribute("data-fab-id"))).toEqual(["dice", "opex", "search"])
    })

    it("o clique que encerra um arraste não abre o botão", async () => {
        render(<GlobalFabGroup />)
        const dice = await screen.findByRole("button", { name: "Dice FAB" })
        await drag(dice, { x: center(2), y: 25 }, { x: center(0), y: 25 }, true)
        expect(diceClick).not.toHaveBeenCalled()
        // O próximo clique simples volta a abrir (o dnd-kit também barra cliques por 50ms após soltar).
        await new Promise((done) => setTimeout(done, 80))
        fireEvent.click(dice)
        expect(diceClick).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(savedOrder()).toEqual(["opex", "search", "dice"]))
    })

    it("selecionar texto no chat do Opex (portal) não arrasta o botão", async () => {
        opexChatOpen.value = true
        render(<GlobalFabGroup />)
        const chat = await screen.findByTestId("opex-chat")
        expect(screen.getByTestId("global-fab-group").contains(chat)).toBe(false)
        await drag(chat, { x: center(0), y: 25 }, { x: center(1), y: 25 })
        expect(savedOrder()).toBeNull()
        const opex = screen.getByTestId("global-fab-group").querySelector('[data-fab-id="opex"]') as HTMLElement
        expect(opex.style.transform).toBe("")
    })
})
