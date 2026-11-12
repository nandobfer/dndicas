/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AskMasterButton, DeclareButton, PassTurnButton } from "@/features/maddox/components/game/composer-buttons"

const classesOf = (element: Element) => element.getAttribute("class")?.split(/\s+/) ?? []

describe("Perguntar ao mestre — borda premium de IA (DND-52)", () => {
    it("tem o anel gradiente azul/roxo animado do 'Entender com IA', no diâmetro dos outros botões do campo", () => {
        render(<AskMasterButton onClick={() => undefined} />)
        const button = screen.getByRole("button", { name: "Perguntar ao mestre" })
        const ring = classesOf(button)
        for (const name of ["h-8", "w-8", "shrink-0", "rounded-full", "p-[1.5px]", "bg-gradient-to-r", "from-blue-500/20", "via-purple-500/20", "to-blue-500/20", "bg-[length:200%_auto]", "animate-gradient", "focus:ring-2", "focus:ring-blue-500/40"]) expect(ring).toContain(name)
        const inner = button.firstElementChild!
        expect(classesOf(inner)).toEqual(expect.arrayContaining(["h-full", "w-full", "rounded-full", "bg-black/40", "backdrop-blur-[4px]", "group-hover:bg-slate-900/40"]))
        expect(classesOf(inner.querySelector("svg")!)).toEqual(expect.arrayContaining(["text-blue-400", "group-hover:text-white"]))
    })

    it("com movimento reduzido, o anel não anima; desabilitado, fica apagado, parado e não dispara", () => {
        const onClick = vi.fn()
        render(<AskMasterButton disabled onClick={onClick} />)
        const button = screen.getByRole("button", { name: "Perguntar ao mestre" })
        expect(classesOf(button)).toEqual(expect.arrayContaining(["motion-reduce:animate-none", "disabled:animate-none", "disabled:opacity-50", "disabled:pointer-events-none"]))
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(onClick).not.toHaveBeenCalled()
    })

    it("habilitado, dispara o clique; os outros botões do campo seguem sem o anel", () => {
        const onClick = vi.fn()
        render(
            <form>
                <AskMasterButton onClick={onClick} />
                <PassTurnButton />
                <DeclareButton />
            </form>,
        )
        fireEvent.click(screen.getByRole("button", { name: "Perguntar ao mestre" }))
        expect(onClick).toHaveBeenCalledTimes(1)
        for (const name of ["Não fazer nada", "Declarar"]) expect(classesOf(screen.getByRole("button", { name }))).not.toContain("animate-gradient")
    })
})
