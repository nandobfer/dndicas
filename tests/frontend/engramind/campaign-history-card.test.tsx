/** @vitest-environment happy-dom */
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { MemoryMigrationDto, MigrationStepDto } from "@/features/engramind/types"

const run = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock("@/features/engramind/hooks/useEngramind", () => ({ useMigrationHistory: () => run }))

const { CampaignHistoryCard } = await import("@/features/engramind/components/integration/migration/CampaignHistoryCard")

const idle: MigrationStepDto = { status: "idle", error: null, startedAt: null, finishedAt: null, progress: null }
const state = (over: Partial<MemoryMigrationDto> = {}): MemoryMigrationDto =>
    ({
        steps: { backup: idle, triage: idle, compact: idle, import: idle, history: idle },
        campaigns: [{ campaignId: "c1", name: "Brumas", source: 1, imported: 3, verified: 3, deleted: 0, error: "1 memória(s) passam do limite de texto do Engramind" }],
        campaignBackups: [],
        ...over,
    }) as MemoryMigrationDto

describe("Memórias das campanhas (aba Migração)", () => {
    it("lista os backups do mais recente ao mais antigo, cada um com o link de download pelo id", () => {
        render(
            <CampaignHistoryCard
                state={state({
                    campaignBackups: [
                        { id: "campaign-memories-b2", count: 1, sha256: "bbbbbbbbbbbbbbbbbbbb", createdAt: "2026-11-06T12:00:00.000Z" },
                        { id: "campaign-memories-b1", count: 4, sha256: "aaaaaaaaaaaaaaaaaaaa", createdAt: "2026-11-05T12:00:00.000Z" },
                    ],
                })}
            />,
        )
        const items = within(screen.getByRole("list", { name: "Backups das memórias das campanhas" })).getAllByRole("listitem")
        expect(items).toHaveLength(2)
        expect(items[0]).toHaveTextContent("1 memória(s), SHA-256 bbbbbbbbbbbb")
        expect(items[1]).toHaveTextContent("4 memória(s), SHA-256 aaaaaaaaaaaa")
        expect(within(items[0]!).getByRole("link", { name: /Baixar/ })).toHaveAttribute("href", "/api/engramind/migration/campaigns?id=campaign-memories-b2")
        expect(within(items[1]!).getByRole("link", { name: /Baixar/ })).toHaveAttribute("href", "/api/engramind/migration/campaigns?id=campaign-memories-b1")
        expect(screen.getByText(/passam do limite de texto/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Mover memórias \(1\)/ })).toBeEnabled()
    })

    it("sem backups, não mostra a lista", () => {
        render(<CampaignHistoryCard state={state()} />)
        expect(screen.queryByTestId("campaign-backups")).not.toBeInTheDocument()
    })
})
