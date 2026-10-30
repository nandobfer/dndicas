import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ getDefaultRoleId: vi.fn(), assertTransactionsSupported: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn().mockResolvedValue(undefined), default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/perfix/server/settings", () => ({ getDefaultRoleId: mocks.getDefaultRoleId }))
vi.mock("@/features/perfix/server/access", () => ({ assertTransactionsSupported: mocks.assertTransactionsSupported }))

import { INTEGRATION_TESTERS } from "@/features/integrations/testers/testers"

describe("teste da integração Perfix", () => {
    beforeEach(() => {
        mocks.getDefaultRoleId.mockReset()
        mocks.assertTransactionsSupported.mockReset().mockResolvedValue(undefined)
    })

    it("passa quando o perfil padrão é válido", async () => {
        mocks.getDefaultRoleId.mockResolvedValue("role-user")
        const emit = vi.fn()
        await expect(INTEGRATION_TESTERS.perfix({ emit } as never)).resolves.toBe("Perfix disponível; perfil padrão válido")
        expect(emit).toHaveBeenCalledWith("success", expect.stringContaining("role-user"))
    })

    it("falha quando não há perfil padrão válido", async () => {
        mocks.getDefaultRoleId.mockRejectedValue(new DomainError(503, "Cadastro indisponível: configure um perfil padrão válido na integração Perfix.", "SIGNUP_UNAVAILABLE"))
        await expect(INTEGRATION_TESTERS.perfix({ emit: vi.fn() } as never)).rejects.toThrow(/perfil padrão/)
    })

    it("falha com orientação quando o MongoDB não suporta transações", async () => {
        mocks.assertTransactionsSupported.mockRejectedValue(new DomainError(503, "A administração de acessos exige MongoDB com replica set (transações). Inicie o mongod com --replSet e execute rs.initiate() antes de usar o Perfix.", "REPLICA_SET_REQUIRED"))
        await expect(INTEGRATION_TESTERS.perfix({ emit: vi.fn() } as never)).rejects.toThrow(/replica set/)
        expect(mocks.getDefaultRoleId).not.toHaveBeenCalled()
    })
})
