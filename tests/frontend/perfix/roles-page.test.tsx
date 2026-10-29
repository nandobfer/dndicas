import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionsProvider } from "@nandobfer/perfix/react"
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock("@/features/perfix/hooks/usePerfixAdmin", () => ({
    useRoles: () => ({ data: { roles: [
        { id: "admin", slug: "admin", nome: "Administrador", descricao: "Acesso completo", cor: "vermelho", ativo: true, usuariosCount: 1, version: 0 },
        { id: "user", slug: "user", nome: "Usuário", descricao: "", cor: "azul", ativo: true, usuariosCount: 2, version: 0 },
        { id: "editor", slug: "editor", nome: "Editor", descricao: "Catálogo", cor: "roxo", ativo: false, usuariosCount: 0, version: 4 },
    ], hierarchyVersion: 1 }, isPending: false, isError: false }),
    useAccessMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}))
import { RolesPage } from "@/features/perfix/components/RolesPage"
beforeEach(() => { mocks.mutate.mockClear() })
const adminRoles = [{ id: "admin", slug: "admin", posicao: 0, nome: "Administrador", permissoes: ["*"], ativo: true }]
describe("Lista de perfis", () => {
    it("mostra perfis, filtra e protege o reservado e perfis em uso", () => {
        render(<PermissionsProvider permissions={["*"]} roles={adminRoles}><RolesPage /></PermissionsProvider>)
        expect(screen.getByRole("link", { name: /Novo Perfil/ })).toHaveAttribute("href", "/integracoes/perfix/perfis/novo")
        expect(screen.queryByRole("button", { name: "Excluir Administrador" })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Excluir Usuário" })).toBeDisabled()
        fireEvent.change(screen.getByLabelText("Buscar perfil"), { target: { value: "não existe" } })
        expect(screen.getByText("Nenhum perfil encontrado.")).toBeInTheDocument()
    })
    it("exige confirmação e envia versão na exclusão", () => {
        vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
        render(<PermissionsProvider permissions={["*"]} roles={adminRoles}><RolesPage /></PermissionsProvider>)
        fireEvent.click(screen.getByRole("button", { name: "Excluir Editor" }))
        expect(mocks.mutate).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Excluir Editor" }))
        expect(mocks.mutate).toHaveBeenCalledWith({ path: "/roles/editor", method: "delete", data: { version: 4 } })
    })
    it("não oferece ações de escrita apenas com roles.view", () => {
        render(<PermissionsProvider permissions={["roles.view"]}><RolesPage /></PermissionsProvider>)
        expect(screen.queryByRole("link", { name: /Novo Perfil/ })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Excluir Editor" })).not.toBeInTheDocument()
    })
})
