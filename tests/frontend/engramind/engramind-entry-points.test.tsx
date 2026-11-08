/** @vitest-environment happy-dom */
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { IntegrationDetailDto } from "@/features/integrations/types"

/**
 * Quem liga o Engramind na aplicação: o ramo `engramind` do `IntegrationEditor` (as abas da integração) e as
 * páginas `/memorias` e `/memorias/canais/[channel]` (configurado, permissão de configurar e os nomes das
 * campanhas para os rótulos dos canais repassados).
 */

const access = vi.hoisted(() => ({ effective: new Set<string>(["memories.view"]) }))
const connection = vi.hoisted(() => ({ value: null as unknown }))
const campaignNames = vi.hoisted(() => vi.fn(async () => [{ id: "6650f1a2b3c4d5e6f7a8b9c0", name: "Águas de Prata" }]))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({
    useUpdateIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
    integrationErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock("@/features/engramind/hooks/useEngramind", () => ({
    useEngramindRealtime: () => undefined,
    useEngramindBootstrap: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/engramind/components/integration/ConnectionTab", () => ({ ConnectionTab: () => <p>conteúdo da aba Conexão</p> }))
vi.mock("@/features/engramind/components/integration/migration/MigrationTab", () => ({ MigrationTab: () => <p>conteúdo da aba Migração</p> }))
vi.mock("@/features/engramind/components/integration/SyncTab", () => ({ SyncTab: () => <p>conteúdo da aba Sincronização</p> }))
vi.mock("@/features/perfix/server/page-access", () => ({ pageAccess: vi.fn(async () => ({ effective: access.effective })) }))
vi.mock("@/features/engramind/server/client", () => ({ engramindConnection: vi.fn(async () => connection.value) }))
vi.mock("@/features/engramind/server/channel-labels", () => ({ listCampaignChannelNames: campaignNames }))
vi.mock("@/features/engramind/components/page/MemoriasPage", () => ({
    MemoriasPage: ({ configured, canConfigure, campaigns }: { configured: boolean; canConfigure: boolean; campaigns?: { name: string }[] }) => <p data-testid="memorias">{`rede configured=${configured} canConfigure=${canConfigure} campanhas=${campaigns?.map((item) => item.name).join(",")}`}</p>,
    MemoriesChannelPage: ({ slug, configured, canConfigure, campaigns }: { slug: string; configured: boolean; canConfigure: boolean; campaigns?: { name: string }[] }) => <p data-testid="memorias">{`canal ${slug} configured=${configured} canConfigure=${canConfigure} campanhas=${campaigns?.map((item) => item.name).join(",")}`}</p>,
}))

const { IntegrationEditor } = await import("@/features/integrations/components/detail/IntegrationEditor")
const MemoriasRoute = (await import("@/app/(dashboard)/memorias/page")).default
const ChannelRoute = (await import("@/app/(dashboard)/memorias/canais/[channel]/page")).default

const detail: IntegrationDetailDto = {
    id: "engramind",
    name: "Engramind",
    description: "",
    environment: "externo",
    debugMode: false,
    publicValues: { baseUrl: "https://engramind.test", publicAppUrl: "" },
    secrets: { appToken: { configured: true, source: "db", unreadable: false } },
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok", message: null, checkedAt: null } as never,
    swaggerUrl: null,
    explorerAuth: null,
}

beforeEach(() => {
    access.effective = new Set(["memories.view"])
    connection.value = null
})

describe("IntegrationEditor com a integração Engramind", () => {
    it("mostra o formulário do Engramind com as abas Conexão, Migração e Sincronização", () => {
        render(<IntegrationEditor id="engramind" data={detail} />)
        for (const name of ["Conexão", "Migração", "Sincronização"]) expect(screen.getByRole("tab", { name: new RegExp(name) })).toBeInTheDocument()
        expect(screen.getByText("conteúdo da aba Conexão")).toBeInTheDocument()
    })
})

describe("páginas /memorias", () => {
    it("sem a integração configurada, repassa configured=false e a permissão de configurar", async () => {
        access.effective = new Set(["memories.view", "integrations.engramind.edit"])
        campaignNames.mockClear()
        render(await MemoriasRoute())
        expect(screen.getByTestId("memorias")).toHaveTextContent("rede configured=false canConfigure=true campanhas=")
        expect(campaignNames).not.toHaveBeenCalled()
    })

    it("configurada e sem permissão de configurar", async () => {
        connection.value = { baseUrl: "https://engramind.test", appToken: "t", agentTokens: {} }
        render(await MemoriasRoute())
        expect(screen.getByTestId("memorias")).toHaveTextContent("rede configured=true canConfigure=false campanhas=Águas de Prata")
    })

    it("página do canal decodifica o slug e repassa o estado da integração", async () => {
        connection.value = { baseUrl: "https://engramind.test", appToken: "t", agentTokens: {} }
        render(await ChannelRoute({ params: Promise.resolve({ channel: encodeURIComponent("dndicas/maddox") }) }))
        expect(screen.getByTestId("memorias")).toHaveTextContent("canal dndicas/maddox configured=true canConfigure=false campanhas=Águas de Prata")
        connection.value = null
        render(await ChannelRoute({ params: Promise.resolve({ channel: "dndicas%2Fopex%2Fglobal" }) }))
        expect(screen.getAllByTestId("memorias")[1]).toHaveTextContent("canal dndicas/opex/global configured=false")
    })
})
