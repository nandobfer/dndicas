/** @vitest-environment happy-dom */
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PermissionsProvider } from "@nandobfer/perfix/react"
import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig } from "@engramind/client"
import { flowItems, xyflowMock } from "../../helpers/xyflow"
import type { UniverseLayoutDto } from "@/features/engramind/types"

vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const hooks = vi.hoisted(() => ({
    data: null as UniverseLayoutDto | null,
    save: vi.fn(async (_config: unknown): Promise<unknown> => undefined),
    reset: vi.fn(),
}))
vi.mock("@/features/engramind/hooks/useUniverseLayout", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/engramind/hooks/useUniverseLayout")>()),
    useUniverseLayout: () => ({ data: hooks.data, isLoading: false, error: null, refetch: vi.fn() }),
    useSaveUniverseLayout: () => ({ mutateAsync: hooks.save, isPending: false }),
    useResetUniverseLayout: () => ({ mutate: hooks.reset, isPending: false }),
}))

const { UniverseLayoutTab } = await import("@/features/engramind/components/integration/universe-layout/UniverseLayoutTab")

const spiral: UniverseLayoutConfig = { ...DEFAULT_UNIVERSE_LAYOUT, layout: "spiral", ringGap: 84 }
const renderTab = (permissions: string[] = ["integrations.engramind.view", "memories.edit"]) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <PermissionsProvider permissions={permissions}>
                <UniverseLayoutTab />
            </PermissionsProvider>
        </QueryClientProvider>,
    )
const axiosError = (status: number, data: unknown) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } })
const openImport = () => {
    fireEvent.click(screen.getByRole("button", { name: /Importar/ }))
    return screen.getByRole("dialog")
}
const typeJson = (dialog: HTMLElement, text: string) => fireEvent.change(within(dialog).getByLabelText("JSON a importar"), { target: { value: text } })
const particlePositions = () => JSON.stringify(flowItems.nodes.map((node) => (node as unknown as { position?: unknown }).position))

beforeEach(() => {
    hooks.data = { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }
    hooks.save.mockReset()
    hooks.save.mockResolvedValue(undefined)
    hooks.reset.mockReset()
})

describe("aba Visualização (sem formulário)", () => {
    it("só ações e prévia: nenhum campo de layout (slider, anel, espiral, desvio, partícula)", () => {
        renderTab()
        expect(screen.getByTestId("universe-layout-status")).toHaveTextContent("o padrão da lib")
        expect(screen.getByRole("button", { name: /Importar/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Restaurar padrão/ })).toBeDisabled()
        expect(screen.queryByRole("slider")).toBeNull()
        for (const label of [/Disposição/, /Distância entre os anéis/, /Desvio/, /Tamanho/]) expect(screen.queryByLabelText(label)).toBeNull()
        // Os únicos campos são os da prévia (quantidade e canais de exemplo), que não fazem parte da configuração.
        expect(screen.getAllByRole("spinbutton").map((input) => input.id)).toEqual(["universe-preview-count", "universe-preview-channels"])
        expect(screen.getByTestId("universe-preview")).toBeInTheDocument()
    })

    it("Exportar mostra o JSON no formato do Opex ($schema e version) e copia", async () => {
        hooks.data = { config: spiral, isDefault: false, updatedAt: "2026-11-08T03:00:00.000Z" }
        const writeText = vi.fn(async () => undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        renderTab()
        expect(screen.getByTestId("universe-layout-status")).toHaveTextContent("configuração importada em")
        fireEvent.click(screen.getByRole("button", { name: /Exportar/ }))
        const json = JSON.parse((screen.getByLabelText("JSON da visualização") as HTMLTextAreaElement).value)
        expect(json).toEqual({ $schema: "engramind-universe-layout", version: 1, ...spiral })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: /Copiar/ })))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"$schema": "engramind-universe-layout"'))
    })

    it("Importar com JSON inválido lista os erros em pt-BR por campo e não grava nada", async () => {
        renderTab()
        const dialog = openImport()
        typeJson(dialog, '{ "layout": "hexagono", "cor": 1 }')
        await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /^Importar$/ })))
        const alert = within(dialog).getByRole("alert")
        expect(alert).toHaveTextContent('Campo desconhecido: "cor"')
        expect(alert).toHaveTextContent("layout")
        expect(hooks.save).not.toHaveBeenCalled()
        typeJson(dialog, "{ nao é json")
        await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /^Importar$/ })))
        expect(within(dialog).getByRole("alert")).toHaveTextContent("JSON inválido")
        expect(hooks.save).not.toHaveBeenCalled()
    })

    it("Importar com o JSON do Opex (ou só os campos alterados) grava na hora a configuração completa", async () => {
        renderTab()
        const dialog = openImport()
        typeJson(dialog, '{ "$schema": "engramind-universe-layout", "version": 1, "layout": "spiral", "ringGap": 84 }')
        await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /^Importar$/ })))
        expect(hooks.save).toHaveBeenCalledWith(spiral)
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("recusa do servidor aparece na lista de erros e o diálogo continua aberto", async () => {
        hooks.save.mockRejectedValue(axiosError(400, { success: false, error: "Configuração inválida", code: "UNIVERSE_LAYOUT_INVALID", details: [{ path: "ringGap", message: "Distância entre os anéis: use de 16 a 400" }] }))
        renderTab()
        const dialog = openImport()
        typeJson(dialog, '{ "ringGap": 84 }')
        await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /^Importar$/ })))
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Distância entre os anéis: use de 16 a 400")
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("Restaurar padrão pede confirmação", () => {
        hooks.data = { config: spiral, isDefault: false, updatedAt: null }
        renderTab()
        fireEvent.click(screen.getByRole("button", { name: /Restaurar padrão/ }))
        expect(hooks.reset).not.toHaveBeenCalled()
        const dialog = screen.getByRole("alertdialog")
        fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar padrão" }))
        expect(hooks.reset).toHaveBeenCalledTimes(1)
    })

    it("sem memories.edit: só Exportar (sem Importar nem Restaurar)", () => {
        renderTab(["integrations.engramind.view", "integrations.engramind.edit"])
        expect(screen.queryByRole("button", { name: /Importar/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /Restaurar padrão/ })).toBeNull()
        expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument()
    })

    it("a prévia desenha com a configuração em uso (anéis × espiral mudam as posições)", () => {
        const { unmount } = renderTab()
        const rings = particlePositions()
        unmount()
        hooks.data = { config: spiral, isDefault: false, updatedAt: null }
        renderTab()
        expect(particlePositions()).not.toBe(rings)
    })
})
