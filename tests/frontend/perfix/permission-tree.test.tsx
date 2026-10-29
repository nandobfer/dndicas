import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PermissionTree } from "@/features/perfix/components/permissions/PermissionTree"
import { RoleColorSelect } from "@/features/perfix/components/RoleColorSelect"
describe("Editor de permissões", () => {
    it("permite buscar e apresenta o perfil coringa como leitura", () => {
        const onChange = vi.fn()
        render(<PermissionTree selected={new Set(["*"])} onChange={onChange} />)
        expect(screen.getByText(/todas as permissões/)).toBeInTheDocument()
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "impossivelxyz" } })
        expect(screen.getByText("Nenhuma permissão encontrada.")).toBeInTheDocument()
        expect(onChange).not.toHaveBeenCalled()
    })
    it("salva o token da paleta em vez de hexadecimal", () => {
        const change = vi.fn()
        render(<RoleColorSelect value="azul" onChange={change} />)
        const radios = screen.getAllByRole("radio")
        fireEvent.click(radios[0])
        expect(change).toHaveBeenCalledWith(expect.stringMatching(/^[a-z]+$/))
    })
})
