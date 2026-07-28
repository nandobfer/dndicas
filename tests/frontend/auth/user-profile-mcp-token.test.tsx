import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UserProfile } from "@/features/auth/auth-components"

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string } & ComponentPropsWithoutRef<"a">) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-auth/react", () => ({
    signIn: vi.fn(),
}))

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/glass-image-uploader", () => ({
    GlassImageUploader: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: (() => {
        const user = { id: "user-1", name: "Hero", username: "hero", email: "hero@example.com", image: "" }
        return () => ({ user, isLoaded: true })
    })(),
}))

function mockResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        json: async () => body,
    }
}

describe("UserProfile MCP token", () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it("shows empty state and displays the full token only after generation", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === "/api/auth/profile/mcp-token" && init?.method === "POST") {
                return Promise.resolve(mockResponse({
                    token: "dndicas_mcp_fullsecret",
                    mcpToken: {
                        exists: true,
                        prefix: "dndicas_mcp_fulls",
                        suffix: "secret",
                        createdAt: "2026-07-28T12:00:00.000Z",
                        lastUsedAt: null,
                    },
                }, true, 201))
            }

            return Promise.resolve(mockResponse({
                id: "user-1",
                name: "Hero",
                username: "hero",
                email: "hero@example.com",
                avatarUrl: "",
                role: "user",
                mcpToken: { exists: false },
            }))
        })
        const writeText = vi.fn().mockResolvedValue(undefined)

        vi.stubGlobal("fetch", fetchMock)
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        })

        render(<UserProfile />)

        await waitFor(() => expect(screen.getByText("Você ainda não tem um token MCP. Gere um token permanente para configurar clientes MCP autorizados.")).toBeInTheDocument())

        fireEvent.click(screen.getByRole("button", { name: "Gerar token" }))

        await waitFor(() => expect(screen.getByText("dndicas_mcp_fullsecret")).toBeInTheDocument())
        expect(screen.getByText("Copie agora. Depois este token não será exibido novamente.")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Copiar token" }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith("dndicas_mcp_fullsecret"))
    })

    it("shows masked token after reload and revokes it", async () => {
        let deleted = false
        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === "/api/auth/profile/mcp-token" && init?.method === "DELETE") {
                deleted = true
                return Promise.resolve(mockResponse({ mcpToken: { exists: false } }))
            }

            return Promise.resolve(mockResponse({
                id: "user-1",
                name: "Hero",
                username: "hero",
                email: "hero@example.com",
                avatarUrl: "",
                role: "admin",
                mcpToken: {
                    exists: true,
                    prefix: "dndicas_mcp_abcdef",
                    suffix: "uvwxyz",
                    createdAt: "2026-07-28T12:00:00.000Z",
                    lastUsedAt: null,
                },
            }))
        })

        vi.stubGlobal("fetch", fetchMock)
        vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))

        render(<UserProfile />)

        await waitFor(() => expect(screen.getByText("dndicas_mcp_abcdef...uvwxyz")).toBeInTheDocument())
        expect(screen.queryByRole("button", { name: "Copiar token" })).not.toBeInTheDocument()
        expect(screen.getByText("Por segurança, o token completo só aparece ao gerar. Se perdeu o token, exclua e gere outro.")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(screen.getByText("Token MCP excluído com sucesso.")).toBeInTheDocument())
        expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/profile/mcp-token", {
            method: "DELETE",
            credentials: "same-origin",
        })
        expect(deleted).toBe(true)
    })
})
