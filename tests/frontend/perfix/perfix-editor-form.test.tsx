/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PermissionsProvider } from "@nandobfer/perfix/react"
import { installRadixDomPolyfills } from "./radix-dom"
const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), tab: null as string | null }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.tab ? `tab=${mocks.tab}` : "") }))
vi.mock("@/core/utils/api", () => ({ default: { get: mocks.get, patch: mocks.patch } }))
vi.mock("@/features/perfix/components/RolesPage", () => ({ RolesPage: () => <p>Lista de perfis</p> }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { PerfixEditorForm } from "@/features/perfix/components/PerfixEditorForm"

const roles = [
    { id: "admin", slug: "admin", nome: "Administrador", descricao: "", cor: "vermelho", ativo: true, permissoes: ["*"], posicao: 0 },
    { id: "user", slug: "user", nome: "Usuário", descricao: "", cor: "azul", ativo: true, permissoes: [], posicao: 1 },
    { id: "mod", slug: "mod", nome: "Moderador", descricao: "", cor: "roxo", ativo: true, permissoes: ["users.view"], posicao: 2 },
]
const adminRoles = [{ id: "admin", slug: "admin", posicao: 0, nome: "Administrador", permissoes: ["*"], ativo: true }]
function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={client}><PermissionsProvider permissions={["*"]} roles={adminRoles}><PerfixEditorForm /></PermissionsProvider></QueryClientProvider>)
}
beforeAll(installRadixDomPolyfills)
beforeEach(() => {
    mocks.tab = null
    mocks.get.mockReset().mockResolvedValue({ data: { data: { defaultRoleId: "user", version: 2, roleOptions: roles } } })
    mocks.patch.mockReset().mockResolvedValue({})
})

describe("Integração Perfix", () => {
    it("abas usam a cor primária do tema (não o componente de abas do core)", async () => {
        show()
        const geral = screen.getByRole("tab", { name: "Geral" })
        expect(geral).toHaveAttribute("aria-selected", "true")
        expect(geral.className).toContain("aria-selected:bg-primary")
        const perfis = screen.getByRole("tab", { name: "Perfis" })
        expect(perfis).toHaveAttribute("aria-selected", "false")
        fireEvent.click(perfis)
        await waitFor(() => expect(screen.getByText("Lista de perfis")).toBeInTheDocument())
        expect(screen.getByRole("tab", { name: "Perfis" })).toHaveAttribute("aria-selected", "true")
    })

    it("abre na aba Perfis pelo parâmetro da URL", () => {
        mocks.tab = "perfis"
        show()
        expect(screen.getByRole("tab", { name: "Perfis" })).toHaveAttribute("aria-selected", "true")
    })

    it("perfil padrão é um select Glass e escolher 'Sem perfil' salva null", async () => {
        // O happy-dom não implementa `window.confirm`: define-se a função no próprio teste.
        Object.defineProperty(window, "confirm", { value: () => true, configurable: true })
        show()
        const trigger = await screen.findByRole("combobox", { name: "Perfil padrão de novos usuários" })
        expect(document.querySelector("select:not([aria-hidden])")).toBeNull()
        expect(trigger).toHaveTextContent("Usuário")
        fireEvent.keyDown(trigger, { key: "Enter" })
        const options = await screen.findAllByRole("option")
        expect(options.map((option) => option.textContent)).toEqual(["Sem perfil — cadastro indisponível", "Usuário", "Moderador"])
        fireEvent.click(screen.getByRole("option", { name: "Sem perfil — cadastro indisponível" }))
        expect(screen.getByRole("alert")).toHaveTextContent("novos cadastros serão bloqueados")
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/perfix/settings", { defaultRoleId: null, version: 2 }))
    })
})
