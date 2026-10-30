/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { PermissionsProvider } from "@nandobfer/perfix/react"
const mocks = vi.hoisted(() => ({ role: undefined as unknown, save: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/perfix/components/PerfixProvider", () => ({ useAppSession: () => ({ session: { user: { id: "actor" } } }) }))
vi.mock("@/features/perfix/hooks/usePerfixAdmin", () => ({
    useRole: () => ({ data: mocks.role, isPending: false, isError: false }),
    useUsers: () => ({ data: [], isPending: false, isError: false }),
    useAccessMutation: () => ({ mutateAsync: mocks.save, isPending: false }),
}))
import { RolePage } from "@/features/perfix/components/RoleEditor"
beforeEach(() => { mocks.role = undefined; mocks.save.mockReset().mockResolvedValue({}); mocks.push.mockReset() })
const adminRoles = [{ id: "admin", slug: "admin", posicao: 0, nome: "Administrador", permissoes: ["*"], ativo: true }]
const show = () => render(<PermissionsProvider permissions={["*"]} roles={adminRoles}><RolePage id={mocks.role ? "role-1" : undefined} /></PermissionsProvider>)
describe("Editor de perfis", () => {
    it("cria um perfil com nome, token de cor e permissões", async () => {
        show()
        expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled()
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Moderador" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ path: "/roles", method: "post", data: expect.objectContaining({ nome: "Moderador", permissoes: [], ativo: true }) })))
        expect(mocks.push).toHaveBeenCalledWith("/integracoes/perfix?tab=perfis")
    })
    it("preserva rascunho quando o servidor retorna conflito", async () => {
        mocks.save.mockRejectedValue(new Error("409"))
        show()
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Rascunho" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(mocks.save).toHaveBeenCalled())
        expect(screen.getByLabelText("Nome")).toHaveValue("Rascunho")
        expect(mocks.push).not.toHaveBeenCalled()
    })
    it("envia somente campos editáveis do administrador com a versão original", async () => {
        mocks.role = { id: "role-1", slug: "admin", nome: "Administrador", descricao: "", cor: "vermelho", ativo: true, permissoes: ["*"], version: 3, membros: [], audit: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        show()
        expect(screen.getByRole("checkbox")).toBeDisabled()
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Admin" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ path: "/roles/role-1", method: "patch", data: { nome: "Admin", descricao: "", cor: "vermelho", version: 3 } }))
    })
    it("abas do editor usam a cor primária do tema e trocam de seção", async () => {
        mocks.role = { id: "role-1", slug: "mod", nome: "Moderador", descricao: "", cor: "roxo", ativo: true, permissoes: [], version: 0, membros: [], audit: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        show()
        expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Geral", "Permissões", "Membros", "Log de Auditoria"])
        const geral = screen.getByRole("tab", { name: "Geral" })
        expect(geral).toHaveAttribute("aria-selected", "true")
        expect(geral.className).toContain("aria-selected:bg-primary")
        fireEvent.click(screen.getByRole("tab", { name: "Log de Auditoria" }))
        expect(screen.getByRole("tab", { name: "Log de Auditoria" })).toHaveAttribute("aria-selected", "true")
        // A troca é animada (AnimatePresence "wait"): o painel novo entra após a saída do anterior.
        expect(await screen.findByText(/Criado em/)).toBeInTheDocument()
    })
})
