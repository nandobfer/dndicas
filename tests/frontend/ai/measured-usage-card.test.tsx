/** @vitest-environment happy-dom */
import * as React from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const usage = vi.hoisted(() => ({ hook: vi.fn() }))
vi.mock("@/features/ai/hooks/useOpencodeUsage", () => ({ useOpencodeUsage: usage.hook }))
vi.mock("@/hooks/useUrlFilters", () => ({
    urlFilterCodecs: { string: () => ({}) },
    useUrlFilters: (defaults: Record<string, string>) => [defaults, vi.fn()],
}))

import { OpencodeUsageCard } from "@/features/ai/components/OpencodeUsageCard"
import { AI_PROVIDER_TAB_IDS } from "@/features/ai/constants"

const summary = {
    origins: [{ origin: "opex-agent", label: "Agente Opex", requests: 2, inputTokens: 70, outputTokens: 26, totalTokens: 96, costUsd: 0.00001566 }],
    total: { requests: 2, inputTokens: 70, outputTokens: 26, totalTokens: 96, costUsd: 0.00001566 },
    coverageFrom: null,
}

describe("painel de consumo medido por provedor", () => {
    beforeEach(() => {
        usage.hook.mockReset().mockReturnValue({ data: summary, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
    })

    it("o OpenCode Go tem a aba Consumo, como o OpenCode", () => {
        expect(AI_PROVIDER_TAB_IDS["opencode-go"]).toEqual(["configuracao", "modelos", "consumo"])
        expect(AI_PROVIDER_TAB_IDS.deepseek).not.toContain("consumo")
    })

    it("OpenCode Go: título próprio e consulta filtrada pelo provedor", () => {
        render(<OpencodeUsageCard provider="opencode-go" />)

        expect(screen.getByText("Consumo do OpenCode Go")).toBeInTheDocument()
        expect(screen.getByText("Agente Opex")).toBeInTheDocument()
        expect(usage.hook).toHaveBeenCalledWith(expect.anything(), "opencode-go")
    })

    it("sem provedor, continua sendo o painel do OpenCode", () => {
        render(<OpencodeUsageCard />)

        expect(screen.getByText("Consumo do OpenCode")).toBeInTheDocument()
        expect(usage.hook).toHaveBeenCalledWith(expect.anything(), "opencode")
    })

    it("vazio do OpenCode Go fala do próprio provedor", () => {
        usage.hook.mockReturnValue({ data: { ...summary, origins: [] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
        render(<OpencodeUsageCard provider="opencode-go" />)

        expect(screen.getByText("Nenhum uso do OpenCode Go neste período")).toBeInTheDocument()
    })
})
