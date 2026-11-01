/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ state: null as unknown, stop: vi.fn() }))
vi.mock("@nandobfer/perfix/react", () => ({ useViewAs: () => ({ state: mocks.state, stop: mocks.stop }) }))

import { VIEW_AS_BANNER_HEIGHT_VAR, ViewAsBanner } from "@/features/perfix/components/view-as/ViewAsBanner"

describe("Faixa de Visualizar como", () => {
    it("não aparece sem simulação", () => {
        mocks.state = null
        render(<ViewAsBanner />)
        expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("deixa claro que a impersonação age como o usuário e permite sair", () => {
        mocks.state = { viewAs: { tipo: "usuario", userId: "u2" }, label: { alvo: "Maria" } }
        render(<ViewAsBanner />)
        expect(screen.getByRole("status")).toHaveTextContent("Visualizando como Maria")
        expect(screen.getByRole("status")).toHaveTextContent("agindo como este usuário")
        fireEvent.click(screen.getByRole("button", { name: /Sair da simulação/ }))
        expect(mocks.stop).toHaveBeenCalled()
    })

    it("na simulação de perfil mantém a identidade real", () => {
        mocks.state = { viewAs: { tipo: "cargo", roleId: "r1" }, label: { alvo: "Usuário" } }
        render(<ViewAsBanner />)
        expect(screen.getByRole("status")).toHaveTextContent("registradas no seu nome")
    })

    describe("altura publicada para telas de altura fixa", () => {
        const heightVar = () => document.documentElement.style.getPropertyValue(VIEW_AS_BANNER_HEIGHT_VAR)
        let resize: (() => void) | null = null
        let height = 28
        afterEach(() => {
            vi.unstubAllGlobals()
            vi.restoreAllMocks()
            document.documentElement.style.removeProperty(VIEW_AS_BANNER_HEIGHT_VAR)
        })

        it("publica a altura real da faixa, acompanha a mudança (quebra de linha) e remove ao sair da simulação", async () => {
            vi.stubGlobal(
                "ResizeObserver",
                vi.fn(function (callback: () => void) {
                    resize = callback
                    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() }
                }),
            )
            vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect)
            mocks.state = { viewAs: { tipo: "usuario", userId: "u2" }, label: { alvo: "Maria" } }
            const view = render(<ViewAsBanner />)
            expect(heightVar()).toBe("28px")
            height = 46
            act(() => resize?.())
            expect(heightVar()).toBe("46px")
            mocks.state = null
            view.rerender(<ViewAsBanner />)
            await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument())
            expect(heightVar()).toBe("")
        })

        it("sem simulação a variável não existe (as telas usam o padrão 0px)", () => {
            mocks.state = null
            render(<ViewAsBanner />)
            expect(heightVar()).toBe("")
        })
    })
})
