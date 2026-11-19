/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MasterTalkButton } from "@/features/maddox/components/game/MasterTalkButton"
import { MasterTalkIconButton, DeclareButton, PassTurnButton } from "@/features/maddox/components/game/composer-buttons"

const classesOf = (element: Element) => element.getAttribute("class")?.split(/\s+/) ?? []

describe("Conversar com o Mestre — borda premium de IA (DND-52/74)", () => {
    it("tem o anel gradiente azul/roxo animado do 'Entender com IA', no diâmetro dos outros botões do campo", () => {
        render(<MasterTalkIconButton onClick={() => undefined} />)
        const button = screen.getByRole("button", { name: "Conversar com o Mestre" })
        const ring = classesOf(button)
        for (const name of ["h-8", "w-8", "shrink-0", "rounded-full", "p-[1.5px]", "bg-gradient-to-r", "from-blue-500/20", "via-purple-500/20", "to-blue-500/20", "bg-[length:200%_auto]", "animate-gradient", "focus:ring-2", "focus:ring-blue-500/40"]) expect(ring).toContain(name)
        const inner = button.firstElementChild!
        expect(classesOf(inner)).toEqual(expect.arrayContaining(["h-full", "w-full", "rounded-full", "bg-black/40", "backdrop-blur-[4px]", "group-hover:bg-slate-900/40"]))
        expect(classesOf(inner.querySelector("svg")!)).toEqual(expect.arrayContaining(["text-blue-400", "group-hover:text-white"]))
    })

    it("com movimento reduzido, o anel não anima; desabilitado, fica apagado, parado e não dispara", () => {
        const onClick = vi.fn()
        render(<MasterTalkIconButton disabled onClick={onClick} />)
        const button = screen.getByRole("button", { name: "Conversar com o Mestre" })
        expect(classesOf(button)).toEqual(expect.arrayContaining(["motion-reduce:animate-none", "disabled:animate-none", "disabled:opacity-50", "disabled:pointer-events-none"]))
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(onClick).not.toHaveBeenCalled()
    })

    it("habilitado, dispara o clique; os outros botões do campo seguem sem o anel", () => {
        const onClick = vi.fn()
        render(
            <form>
                <MasterTalkIconButton onClick={onClick} />
                <PassTurnButton />
                <DeclareButton />
            </form>,
        )
        fireEvent.click(screen.getByRole("button", { name: "Conversar com o Mestre" }))
        expect(onClick).toHaveBeenCalledTimes(1)
        for (const name of ["Não fazer nada", "Declarar"]) expect(classesOf(screen.getByRole("button", { name }))).not.toContain("animate-gradient")
    })
})

describe("Conversar com o Mestre — popover (DND-74)", () => {
    it("abre com o título, o subtítulo fora da mesa e o contador; Enter envia o texto aparado e fecha", async () => {
        const onSend = vi.fn(async () => undefined)
        render(<MasterTalkButton blockReason={null} sending={false} onSend={onSend} />)
        fireEvent.click(screen.getByRole("button", { name: "Conversar com o Mestre" }))
        const popover = await screen.findByTestId("master-talk-popover")
        expect(popover).toHaveTextContent("Conversar com o Mestre")
        expect(screen.getByTestId("master-talk-subtitle")).toHaveTextContent("Fora da mesa: você fala com o mestre, não como o personagem.")
        const field = screen.getByRole("textbox", { name: "Mensagem para o mestre" })
        expect(screen.getByTestId("master-talk-send")).toBeDisabled()
        fireEvent.change(field, { target: { value: "  O que tem no chão?  " } })
        expect(screen.getByTestId("master-talk-counter")).toHaveTextContent("22/500")
        await act(async () => {
            fireEvent.keyDown(field, { key: "Enter" })
        })
        expect(onSend).toHaveBeenCalledWith("O que tem no chão?")
        await waitFor(() => expect(screen.queryByTestId("master-talk-popover")).toBeNull())
    })

    it("Shift+Enter não envia; acima de 500 caracteres o envio fica bloqueado e o contador avisa", async () => {
        const onSend = vi.fn(async () => undefined)
        render(<MasterTalkButton blockReason={null} sending={false} onSend={onSend} />)
        fireEvent.click(screen.getByRole("button", { name: "Conversar com o Mestre" }))
        const field = await screen.findByRole("textbox", { name: "Mensagem para o mestre" })
        fireEvent.change(field, { target: { value: "a".repeat(501) } })
        expect(screen.getByTestId("master-talk-send")).toBeDisabled()
        expect(screen.getByTestId("master-talk-counter")).toHaveClass("text-destructive")
        fireEvent.keyDown(field, { key: "Enter" })
        fireEvent.change(field, { target: { value: "Oi" } })
        fireEvent.keyDown(field, { key: "Enter", shiftKey: true })
        expect(onSend).not.toHaveBeenCalled()
    })

    it("aberto por fora (o atalho do combate) e bloqueado com o motivo quando não dá para conversar", async () => {
        const { rerender } = render(<MasterTalkButton blockReason={null} sending={false} onSend={vi.fn()} open onOpenChange={vi.fn()} />)
        expect(await screen.findByTestId("master-talk-popover")).toBeInTheDocument()
        rerender(<MasterTalkButton blockReason="A campanha não está em andamento." sending={false} onSend={vi.fn()} open onOpenChange={vi.fn()} />)
        await waitFor(() => expect(screen.queryByTestId("master-talk-popover")).toBeNull())
        const button = screen.getByRole("button", { name: "Conversar com o Mestre" })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute("title", "A campanha não está em andamento.")
    })
})
