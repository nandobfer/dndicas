/** @vitest-environment happy-dom */
import * as React from "react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Settings } from "lucide-react"
import IntegracoesLayout from "@/app/(dashboard)/integracoes/layout"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { Button } from "@/components/ui/opex/button"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { IntegrationTabs } from "@/features/integrations/components/tabs/IntegrationTabs"

// A central de integrações é protegida por permissão (`requestAccess`), não por papel.
const access = vi.hoisted(() => ({ effective: new Set<string>() }))
vi.mock("@/features/perfix/server/access", () => ({ requestAccess: async () => (access.effective.size ? { effective: access.effective } : null) }))
vi.mock("next/navigation", () => ({
    redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`) }),
}))

describe("Padrão visual das integrações", () => {
    beforeEach(() => {
        access.effective = new Set(["integrations.access"])
    })

    it("deixa o espaçamento horizontal a cargo do layout do dashboard", async () => {
        const { container } = render(await IntegracoesLayout({ children: <p>Integrações</p> }))
        const wrapper = container.firstElementChild
        expect(wrapper).toHaveClass("w-full", "min-w-0", "flex-col", "gap-6")
        expect(wrapper).not.toHaveClass("mx-auto", "max-w-7xl")
        expect(screen.getByText("Integrações")).toBeInTheDocument()
    })

    it("preserva o redirecionamento de visitantes", async () => {
        access.effective = new Set()
        await expect(IntegracoesLayout({ children: <p>Conteúdo privado</p> }))
            .rejects.toThrow("redirect:/sign-in?callbackUrl=%2Fintegracoes")
    })

    it("preserva o bloqueio de usuários comuns", async () => {
        access.effective = new Set(["users.view"])
        render(await IntegracoesLayout({ children: <p>Conteúdo privado</p> }))
        expect(screen.getByText("Acesso restrito")).toBeInTheDocument()
        expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument()
    })

    it("usa o glass existente na lista, mantendo o padding interno", () => {
        const { container } = render(<CadastroTableCard><p>Lista de integrações</p></CadastroTableCard>)
        expect(container.firstElementChild).toHaveClass("rounded-xl", "border-white/10")
        expect(container.firstElementChild).not.toHaveClass("bg-card")
        expect(screen.getByText("Lista de integrações").parentElement).toHaveClass("p-6")
    })

    it("usa glass no detalhe e mantém o switch funcional com o token primário", () => {
        const setDraft = vi.fn()
        const { container } = render(<GeneralCard draft={{ environment: "interno", debugMode: false, swaggerUrl: "", publicValues: {}, secrets: {} }} setDraft={setDraft} />)
        const title = screen.getByRole("heading", { name: "Geral" })
        expect(title.parentElement?.parentElement).toHaveClass("rounded-xl", "border-white/10")
        expect(container.querySelector(".bg-card")).toBeNull()
        const toggle = screen.getByRole("checkbox", { name: "Modo debug" })
        expect(toggle.nextElementSibling).toHaveClass("peer-checked:bg-primary")
        fireEvent.click(toggle)
        expect(setDraft).toHaveBeenCalledWith(expect.objectContaining({ debugMode: true }))
    })

    it("mantém abas e botões ligados ao mesmo token primário", () => {
        const onSelect = vi.fn()
        render(<IntegrationTabs tabs={[{ id: "geral", label: "Geral", icon: Settings }, { id: "logs", label: "Logs", icon: Settings }]} active="geral" onSelect={onSelect} pendingTab={null} onConfirmDiscard={vi.fn()} onCancelDiscard={vi.fn()} label="Integração">
            <Button>Salvar integração</Button>
        </IntegrationTabs>)
        expect(screen.getByRole("tab", { name: "Geral" })).toHaveClass("aria-selected:bg-primary")
        expect(screen.getByRole("button", { name: "Salvar integração" })).toHaveClass("bg-primary", "text-primary-foreground")
        fireEvent.click(screen.getByRole("tab", { name: "Logs" }))
        expect(onSelect).toHaveBeenCalledWith("logs")
    })

    // JSDOM não calcula cores relativas CSS: verificamos a fonte de verdade do tema.
    it("reutiliza blue-500 nos dois temas sem aproximar ou duplicar o valor da cor", () => {
        const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")
        expect(css.match(/--primary: from var\(--color-blue-500\) h s l;/g)).toHaveLength(2)
        expect(css.match(/--primary-foreground: 0 0% 100%;/g)).toHaveLength(2)
        expect(css).not.toMatch(/--primary:\s*142\./)
        expect(css).toContain("--color-primary: hsl(var(--primary))")
    })
})
