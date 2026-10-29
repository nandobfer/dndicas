import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { UserResponse } from "@/features/users/types/user.types"
const mocks = vi.hoisted(() => ({ userId: "admin-1" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: mocks.userId }) }))
vi.mock("@/features/perfix/components/RoleAssignment", () => ({
    RoleAssignment: ({ onChange, disabled }: { onChange: (ids: string[]) => void; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={() => onChange([MOD])}>Atribuir Moderador</button>,
}))
import { UserFormModal } from "@/features/users/components/user-form-modal"

const MOD = "64b000000000000000000002"
const USER_ROLE = "64b000000000000000000001"
const existing = { id: "user-2", username: "ana", email: "ana@example.com", name: "Ana", roleIds: [USER_ROLE], version: 4, status: "active" } as unknown as UserResponse
const fill = () => {
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "novo_user" } })
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "Novo@Example.com" } })
}
beforeEach(() => { mocks.userId = "admin-1" })

describe("Formulário de usuário", () => {
    it("cria sem perfis: envia só os campos de cadastro (sem status/version)", async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />)
        fill()
        fireEvent.click(screen.getByRole("button", { name: "Criar" }))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit.mock.calls[0]![0]).toEqual({ username: "novo_user", email: "novo@example.com" })
    })

    it("cria com perfis escolhidos", async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />)
        fill()
        fireEvent.click(screen.getByRole("button", { name: "Atribuir Moderador" }))
        fireEvent.click(screen.getByRole("button", { name: "Criar" }))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ username: "novo_user", email: "novo@example.com", roleIds: [MOD] }))
    })

    it("edita com versão e status", async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} user={existing} />)
        fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: "Ana Maria" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Ana Maria", version: 4, status: "active", roleIds: [USER_ROLE] })))
    })

    it("autoedição não permite trocar perfis nem desativar a conta", () => {
        mocks.userId = "user-2"
        render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} user={existing} />)
        expect(screen.getByRole("button", { name: "Atribuir Moderador" })).toBeDisabled()
        expect(screen.getByText("Você não pode alterar seus próprios perfis.")).toBeInTheDocument()
        expect(screen.getByRole("checkbox")).toBeDisabled()
    })

    it("erro de validação aparece no campo e não envia", async () => {
        const onSubmit = vi.fn()
        render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />)
        fireEvent.click(screen.getByRole("button", { name: "Criar" }))
        await waitFor(() => expect(screen.getAllByText(/inválido|obrigatório|mínimo/i).length).toBeGreaterThan(0))
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
