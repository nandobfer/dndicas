/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { OpexApiError } from "@/features/opex-feedback/hooks/useOpexFeedbackAccess"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), dashboard: vi.fn(), retry: vi.fn(), refresh: vi.fn(), period: vi.fn() }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: mocks.auth }))
vi.mock("@/features/opex-feedback/hooks/useOpexFeedbackAccess", async (original) => ({ ...await original<typeof import("@/features/opex-feedback/hooks/useOpexFeedbackAccess")>(), useOpexFeedbackAccess: mocks.access }))
vi.mock("@/features/opex-feedback/hooks/useOpexFeedbackDashboard", () => ({ useOpexFeedbackDashboard: mocks.dashboard }))
vi.mock("@/features/opex-feedback/components/TasksOverviewSection", () => ({ ClienteTasksOverviewSection: () => <div>Por coluna · Por tag · Por projeto · Criadas × concluídas</div> }))
vi.mock("@/features/opex-feedback/components/FinanceSection", () => ({ ClienteFinanceSection: () => <div>Financeiro do cliente</div> }))
vi.mock("@/features/opex-feedback/components/DashboardKpis", () => ({ DashboardKpis: () => <div>Tarefas ativas</div> }))
vi.mock("@/features/opex-feedback/components/DashboardHeader", () => ({ DashboardHeader: ({ onRefresh, onPeriodChange }: { onRefresh: () => void; onPeriodChange: (value: string) => void }) => <header><button onClick={onRefresh}>Atualizar</button><button onClick={() => onPeriodChange("7d")}>7 dias</button></header> }))
import { OpexFeedbackPage } from "@/features/opex-feedback/components/OpexFeedbackPage"

const access = { clientId: "c", clientName: "DnDicas", user: { id: "u", username: "hero", email: "hero@example.com" }, portalUrl: "https://opex.example/cliente?t=usr_test", created: false, isAdmin: false }
beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "u", isAdmin: false })
    mocks.access.mockReturnValue({ data: access, isError: false, refetch: mocks.retry })
    mocks.dashboard.mockReturnValue({ ready: true, period: "30d", setPeriod: mocks.period, query: { data: { finance: null }, isLoading: false, isError: false, isFetching: false, refetch: mocks.refresh } })
})
describe("página Feedback Opex", () => {
    it("visitante vê login e não habilita provisionamento", () => {
        mocks.auth.mockReturnValue({ isLoaded: true, isSignedIn: false })
        render(<OpexFeedbackPage />)
        expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy()
        expect(mocks.access).toHaveBeenCalledWith(undefined, false)
        expect(screen.queryByText("Tarefas ativas")).toBeNull()
    })
    it("mostra skeleton durante provisionamento", () => {
        mocks.access.mockReturnValue({ data: undefined, isError: false })
        render(<OpexFeedbackPage />)
        expect(screen.getByLabelText("Carregando dashboard")).toBeTruthy()
    })
    it("mostra acesso reutilizado, link seguro e gráficos sem financeiro", () => {
        render(<OpexFeedbackPage />)
        expect(screen.getByText("Acesso reutilizado no Opex.")).toBeTruthy()
        const link = screen.getByRole("link", { name: "Abrir central de feedback" })
        expect(link.getAttribute("href")).toBe(access.portalUrl)
        expect(link.getAttribute("target")).toBe("_blank")
        expect(link.getAttribute("rel")).toContain("noreferrer")
        expect(screen.getByText(/Por coluna/)).toBeTruthy()
        expect(screen.queryByText("Financeiro do cliente")).toBeNull()
        fireEvent.click(screen.getByText("Atualizar")); expect(mocks.refresh).toHaveBeenCalled()
        fireEvent.click(screen.getByText("7 dias")); expect(mocks.period).toHaveBeenCalledWith("7d")
    })
    it("mostra acesso criado e financeiro quando presente", () => {
        mocks.access.mockReturnValue({ data: { ...access, created: true, isAdmin: true }, isError: false })
        mocks.dashboard.mockReturnValue({ ready: true, query: { data: { finance: { totals: { totalCostBrl: 1, totalClientHours: 1, serviceCount: 1 } } } } })
        render(<OpexFeedbackPage />)
        expect(screen.getByText("Acesso criado no Opex.")).toBeTruthy()
        expect(screen.getByText("Financeiro do cliente")).toBeTruthy()
    })
    it("mostra configuração apenas para admin e permite tentar novamente", () => {
        mocks.auth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "u", isAdmin: true })
        mocks.access.mockReturnValue({ isError: true, error: new OpexApiError("Configure o Opex", "OPEX_NOT_CONFIGURED"), refetch: mocks.retry })
        render(<OpexFeedbackPage />)
        expect(screen.getByRole("link", { name: "Configurar Tarefas Opex" }).getAttribute("href")).toBe("/integracoes/opex")
        fireEvent.click(screen.getByText("Tentar novamente")); expect(mocks.retry).toHaveBeenCalled()
    })
    it("erro do dashboard mantém acesso e retry independente", () => {
        mocks.dashboard.mockReturnValue({ ready: true, query: { isError: true, error: new Error("Opex indisponível"), refetch: mocks.refresh } })
        render(<OpexFeedbackPage />)
        expect(screen.getByText("Opex indisponível")).toBeTruthy()
        expect(screen.getByRole("link", { name: "Abrir central de feedback" })).toBeTruthy()
        fireEvent.click(screen.getByText("Tentar novamente")); expect(mocks.refresh).toHaveBeenCalled()
    })
})
