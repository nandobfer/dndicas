import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { installRadixDomPolyfills } from "../perfix/radix-dom"
vi.mock("@/features/perfix/hooks/usePerfixAdmin", () => ({
    useRoles: () => ({ data: { roles: [{ id: "user", nome: "Usuário" }, { id: "mod", nome: "Moderador" }] } }),
}))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ can: () => true }) }))
vi.mock("@/components/ui/search-input", () => ({ SearchInput: () => null }))
import { UserFilters } from "@/features/users/components/user-filters"

beforeAll(installRadixDomPolyfills)

describe("Filtros de usuários", () => {
    it("filtro por perfil é um select Glass; 'Todos os perfis' limpa o filtro", async () => {
        const onRoleChange = vi.fn()
        render(<UserFilters filters={{ roleId: "mod" }} onSearchChange={vi.fn()} onRoleChange={onRoleChange} onStatusChange={vi.fn()} />)
        const trigger = screen.getByRole("combobox", { name: "Filtrar por perfil" })
        expect(document.querySelector("select:not([aria-hidden])")).toBeNull()
        expect(trigger).toHaveTextContent("Moderador")
        fireEvent.keyDown(trigger, { key: "Enter" })
        fireEvent.click(await screen.findByRole("option", { name: "Todos os perfis" }))
        expect(onRoleChange).toHaveBeenCalledWith("")
    })

    it("escolher um perfil filtra pelo id", async () => {
        const onRoleChange = vi.fn()
        render(<UserFilters filters={{}} onSearchChange={vi.fn()} onRoleChange={onRoleChange} onStatusChange={vi.fn()} />)
        const trigger = screen.getByRole("combobox", { name: "Filtrar por perfil" })
        expect(trigger).toHaveTextContent("Todos os perfis")
        fireEvent.keyDown(trigger, { key: "Enter" })
        fireEvent.click(await screen.findByRole("option", { name: "Usuário" }))
        expect(onRoleChange).toHaveBeenCalledWith("user")
    })
})
