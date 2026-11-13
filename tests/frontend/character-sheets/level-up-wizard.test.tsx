/** @vitest-environment happy-dom */
import * as React from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LevelUpOptions } from "@/features/character-sheets/level-up/level-up-types"

/**
 * DND-56: wizard "Subir de nível" guiado pelas opções do servidor, com a nova etapa de magias e truques. A tela só junta as
 * escolhas e avisa o que falta; quem valida e aplica é o servidor.
 */

const mocks = vi.hoisted(() => ({ options: null as LevelUpOptions | null, mutateAsync: vi.fn(), subclassArgs: [] as (string | null)[] }))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useSheetLevelUp: (_sheetId: string, subclassId: string | null) => {
        mocks.subclassArgs.push(subclassId)
        return { data: { options: mocks.options, campaign: null, unavailable: null }, isLoading: false, error: null }
    },
    useApplySheetLevelUp: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}))

vi.mock("@/core/ui/select", () => {
    const Ctx = React.createContext<{ value: string; onValueChange: (value: string) => void; label?: string }>({ value: "", onValueChange: () => undefined })
    return {
        Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
        SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        SelectValue: () => null,
        SelectContent: ({ children }: { children: React.ReactNode }) => <div role="listbox">{children}</div>,
        SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
            const ctx = React.useContext(Ctx)
            return (
                <button type="button" role="option" aria-selected={ctx.value === value} onClick={() => ctx.onValueChange(value)}>
                    {children}
                </button>
            )
        },
    }
})

vi.mock("@/features/dice-roller/components/hp-dice-panel", () => ({
    HpDicePanel: ({ onRollResolved }: { onRollResolved: (total: number) => void }) => (
        <button type="button" onClick={() => onRollResolved(6)}>
            Usar rolagem de PV
        </button>
    ),
}))

vi.mock("@/features/rules/components/entity-preview-tooltip", () => ({
    TraitPreview: ({ trait }: { trait: { name: string } }) => <div data-testid="trait-preview">{trait.name}</div>,
}))
vi.mock("@/features/traits/api/traits-api", () => ({ fetchTraitById: vi.fn(async (id: string) => ({ _id: id, id, name: `Traço ${id}`, description: "", status: "active" })) }))

const { LevelUpWizard } = await import("@/features/character-sheets/components/level-up/level-up-wizard")

const caster = (): LevelUpOptions => ({
    sheetId: "sheet-1",
    currentLevel: 2,
    targetLevel: 3,
    className: "Mago",
    hitDie: "d6",
    hitDieSides: 6,
    constitutionModifier: 2,
    hpAverage: 5,
    hpMax: 13,
    subclass: { required: true, options: [{ id: "sub-1", name: "Evocador" }, { id: "sub-2", name: "Ilusionista" }], current: null },
    feat: null,
    traits: [{ id: "t-1", label: "Erudito", source: "classe" }],
    subclassTraits: { "sub-1": [{ id: "t-2", label: "Evocação Esculpida", source: "subclasse" }], "sub-2": [] },
    spells: {
        cantrips: 1,
        spells: 2,
        maxCircle: 2,
        cantripOptions: [{ id: "c-1", name: "Luz", circle: 0 }, { id: "c-2", name: "Raio de Gelo", circle: 0 }],
        spellOptions: [{ id: "s-1", name: "Sono", circle: 1 }, { id: "s-2", name: "Escudo Arcano", circle: 1 }, { id: "s-3", name: "Invisibilidade", circle: 2 }],
        known: [{ id: "k-1", catalogId: "x-1", name: "Mísseis Mágicos", circle: 1 }],
        swap: { allowed: true, source: "Conjuração: “substituir uma magia”" },
    },
    spellSlots: { before: { "1": 3 }, after: { "1": 4, "2": 2 } },
    resources: [{ name: "Recuperação Arcana", before: 1, after: 2 }],
    scores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 17, wisdom: 12, charisma: 10 },
})

function renderWizard(onOpenChange = vi.fn(), onDone = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <LevelUpWizard sheetId="sheet-1" open onOpenChange={onOpenChange} onDone={onDone} characterName="Vaelyra" />
        </QueryClientProvider>,
    )
    return { onOpenChange, onDone }
}

beforeEach(() => {
    mocks.options = caster()
    mocks.mutateAsync.mockReset().mockResolvedValue({ gains: { toLevel: 3 } })
    mocks.subclassArgs = []
})

describe("LevelUpWizard", () => {
    it("mostra PV, subclasse, traços, magias e recursos; sem a subclasse, avisa e não envia", async () => {
        renderWizard()
        expect(screen.getByText("Nível 2 -> 3")).toBeInTheDocument()
        expect(screen.getByText("13 -> 18")).toBeInTheDocument()
        expect(screen.getByTestId("level-up-spells")).toHaveTextContent("Até o 2º círculo")
        expect(screen.getByTestId("level-up-resources")).toHaveTextContent("Recuperação Arcana")
        expect(screen.getByTestId("level-up-resources")).toHaveTextContent("Espaços de 2º círculo")
        expect(await screen.findByText("Traço t-1")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
        expect(screen.getByRole("alert")).toHaveTextContent("Escolha uma subclasse para confirmar o nível 3.")
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
    })

    it("subclasse, truque, magias com limite e troca opcional: envia as escolhas e fecha", async () => {
        const { onOpenChange, onDone } = renderWizard()
        fireEvent.click(within(screen.getByTestId("level-up-subclass")).getByRole("option", { name: "Evocador" }))
        expect(mocks.subclassArgs.at(-1)).toBe("sub-1")
        expect(await screen.findByText("Traço t-2")).toBeInTheDocument()
        fireEvent.click(within(screen.getByTestId("level-up-cantrips")).getByLabelText("Raio de Gelo"))
        const spells = screen.getByTestId("level-up-new-spells")
        fireEvent.click(within(spells).getByLabelText("Sono"))
        fireEvent.click(within(spells).getByLabelText("Escudo Arcano"))
        fireEvent.click(within(spells).getByLabelText("Invisibilidade"))
        expect(spells).toHaveTextContent("Magias novas (2/2)")
        const swap = screen.getByTestId("level-up-swap")
        fireEvent.click(within(swap).getByRole("option", { name: "Mísseis Mágicos (1º)" }))
        fireEvent.click(within(swap).getAllByRole("option", { name: "Sono (1º)" })[0]!)
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
        await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled())
        expect(mocks.mutateAsync).toHaveBeenCalledWith({ targetLevel: 3, hp: { method: "average" }, subclassId: "sub-1", feat: null, cantrips: ["c-2"], spells: ["s-2", "s-3"], swap: { remove: "k-1", add: "s-1" } })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
        expect(onDone).toHaveBeenCalledWith({ toLevel: 3 })
    })

    it("rolagem: o dado da tela substitui a média (total menos a CON)", async () => {
        mocks.options = { ...caster(), subclass: { required: false, options: [], current: null }, spells: null }
        renderWizard()
        fireEvent.click(within(screen.getByTestId("level-up-hp")).getByRole("button", { name: "Rolar d6" }))
        fireEvent.click(screen.getByRole("button", { name: "Usar rolagem de PV" }))
        expect(screen.getByText("13 -> 19")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
        await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ hp: { method: "roll", die: 4 } })))
    })

    it("classe sem conjuração não tem a etapa de magias; a melhoria exige +2 distribuído; erro do servidor aparece", async () => {
        mocks.options = {
            ...caster(),
            subclass: { required: false, options: [], current: { id: "sub-1", name: "Campeão" } },
            spells: null,
            feat: { kind: "general", cap: 20, options: [{ id: "f-1", name: "Aumento no Valor de Atributo", category: "Geral", attributeRule: { kind: "asi" } }] },
        }
        mocks.mutateAsync.mockRejectedValueOnce(new Error("A ficha mudou de nível enquanto isso. Abra o wizard de novo."))
        renderWizard()
        expect(screen.queryByTestId("level-up-spells")).not.toBeInTheDocument()
        fireEvent.click(within(screen.getByTestId("level-up-feat")).getByRole("option", { name: "Aumento no Valor de Atributo" }))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
        expect(screen.getByRole("alert")).toHaveTextContent("Distribua +2 em um atributo ou +1 em dois.")
        const attributes = screen.getByTestId("level-up-feat-attributes")
        const intelligence = within(attributes).getByText("Inteligência").closest("div")!
        fireEvent.click(within(intelligence).getByRole("button", { name: "+2" }))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("A ficha mudou de nível enquanto isso.")
        expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ feat: { id: "f-1", attributes: { intelligence: 2 } } }))
    })
})
