import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ getDefaultRoleId: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn().mockResolvedValue(undefined), default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/perfix/server/settings", () => ({ getDefaultRoleId: mocks.getDefaultRoleId }))

import { INTEGRATION_TESTERS } from "@/features/integrations/testers/testers"

describe("teste da integração Perfix", () => {
    beforeEach(() => {
        mocks.getDefaultRoleId.mockReset()
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
})
