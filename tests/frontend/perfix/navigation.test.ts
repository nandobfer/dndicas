import { describe, expect, it } from "vitest"
import { canNavigate } from "@/features/perfix/navigation"
describe("Sidebar por permissão", () => {
    it("permite um perfil intermediário sem liberar administração global", () => {
        const can = (key: string) => key === "users.view"
        expect(canNavigate("/users", can)).toBe(true)
        expect(canNavigate("/integracoes", can)).toBe(false)
        expect(canNavigate("/audit-logs", can)).toBe(false)
        expect(canNavigate("/spells", can)).toBe(true)
    })
})
