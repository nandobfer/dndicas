import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ state: null as unknown, stop: vi.fn() }))
vi.mock("@nandobfer/perfix/react", () => ({ useViewAs: () => ({ state: mocks.state, stop: mocks.stop }) }))

import { ViewAsBanner } from "@/features/perfix/components/view-as/ViewAsBanner"

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
})
