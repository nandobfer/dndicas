import { describe, it, expect } from "vitest"
import { expandPermissions, canManageRole, evaluateRoleAssignment } from "@nandobfer/perfix"
import { catalog, normalizeRolePermissions, can } from "@/features/perfix/catalog"
import { roleSchema, roleUpdateSchema, reorderSchema } from "@/features/perfix/schemas"
const role = { id: "1", slug: "editor", nome: "Editor", permissoes: ["users.edit"], ativo: true, posicao: 1 }
describe("Catálogo de acesso Perfix", () => {
    it("normaliza a dependência de visualização e ignora perfis inativos", () => {
        expect(normalizeRolePermissions(["users.edit"])).toEqual(expect.arrayContaining(["users.view", "users.edit"]))
        expect([...expandPermissions([{ ...role, ativo: false }])]).toEqual([])
    })
    it("preserva o coringa e concede permissões futuras", () => {
        expect(normalizeRolePermissions(["*"])).toEqual(["*"])
        expect(can(expandPermissions([{ ...role, permissoes: ["*"] }]), "future.key")).toBe(true)
    })
    it("somente o coringa administra definições de perfis", () => {
        expect(canManageRole([role], { permissoes: [] })).toBe(false)
        expect(canManageRole([{ ...role, permissoes: ["*"] }], role)).toBe(true)
    })
    it("não permite atribuir autoridade superior", () => {
        const admin = { ...role, id: "2", posicao: 0, permissoes: ["*"] }
        expect(evaluateRoleAssignment({ catalog, callerCargos: [role], requested: [admin.id], current: [], loaded: [admin] }).status).not.toBe("ok")
    })
    it("recusa coringa, chaves desconhecidas e IDs repetidos em payloads", () => {
        const base = { nome: "Editor", descricao: "", cor: "azul", ativo: true }
        expect(roleSchema.safeParse({ ...base, permissoes: ["*"] }).success).toBe(false)
        expect(roleSchema.safeParse({ ...base, permissoes: ["unknown"] }).success).toBe(false)
        expect(roleUpdateSchema.safeParse({ version: -1 }).success).toBe(false)
        expect(reorderSchema.safeParse({ version: 0, ordem: ["a".repeat(24), "a".repeat(24)] }).success).toBe(false)
    })
})
