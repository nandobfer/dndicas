/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemberAvatar } from "@/features/maddox/components/campaigns/campaign-visuals"
import { MADDOX_PORTRAIT_HOVER_CLOSE_MS, MADDOX_PORTRAIT_HOVER_OPEN_MS } from "@/features/maddox/portrait-hover"
import { MADDOX_AVATAR_CONTEXT, npcAvatarContext } from "@/features/maddox/constants"
import { NpcPanel } from "@/features/maddox/components/game/NpcPanel"
import { JournalSearchResults } from "@/features/maddox/components/journal/JournalSearch"
import type { MaddoxJournalSearchDto } from "@/features/maddox/journal-types"

const mouse = { pointerType: "mouse" }
const avatar = (name: string) => screen.getByRole("button", { name: `Ver retrato de ${name}` })
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const hoverOpen = (name: string) => {
    fireEvent.pointerEnter(avatar(name), mouse)
    wait(MADDOX_PORTRAIT_HOVER_OPEN_MS + 10)
}

describe("MemberAvatar: popover e retrato grande (DND-55)", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it.each([
        ["Thalia", "https://cdn.example/thalia.png", "Jogador · Ana"],
        ["Grimbold", "https://cdn.example/grim.png", npcAvatarContext("dead")],
        ["Maddox", "https://cdn.example/maddox.png", MADDOX_AVATAR_CONTEXT.maddox],
        ["Vexa", "https://cdn.example/vexa.png", MADDOX_AVATAR_CONTEXT.opex],
    ])("hover em %s abre o popover com retrato, nome e contexto depois do atraso", (name, url, context) => {
        render(<MemberAvatar name={name} imageUrl={url} color="#a855f7" context={context} />)
        fireEvent.pointerEnter(avatar(name), mouse)
        wait(MADDOX_PORTRAIT_HOVER_OPEN_MS - 50)
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
        wait(60)
        const popover = screen.getByTestId("member-portrait-popover")
        expect(popover).toHaveTextContent(name)
        expect(popover).toHaveTextContent(context)
        expect(screen.getByTestId("member-portrait-image")).toHaveAttribute("src", url)
    })

    it("passar pelo avatar sem parar não abre o popover", () => {
        render(<MemberAvatar name="Thalia" imageUrl={null} />)
        fireEvent.pointerEnter(avatar("Thalia"), mouse)
        wait(50)
        fireEvent.pointerLeave(avatar("Thalia"), mouse)
        wait(MADDOX_PORTRAIT_HOVER_OPEN_MS * 2)
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
    })

    it("entrar no popover antes de sair do avatar mantém aberto; sair do popover fecha após o atraso", () => {
        render(<MemberAvatar name="Thalia" imageUrl={null} context="Jogador" />)
        hoverOpen("Thalia")
        const popover = screen.getByTestId("member-portrait-popover")
        fireEvent.pointerEnter(popover, mouse)
        fireEvent.pointerLeave(avatar("Thalia"), mouse)
        wait(MADDOX_PORTRAIT_HOVER_CLOSE_MS * 3)
        expect(screen.getByTestId("member-portrait-popover")).toBeInTheDocument()

        fireEvent.pointerLeave(screen.getByTestId("member-portrait-popover"), mouse)
        wait(MADDOX_PORTRAIT_HOVER_CLOSE_MS + 10)
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
    })

    it("sair do avatar para fora fecha o popover após a tolerância", () => {
        render(<MemberAvatar name="Thalia" imageUrl={null} />)
        hoverOpen("Thalia")
        fireEvent.pointerLeave(avatar("Thalia"), mouse)
        wait(MADDOX_PORTRAIT_HOVER_CLOSE_MS - 50)
        expect(screen.getByTestId("member-portrait-popover")).toBeInTheDocument()
        wait(60)
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
    })

    it("rolar a página fecha o popover", () => {
        render(<MemberAvatar name="Thalia" imageUrl={null} />)
        hoverOpen("Thalia")
        act(() => {
            window.dispatchEvent(new Event("scroll"))
        })
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
    })

    it("toque não abre o popover; o clique abre o retrato grande", () => {
        render(<MemberAvatar name="Thalia" imageUrl="https://cdn.example/thalia.png" context="Jogador" />)
        fireEvent.pointerEnter(avatar("Thalia"), { pointerType: "touch" })
        wait(MADDOX_PORTRAIT_HOVER_OPEN_MS * 2)
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
        fireEvent.click(avatar("Thalia"))
        expect(screen.getByRole("dialog", { name: "Retrato de Thalia" })).toBeInTheDocument()
    })

    it("clique abre o retrato grande com nome e contexto e fecha o popover aberto", () => {
        render(<MemberAvatar name="Thalia" imageUrl="https://cdn.example/thalia.png" context="Jogador · Ana" />)
        hoverOpen("Thalia")
        fireEvent.click(avatar("Thalia"))
        expect(screen.queryByTestId("member-portrait-popover")).not.toBeInTheDocument()
        const viewer = screen.getByTestId("member-portrait-viewer")
        expect(viewer).toHaveTextContent("Thalia")
        expect(viewer).toHaveTextContent("Jogador · Ana")
        expect(viewer.querySelector("img")).toHaveAttribute("src", "https://cdn.example/thalia.png")
        expect(viewer.querySelector("img")?.className).toContain("object-contain")
    })

    it.each([
        ["X", () => fireEvent.click(screen.getByRole("button", { name: "Fechar retrato" }))],
        ["Esc", () => fireEvent.keyDown(screen.getByTestId("member-portrait-viewer"), { key: "Escape" })],
        ["Enter", () => fireEvent.keyDown(screen.getByTestId("member-portrait-viewer"), { key: "Enter" })],
        ["clique fora", () => fireEvent.click(screen.getByTestId("member-portrait-viewer"))],
    ])("%s fecha o retrato grande", (_label, close) => {
        render(<MemberAvatar name="Thalia" imageUrl="https://cdn.example/thalia.png" />)
        fireEvent.click(avatar("Thalia"))
        expect(screen.getByTestId("member-portrait-viewer")).toBeInTheDocument()
        close()
        expect(screen.queryByTestId("member-portrait-viewer")).not.toBeInTheDocument()
    })

    it("clicar no retrato dentro do diálogo não fecha", () => {
        render(<MemberAvatar name="Thalia" imageUrl="https://cdn.example/thalia.png" />)
        fireEvent.click(avatar("Thalia"))
        fireEvent.click(screen.getByTestId("member-portrait-image"))
        expect(screen.getByTestId("member-portrait-viewer")).toBeInTheDocument()
    })

    it("é um botão nativo focável: Enter e Espaço abrem o retrato grande", () => {
        render(<MemberAvatar name="Thalia" imageUrl={null} />)
        const button = avatar("Thalia")
        expect(button.tagName).toBe("BUTTON")
        expect(button).toHaveAttribute("type", "button")
        expect(button).not.toBeDisabled()
        expect(button).toHaveAttribute("aria-haspopup", "dialog")
        button.focus()
        expect(document.activeElement).toBe(button)
        // Botão nativo: o navegador transforma Enter/Espaço em clique; o happy-dom não, então o clique é o do teclado.
        fireEvent.keyDown(button, { key: "Enter" })
        fireEvent.click(button)
        expect(screen.getByTestId("member-portrait-viewer")).toBeInTheDocument()
    })

    it("sem retrato: popover e retrato grande mostram as iniciais e o aviso, nunca vazio", () => {
        render(<MemberAvatar name="Ana Lúcia" imageUrl={null} context="Jogador" />)
        hoverOpen("Ana Lúcia")
        const popover = screen.getByTestId("member-portrait-popover")
        expect(popover).toHaveTextContent("AL")
        expect(popover).toHaveTextContent("Sem retrato")
        fireEvent.click(avatar("Ana Lúcia"))
        const viewer = screen.getByTestId("member-portrait-viewer")
        expect(viewer.querySelector("img")).toBeNull()
        expect(viewer).toHaveTextContent("AL")
        expect(viewer).toHaveTextContent("Sem retrato")
    })

    it("imagem que não carrega cai nas iniciais no retrato grande", () => {
        render(<MemberAvatar name="Thalia" imageUrl="https://cdn.example/sumiu.png" />)
        fireEvent.click(avatar("Thalia"))
        fireEvent.error(screen.getByTestId("member-portrait-image"))
        expect(screen.getByTestId("member-portrait-viewer")).toHaveTextContent("Sem retrato")
    })

    it("o clique não chega ao pai nem navega o link em volta", () => {
        const parentClick = vi.fn()
        render(
            <div onClick={parentClick}>
                <MemberAvatar name="Thalia" imageUrl={null} />
            </div>,
        )
        const event = new MouseEvent("click", { bubbles: true, cancelable: true })
        act(() => {
            avatar("Thalia").dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(true)
        expect(parentClick).not.toHaveBeenCalled()
        // Cliques dentro do retrato grande (portal) também não sobem pela árvore do React até o pai.
        fireEvent.click(screen.getByTestId("member-portrait-initials"))
        expect(parentClick).not.toHaveBeenCalled()
    })

    it("preserva o className (tamanho e grayscale) e o modo estático sem botão", () => {
        const { rerender } = render(<MemberAvatar name="Grimbold" imageUrl={null} className="h-9 w-9 grayscale" />)
        expect(avatar("Grimbold").className).toContain("grayscale")
        expect(avatar("Grimbold").className).toContain("h-9")
        rerender(<MemberAvatar name="Grimbold" imageUrl={null} interactive={false} />)
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
        expect(screen.getByText("G")).toBeInTheDocument()
    })
})

describe("avatares fora dos links (DND-55)", () => {
    const empty = { items: [], hasMore: false }

    it("painel de NPCs: o avatar não fica dentro do link; o clique abre o retrato e o nome continua indo ao diário", () => {
        render(<NpcPanel campaignId="c1" color="#a855f7" npcs={[{ id: "n1", name: "Grimbold", portraitUrl: "https://cdn.example/grim.png", status: "dead" }]} />)
        const button = avatar("Grimbold")
        expect(button.closest("a")).toBeNull()
        expect(button.className).toContain("grayscale")
        const link = screen.getByRole("link", { name: /Grimbold/ })
        expect(link).toHaveAttribute("href", expect.stringContaining("/campanhas/c1/diario"))
        expect(link).not.toContainElement(button)
        fireEvent.click(button)
        const viewer = screen.getByTestId("member-portrait-viewer")
        expect(viewer).toHaveTextContent("NPC · Morto")
    })

    it("busca do diário: o avatar do NPC fica fora do link do resultado e abre o retrato sem navegar", () => {
        const onNavigate = vi.fn()
        const result: MaddoxJournalSearchDto = {
            query: "grim",
            npcs: { items: [{ id: "n1", name: "Grimbold", portraitUrl: null, status: "active", excerpt: "ferreiro" }], hasMore: false },
            memories: empty,
            messages: empty,
            party: empty,
            images: empty,
            state: null,
        }
        render(<JournalSearchResults campaignId="c1" color="#a855f7" result={result} onNavigate={onNavigate} />)
        const button = avatar("Grimbold")
        expect(button.closest("a")).toBeNull()
        fireEvent.click(button)
        expect(onNavigate).not.toHaveBeenCalled()
        expect(screen.getByTestId("member-portrait-viewer")).toHaveTextContent("Sem retrato")
        expect(screen.getByTestId("journal-search-hit")).toHaveAttribute("href", expect.stringContaining("npc"))
    })
})
