/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OpexFab } from "@/features/opex-agent/components/OpexFab"

const scope = vi.hoisted(() => ({ value: { role: "anonymous", status: { available: true } as { available: boolean } | undefined } }))
const sessions = vi.hoisted(() => ({ value: [] as Array<{ status: string }> }))
const openSession = vi.hoisted(() => ({ listener: null as ((id: string) => void) | null }))

vi.mock("@/features/opex-agent/components/OpexScopeProvider", () => ({
    useOpexScope: () => scope.value,
}))
vi.mock("@/features/opex-agent/hooks/useOpexSessions", () => ({
    useOpexSessions: () => ({ data: sessions.value }),
    useOpexRealtime: () => undefined,
}))
vi.mock("@/features/opex-agent/hooks/useOpexJobs", () => ({
    useOpexJobNotifications: () => undefined,
}))
vi.mock("@/features/opex-agent/hooks/useOpexUploads", () => ({
    OpexUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/features/opex-agent/open-session", () => ({
    onOpenOpexSession: (listener: (id: string) => void) => {
        openSession.listener = listener
        return () => (openSession.listener = null)
    },
}))
vi.mock("@/features/opex-agent/components/OpexPanel", () => ({
    OpexPanel: ({ maximized, onToggleMaximize }: { maximized?: boolean; onToggleMaximize?: () => void }) => (
        <div data-testid="opex-panel" data-maximized={String(Boolean(maximized))} data-can-maximize={String(Boolean(onToggleMaximize))}>
            Chat
        </div>
    ),
}))

function setWidth(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
}

describe("OpexFab", () => {
    beforeEach(() => {
        scope.value = { role: "anonymous", status: { available: true } }
        sessions.value = []
        setWidth(1280)
    })

    it("é um botão redondo que abre o chat ancorado, com opção de maximizar no desktop", async () => {
        render(<OpexFab />)
        const button = screen.getByRole("button", { name: "Agente Opex" })
        expect(button.className).toContain("rounded-full")
        fireEvent.click(button)
        const panel = await screen.findByTestId("opex-panel")
        expect(panel).toHaveAttribute("data-can-maximize", "true")
        expect(panel).toHaveAttribute("data-maximized", "false")
        expect(button).toHaveAttribute("aria-expanded", "true")
    })

    it("abre em tela cheia no celular", async () => {
        setWidth(390)
        render(<OpexFab />)
        fireEvent.click(screen.getByRole("button", { name: "Agente Opex" }))
        expect(await screen.findByTestId("opex-panel")).toHaveAttribute("data-maximized", "true")
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("abre e fecha com Ctrl+Shift+O", async () => {
        render(<OpexFab />)
        fireEvent.keyDown(window, { key: "O", ctrlKey: true, shiftKey: true })
        expect(await screen.findByTestId("opex-panel")).toBeInTheDocument()
        fireEvent.keyDown(window, { key: "o", ctrlKey: true, shiftKey: true })
        await waitFor(() => expect(screen.queryByTestId("opex-panel")).not.toBeInTheDocument())
    })

    it("abre ao pedirem uma sessão", async () => {
        render(<OpexFab />)
        act(() => openSession.listener?.("abc"))
        expect(await screen.findByTestId("opex-panel")).toBeInTheDocument()
    })

    it("mostra o ponto pulsante quando alguma conversa responde ou aguarda confirmação", () => {
        sessions.value = [{ status: "idle" }]
        const { rerender } = render(<OpexFab />)
        expect(screen.queryByTestId("opex-fab-busy")).not.toBeInTheDocument()
        sessions.value = [{ status: "awaiting_confirmation" }]
        rerender(<OpexFab />)
        expect(screen.getByTestId("opex-fab-busy")).toBeInTheDocument()
        sessions.value = [{ status: "running" }]
        rerender(<OpexFab />)
        expect(screen.getByTestId("opex-fab-busy")).toBeInTheDocument()
    })

    it("some para o visitante quando o agente não está liberado para visitantes", () => {
        scope.value = { role: "anonymous", status: { available: false } }
        render(<OpexFab />)
        expect(screen.queryByRole("button", { name: "Agente Opex" })).not.toBeInTheDocument()
    })

    it("aparece para quem está logado mesmo fechado para visitantes, e some sem a situação carregada", () => {
        scope.value = { role: "user", status: { available: false } }
        const { rerender } = render(<OpexFab />)
        expect(screen.getByRole("button", { name: "Agente Opex" })).toBeInTheDocument()
        scope.value = { role: "user", status: undefined }
        rerender(<OpexFab />)
        expect(screen.queryByRole("button", { name: "Agente Opex" })).not.toBeInTheDocument()
    })
})
