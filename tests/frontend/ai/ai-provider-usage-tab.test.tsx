/** @vitest-environment happy-dom */
import * as React from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import type { Draft } from "@/features/integrations/components/detail/draft"

const usage = vi.hoisted(() => ({ hook: vi.fn(), tab: "consumo" }))
vi.mock("@/features/ai/hooks/useOpencodeUsage", () => ({ useOpencodeUsage: usage.hook }))
vi.mock("@/hooks/useUrlFilters", () => ({
    urlFilterCodecs: { string: () => ({}) },
    useUrlFilters: (defaults: Record<string, string>) => [defaults, vi.fn()],
}))
vi.mock("@/features/integrations/components/tabs/useIntegrationTab", () => ({
    useIntegrationTab: () => ({ tab: usage.tab, requestTab: vi.fn(), pendingTab: null, confirmDiscard: vi.fn(), cancelDiscard: vi.fn() }),
}))
vi.mock("@/features/integrations/components/detail/DetailHeader", () => ({ DetailHeader: () => null }))
vi.mock("@/features/ai/components/JevUsageCard", () => ({ JevUsageCard: () => <p>Consumo do Jev</p> }))
vi.mock("@/features/ai/components/AiModelsCard", () => ({ AiModelsCard: () => null }))

import { AiProviderEditorForm } from "@/features/ai/components/AiProviderEditorForm"

const draft: Draft = { environment: "externo", debugMode: false, swaggerUrl: "", publicValues: {}, secrets: {} }

function renderProvider(id: IntegrationId) {
    return render(
        <AiProviderEditorForm
            def={getIntegrationDef(id)}
            data={{} as IntegrationDetailDto}
            draft={draft}
            setDraft={vi.fn()}
            dirty={false}
            pending={false}
            onSave={vi.fn(async () => true)}
            onUndo={vi.fn()}
        />,
    )
}

describe("aba Consumo do formulário de provedor de IA", () => {
    beforeEach(() => {
        usage.tab = "consumo"
        usage.hook.mockReset().mockReturnValue({
            data: { origins: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, coverageFrom: null },
            isLoading: false,
            isError: false,
            isFetching: false,
            refetch: vi.fn(),
        })
    })

    it("OpenCode Go: mostra o painel do Go, com o consumo filtrado pelo provedor", () => {
        renderProvider("ai_opencode_go")

        expect(screen.getByText("Consumo do OpenCode Go")).toBeInTheDocument()
        expect(usage.hook).toHaveBeenCalledWith(expect.anything(), "opencode-go")
        expect(usage.hook).not.toHaveBeenCalledWith(expect.anything(), "opencode")
    })

    it("OpenCode de sessão continua com o próprio painel", () => {
        renderProvider("ai_opencode")

        expect(screen.getByText("Consumo do OpenCode")).toBeInTheDocument()
        expect(usage.hook).toHaveBeenCalledWith(expect.anything(), "opencode")
    })
})
