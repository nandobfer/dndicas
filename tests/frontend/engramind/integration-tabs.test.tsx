/** @vitest-environment happy-dom */
import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import type { CampaignSyncDto, EngramindConnectionDto, MigrationItemDto } from "@/features/engramind/types"

const hooks = vi.hoisted(() => ({
    connection: null as EngramindConnectionDto | null,
    sync: null as CampaignSyncDto | null,
    bootstrap: { mutate: vi.fn(), isPending: false, data: undefined },
    syncNow: { mutate: vi.fn(), isPending: false },
    discard: { mutate: vi.fn(), isPending: false },
}))
vi.mock("@/features/engramind/hooks/useEngramind", () => ({
    useEngramindConnection: () => ({ data: hooks.connection, isLoading: false }),
    useEngramindBootstrap: () => hooks.bootstrap,
    useEngramindSync: () => ({ data: hooks.sync, isLoading: false, error: null, refetch: vi.fn() }),
    useSyncNow: () => hooks.syncNow,
    useDiscardPendingWrite: () => hooks.discard,
}))

const { ConnectionTab } = await import("@/features/engramind/components/integration/ConnectionTab")
const { SyncTab } = await import("@/features/engramind/components/integration/SyncTab")
const { ReviewItem } = await import("@/features/engramind/components/integration/migration/ReviewItem")
const { draftFrom } = await import("@/features/integrations/components/detail/draft")

const def = getIntegrationDef("engramind")
const secret = (configured: boolean) => ({ configured, source: configured ? ("db" as const) : ("none" as const), unreadable: false })
const detail: IntegrationDetailDto = {
    id: "engramind",
    name: "Engramind",
    description: "",
    environment: "externo",
    debugMode: false,
    publicValues: { baseUrl: "https://engramind.test", publicAppUrl: "" },
    secrets: { appToken: secret(true) },
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok", message: null, checkedAt: null } as never,
    swaggerUrl: null,
    explorerAuth: null,
}

beforeEach(() => {
    hooks.bootstrap.mutate.mockClear()
    hooks.connection = {
        configured: true,
        webhookUrl: "https://dndicas.test/api/engramind/webhook",
        bootstrap: {
            ok: false,
            ranAt: "2026-11-05T10:00:00Z",
            steps: [
                { id: "whoami", label: "Validar o token do app", status: "ok", message: "Token de app do app dndicas", at: "2026-11-05T10:00:00Z" },
                { id: "webhook", label: "Webhook", status: "warn", message: "Sem URL pública", at: "2026-11-05T10:00:00Z" },
                { id: "categories", label: "Categorias e canais das campanhas", status: "pending", message: "", at: "2026-11-05T10:00:00Z" },
            ],
        },
        agentTokens: { opex: true },
        webhookSecretConfigured: true,
        categoryWarnings: [],
        memoryContext: { unavailable: true, since: "2026-11-05T09:00:00Z", lastOkAt: "2026-11-05T08:00:00Z", reason: "fora do ar" },
    }
})

describe("aba Conexão", () => {
    it("só o token do app é campo privado editável; tokens dos agentes e segredo do webhook nunca aparecem", () => {
        render(<ConnectionTab def={def} data={detail} draft={draftFrom(detail)} setDraft={vi.fn()} dirty={false} pending={false} onUndo={vi.fn()} />)
        expect(screen.getByText("Token do app")).toBeInTheDocument()
        expect(screen.queryByText(/Token do agente/)).toBeNull()
        expect(screen.queryByText("Segredo do webhook")).toBeNull()
        expect(screen.getByText("URL base do Engramind")).toBeInTheDocument()
        expect(screen.getByText("URL pública do dndicas")).toBeInTheDocument()
    })

    it("mostra os passos da configuração automática, o aviso de indisponibilidade e repete com o botão", () => {
        render(<ConnectionTab def={def} data={detail} draft={draftFrom(detail)} setDraft={vi.fn()} dirty={false} pending={false} onUndo={vi.fn()} />)
        expect(screen.getByText("Sem URL pública")).toBeInTheDocument()
        expect(screen.getByLabelText("Com aviso")).toBeInTheDocument()
        expect(screen.getByLabelText("Pendente")).toBeInTheDocument()
        expect(screen.getByRole("status")).toHaveTextContent("Engramind indisponível")
        fireEvent.click(screen.getByRole("button", { name: /Repetir configuração automática/ }))
        expect(hooks.bootstrap.mutate).toHaveBeenCalled()
    })
})

describe("aba Sincronização", () => {
    it("mostra a fila, a recusa com Descartar (confirmação), os avisos e sincroniza agora", () => {
        hooks.sync = {
            configured: true,
            lastRunAt: "2026-11-05T10:00:00Z",
            lastOkAt: "2026-11-05T10:00:00Z",
            lastError: null,
            lastResult: { delivered: 2, failed: 1, remaining: 1, channels: 4 },
            pending: 2,
            failures: [
                { id: "c:mx:fato:cais", campaignId: "c", title: "Cais", error: "Engramind fora do ar", failed: false },
                { id: "c:mx:fato:ponte", campaignId: "c", title: "Ponte", error: "Canal arquivado", failed: true },
            ],
            legacyCampaignMemories: 3,
            redator: { supported: false, checkedAt: null, message: "O Redator do Engramind pode reescrever o texto (redator.rewrite_text)" },
            categoryWarnings: ["A lista de categorias do Engramind está cheia"],
            running: false,
        }
        render(<SyncTab />)
        expect(screen.getByTestId("sync-pending")).toHaveTextContent("2")
        expect(screen.getByText("Cais")).toBeInTheDocument()
        expect(screen.getByText("Recusada: Canal arquivado")).toBeInTheDocument()
        expect(screen.getByTestId("sync-legacy-warning")).toHaveTextContent("3 memória(s) antiga(s)")
        expect(screen.getByTestId("sync-redator-warning")).toHaveTextContent("redator.rewrite_text")
        expect(screen.getByText(/categorias do Engramind está cheia/)).toBeInTheDocument()
        expect(screen.getAllByRole("button", { name: /Descartar/ })).toHaveLength(1)
        fireEvent.click(screen.getByRole("button", { name: /Descartar/ }))
        expect(hooks.discard.mutate).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
        fireEvent.click(screen.getByRole("button", { name: /Sincronizar agora/ }))
        expect(hooks.syncNow.mutate).toHaveBeenCalled()
    })
})

describe("revisão da migração", () => {
    const item = (decisao: "descartar" | "migrar"): MigrationItemDto => ({
        id: "a",
        list: "maddox",
        listTitle: "Memórias do Maddox",
        texto: "Original",
        resumo: "",
        channel: "dndicas/maddox",
        criadaEm: "2026-01-01T00:00:00Z",
        decision: { decisao, motivo: "Motivo", textoProposto: null, categoriaProposta: "GLOSSARIO", novaCategoria: { key: "GLOSSARIO", label: "Glossário" }, canalDestino: "dndicas/maddox", duplicataDe: null, confianca: 0.8 },
        review: { status: "pendente", texto: null, categoria: null },
        final: { texto: "Original", categoria: "GLOSSARIO" },
        needsAttention: decisao === "descartar",
        imported: null,
    })

    it("descartada: Aceitar descarte rejeita e Migrar mesmo assim aprova", () => {
        const onDecide = vi.fn()
        render(<ReviewItem item={item("descartar")} categories={[{ key: "PROJECT_RULES", label: "Regras" }]} textMax={100} onDecide={onDecide} />)
        expect(screen.getByText("Nova categoria: Glossário (GLOSSARIO)")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Aceitar descarte/ }))
        fireEvent.click(screen.getByRole("button", { name: /Migrar mesmo assim/ }))
        expect(onDecide.mock.calls).toEqual([[{ status: "rejeitada" }], [{ status: "aprovada" }]])
    })

    it("migrar: Aprovar e Rejeitar; texto acima do limite não aprova", () => {
        const onDecide = vi.fn()
        render(<ReviewItem item={{ ...item("migrar"), final: { texto: "x".repeat(200), categoria: null } }} categories={[]} textMax={100} onDecide={onDecide} />)
        expect(screen.getByRole("button", { name: /^Aprovar/ })).toBeDisabled()
        expect(screen.getByRole("button", { name: /Rejeitar/ })).toBeEnabled()
    })
})
