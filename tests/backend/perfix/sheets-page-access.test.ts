import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ requestAccess: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }), current: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/features/perfix/server/access", () => ({ requestAccess: mocks.requestAccess }))
vi.mock("@/features/users/api/get-current-user", () => ({ getCurrentUserFromDb: mocks.current }))
vi.mock("@/features/character-sheets/components/admin-sheets-page", () => ({ AdminSheetsPage: () => null }))
vi.mock("@/components/ui/loading-state", () => ({ LoadingState: () => null }))
import SheetsAdminPageRoute from "@/app/(dashboard)/sheets/page"

beforeEach(() => {
    mocks.redirect.mockClear()
    mocks.current.mockResolvedValue({ success: true, user: { _id: "u1" }, userId: "u1" })
})
describe("/sheets", () => {
    it("usuário sem sheets.view_all vai para as próprias fichas", async () => {
        mocks.requestAccess.mockResolvedValue({ effective: new Set(["users.view"]) })
        await expect(SheetsAdminPageRoute()).rejects.toThrow("REDIRECT:/my-sheets")
    })
    it("com sheets.view_all mostra a listagem administrativa", async () => {
        mocks.requestAccess.mockResolvedValue({ effective: new Set(["sheets.view_all"]) })
        await expect(SheetsAdminPageRoute()).resolves.toBeTruthy()
        expect(mocks.redirect).not.toHaveBeenCalled()
    })
})
