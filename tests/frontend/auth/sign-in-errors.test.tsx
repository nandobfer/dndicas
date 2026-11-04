/** @vitest-environment happy-dom */
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SignIn } from "@/features/auth/auth-components"

const state = vi.hoisted(() => ({ errorCode: null as string | null }))

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string } & ComponentPropsWithoutRef<"a">) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(state.errorCode ? { error: state.errorCode } : {}),
}))

vi.mock("next-auth/react", () => ({
    signIn: vi.fn(),
    getProviders: vi.fn(async () => ({ google: { id: "google", name: "Google" } })),
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
    useAuth: () => ({ user: null, isLoaded: true }),
}))

describe("SignIn — erros vindos do servidor", () => {
    it("explica em pt-BR a falha do login com Google", () => {
        state.errorCode = "GoogleSignInFailed"
        render(<SignIn />)

        expect(screen.getByText(/Não foi possível entrar com o Google agora/i)).toBeTruthy()
    })

    it("mantém a mensagem de cadastro indisponível", () => {
        state.errorCode = "SignupUnavailable"
        render(<SignIn />)

        expect(screen.getByText(/Cadastro indisponível no momento/i)).toBeTruthy()
    })

    it("não mostra erro quando a tela abre sem código", () => {
        state.errorCode = null
        render(<SignIn />)

        expect(screen.queryByText(/Não foi possível entrar com o Google agora/i)).toBeNull()
        expect(screen.queryByText(/Cadastro indisponível no momento/i)).toBeNull()
    })
})
