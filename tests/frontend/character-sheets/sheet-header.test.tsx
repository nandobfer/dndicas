import * as React from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SheetHeader } from "@/features/character-sheets/components/sheet-header"
import type { CharacterItem, CharacterSheet, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

const mockClassData = vi.hoisted(() => ({
    data: {
        _id: "class-1",
        name: "Guerreiro",
        hitDice: "d10" as const,
        traits: [
            { level: 3, description: "<p><span data-type=\"mention\" data-id=\"trait-1\" data-entity-type=\"Habilidade\" data-label=\"Especialização marcial\" class=\"mention\">Especialização marcial</span></p>" },
        ],
        spellcasting: true,
        progressionTable: {},
        subclasses: [
            {
                _id: "subclass-1",
                name: "Campeão",
                color: "#22c55e",
                spellcasting: false,
                traits: [
                    { level: 3, description: "<p><span data-type=\"mention\" data-id=\"trait-2\" data-entity-type=\"Habilidade\" data-label=\"Crítico aprimorado\" class=\"mention\">Crítico aprimorado</span></p>" },
                ],
                progressionTable: {},
            },
        ],
    },
}))

const mockRaceData = vi.hoisted(() => ({
    data: {
        _id: "race-1",
        name: "Humano",
        traits: [
            { name: "Versatilidade heroica", level: 3, description: "<p>Versatilidade heroica</p>" },
        ],
    },
}))

vi.mock("@/features/classes/api/classes-queries", () => ({
    useClass: () => mockClassData,
}))

vi.mock("@/features/races/api/races-queries", () => ({
    useRace: () => mockRaceData,
}))

vi.mock("@/features/classes/components/class-progression-table", () => ({
    ClassProgressionTable: () => <div data-testid="class-progression-table">Tabela de progressao</div>,
}))

vi.mock("@/features/rules/components/entity-preview-tooltip", () => ({
    TraitPreview: ({ trait }: { trait: { name: string } }) => <div data-testid="trait-preview">{trait.name}</div>,
}))

vi.mock("@/features/traits/api/traits-api", () => ({
    fetchTraitById: vi.fn(async (id: string) => ({
        _id: id,
        id,
        name: id === "trait-1" ? "Especialização marcial" : "Crítico aprimorado",
        description: `<p>${id === "trait-1" ? "Especialização marcial" : "Crítico aprimorado"}</p>`,
        source: "Livro do Jogador",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    })),
}))

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: ({ onRollResolved }: { onRollResolved?: (result: {
        rollId: string
        terms: Array<{ dice: string; quantity: number; results: number[] }>
        mode: "normal"
        diceTotal: number
        modifier: number
        total: number
        createdAt: string
    }) => void }) => (
        <button
            type="button"
            onClick={() => onRollResolved?.({
                rollId: "roll-1",
                terms: [{ dice: "d10", quantity: 1, results: [9] }],
                mode: "normal",
                diceTotal: 9,
                modifier: 0,
                total: 9,
                createdAt: "2026-01-01T00:00:00.000Z",
            })}
        >
            Usar rolagem de PV
        </button>
    ),
}))

vi.mock("@/features/character-sheets/components/sheet-input", () => ({
    SheetInput: ({
        label,
        value,
        onChange,
        onChangeValue,
    }: {
        label?: string
        value?: string | number
        onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
        onChangeValue?: (value: string) => void
    }) => (
        <input
            aria-label={label ?? "sheet-input"}
            value={String(value ?? "")}
            onChange={(event) => {
                onChange?.(event)
                onChangeValue?.(event.target.value)
            }}
        />
    ),
}))

function buildMentionHtml(label: string, entityType?: string, mentionParentClassId?: string | null) {
    const normalizedLabel = label.trim()
    if (!normalizedLabel || !entityType) return label

    const mentionId = entityType === "Subclasse"
        ? `subclass:${mentionParentClassId ?? "class-1"}:subclass-1`
        : entityType === "Talento"
            ? "feat-1"
            : `${entityType.toLowerCase()}-1`

    return `<p><span data-type="mention" data-id="${mentionId}" data-entity-type="${entityType}" data-label="${normalizedLabel}" class="mention">${normalizedLabel}</span></p>`
}

vi.mock("@/features/character-sheets/components/compact-rich-input", () => ({
    CompactRichInput: ({
        label,
        value,
        onChange,
        specificEntityMention,
        mentionParentClassId,
    }: {
        label?: string
        value: string
        onChange: (value: string) => void
        specificEntityMention?: string
        mentionParentClassId?: string | null
    }) => (
        <input
            aria-label={label ?? "compact-rich-input"}
            value={String(value).replace(/<[^>]*>/g, "")}
            onChange={(event) => onChange(buildMentionHtml(event.target.value, specificEntityMention, mentionParentClassId))}
        />
    ),
}))

const glassImageUploaderMocks = vi.hoisted(() => ({
    render: vi.fn(),
}))

vi.mock("@/components/ui/glass-image-uploader", () => ({
    GlassImageUploader: (props: {
        onChange: (value: string) => void
        onRemove: () => void
        getAIPayload?: () => unknown
        aiContextLabel?: string
        label?: string
    }) => glassImageUploaderMocks.render(props),
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({
        src,
        alt,
        renderTrigger,
    }: {
        src: string
        alt: string
        renderTrigger?: (props: { open: () => void; label: string; isOpen: boolean }) => React.ReactNode
    }) => renderTrigger
        ? (
            <div data-testid="glass-image-trigger-wrapper" data-src={src} aria-label={alt}>
                {renderTrigger({ open: vi.fn(), label: `Abrir imagem ampliada de ${alt}`, isOpen: false })}
            </div>
        )
        : <div data-testid="glass-image" data-src={src} aria-label={alt} />,
}))

vi.mock("@/components/ui/glass-selector", () => ({
    GlassSelector: ({ value }: { value: string }) => <div>{value}</div>,
}))

vi.mock("@/features/character-sheets/components/calc-tooltip", () => ({
    CalcTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/character-sheets/hooks/use-character-calculations", () => ({
    useCharacterCalculations: () => ({
        armorClass: {
            formula: "10 + DES",
            parts: [],
            result: 12,
            value: 12,
        },
    }),
}))

vi.mock("@/features/character-sheets/hooks/use-sheet-mention-sync", () => ({
    syncMentionBoundResourceCharges: vi.fn(async ({ currentRows }: { currentRows: CharacterSheet["resourceCharges"] }) => currentRows),
}))

const baseSheet: CharacterSheet = {
    _id: "sheet-1",
    slug: "kael",
    userId: "user-1",
    username: "kael",
    name: "Kael",
    class: "Guerreiro",
    classRef: "class-1",
    subclass: "",
    subclassRef: null,
    level: 2,
    experience: "0",
    race: "Humano",
    raceRef: "race-1",
    origin: "Soldado",
    originRef: null,
    inspiration: false,
    multiclassNotes: "",
    photo: null,
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    appearance: "",
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 11,
    charisma: 8,
    proficiencyBonusOverride: null,
    savingThrows: {
        strength: false,
        dexterity: false,
        constitution: false,
        intelligence: false,
        wisdom: false,
        charisma: false,
    },
    skills: {
        Acrobacia: { proficient: false, expertise: false },
        Arcanismo: { proficient: false, expertise: false },
        Atletismo: { proficient: false, expertise: false },
        Atuação: { proficient: false, expertise: false },
        Enganação: { proficient: false, expertise: false },
        Furtividade: { proficient: false, expertise: false },
        História: { proficient: false, expertise: false },
        Intimidação: { proficient: false, expertise: false },
        Intuição: { proficient: false, expertise: false },
        Investigação: { proficient: false, expertise: false },
        "Lidar com Animais": { proficient: false, expertise: false },
        Medicina: { proficient: false, expertise: false },
        Natureza: { proficient: false, expertise: false },
        Percepção: { proficient: false, expertise: false },
        Persuasão: { proficient: false, expertise: false },
        Prestidigitação: { proficient: false, expertise: false },
        Religião: { proficient: false, expertise: false },
        Sobrevivência: { proficient: false, expertise: false },
    },
    movementSpeed: "9m",
    hpMax: 20,
    hpCurrent: 18,
    hpTemp: 0,
    hitDiceTotal: "d10",
    hitDiceUsed: 0,
    deathSavesSuccess: 0,
    deathSavesFailure: 0,
    armorClassOverride: null,
    armorClassBonus: null,
    initiativeOverride: null,
    initiativeProficiency: false,
    passivePerceptionOverride: null,
    spellcastingAttribute: null,
    spellSaveDCOverride: null,
    spellAttackBonusOverride: null,
    spellSlots: {},
    resourceCharges: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    history: "",
    notes: "",
    classFeatures: "",
    speciesTraits: "",
    featuresNotes: "",
    size: "Médio",
    armorTraining: { light: true, medium: true, heavy: true, shields: true },
    weaponProficiencies: "",
    toolProficiencies: "",
    computedArmorClass: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

function createHarness(overrides: Partial<CharacterSheet> = {}) {
    const sheet = { ...baseSheet, ...overrides }
    const form = {
        watch: ((field?: keyof PatchSheetBody) => {
            if (!field) return {}
            return sheet[field]
        }) as {
            (): PatchSheetBody
            <TFieldName extends keyof PatchSheetBody>(name: TFieldName): PatchSheetBody[TFieldName]
        },
        setFieldLocally: () => undefined,
        patchField: vi.fn(),
    }

    return { sheet, form }
}

describe("SheetHeader", () => {
    beforeEach(() => {
        glassImageUploaderMocks.render.mockReset()
        glassImageUploaderMocks.render.mockImplementation(({
            onChange,
            onRemove,
        }: {
            onChange: (value: string) => void
            onRemove: () => void
        }) => (
            <div data-testid="glass-image-uploader">
                <button type="button" onClick={() => onChange("https://cdn.test/hero.webp")}>upload</button>
                <button type="button" onClick={onRemove}>remove</button>
            </div>
        ))
    })

    it("shows the image uploader in editable mode and persists photo changes", () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByRole("button", { name: "upload" }))
        expect(form.patchField).toHaveBeenCalledWith("photo", "https://cdn.test/hero.webp")

        fireEvent.click(screen.getByRole("button", { name: "remove" }))
        expect(form.patchField).toHaveBeenCalledWith("photo", null)
    })

    it("passes character context to the uploader AI action", () => {
        const { sheet, form } = createHarness({
            subclass: "<p>Campeao</p>",
            appearance: "<p>Armadura dourada e olhos azuis.</p>",
            history: "<p>Veterano da guarda real.</p>",
        })
        const items: CharacterItem[] = [
            {
                _id: "item-equipped",
                sheetId: sheet._id,
                catalogItemId: "armor-1",
                name: "<p>Armadura de placas</p>",
                image: null,
                quantity: 1,
                notes: "",
                equipped: true,
                catalogItemType: "armadura",
                catalogAc: 18,
                catalogAcType: "base",
                catalogArmorType: "pesada",
                catalogAcBonus: null,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
                _id: "item-unequipped",
                sheetId: sheet._id,
                catalogItemId: "weapon-1",
                name: "Espada longa",
                image: null,
                quantity: 1,
                notes: "",
                equipped: false,
                catalogItemType: "arma",
                catalogAc: null,
                catalogAcType: null,
                catalogArmorType: null,
                catalogAcBonus: null,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ]

        render(<SheetHeader sheet={sheet} form={form} items={items} />)

        const uploaderProps = glassImageUploaderMocks.render.mock.calls[0]?.[0] as {
            getAIPayload?: () => unknown
            aiContextLabel?: string
            label?: string
        } | undefined

        expect(uploaderProps?.aiContextLabel).toBe("Personagem")
        expect(uploaderProps?.label).toBeUndefined()
        expect(uploaderProps?.getAIPayload?.()).toMatchObject({
            name: "Kael",
            class: "Guerreiro",
            subclass: "Campeao",
            race: "Humano",
            origin: "Soldado",
            level: 2,
            appearance: "Armadura dourada e olhos azuis.",
            history: "Veterano da guarda real.",
            notes: null,
            equippedItems: [
                {
                    name: "Armadura de placas",
                    quantity: 1,
                    type: "armadura",
                },
            ],
        })
    })

    it("uses the tighter horizontal gap between identity field columns", () => {
        const { sheet, form } = createHarness()

        const { container } = render(<SheetHeader sheet={sheet} form={form} />)

        expect(container.querySelector(".grid.grid-cols-2.gap-x-4.gap-y-2")).toBeInTheDocument()
    })

    it("shows the view-photo action below the uploader when a photo exists in edit mode", () => {
        const { sheet, form } = createHarness({ photo: "https://cdn.test/hero.webp" })

        render(<SheetHeader sheet={sheet} form={form} />)

        expect(screen.getByTitle("Abrir imagem ampliada de Imagem de Kael")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Ver foto" })).toBeInTheDocument()
    })

    it("hides the view-photo action when there is no current photo", () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        expect(screen.queryByRole("button", { name: "Ver foto" })).not.toBeInTheDocument()
    })

    it("shows a static image instead of the uploader in read-only mode", () => {
        const { sheet, form } = createHarness({ photo: "https://cdn.test/hero.webp" })

        render(<SheetHeader sheet={sheet} form={form} isReadOnly />)

        expect(screen.getByTestId("glass-image")).toHaveAttribute("data-src", "https://cdn.test/hero.webp")
        expect(screen.queryByTestId("glass-image-uploader")).not.toBeInTheDocument()
    })

    it("shows the progression table trigger below the armor class shield and still opens the table", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        const bonusInput = screen.getByLabelText("Bônus")
        const progressionButton = screen.getByTestId("class-progression-button")

        expect(bonusInput.compareDocumentPosition(progressionButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(progressionButton).toHaveClass("whitespace-nowrap")
        expect(progressionButton).toHaveTextContent("progressão")
        expect(progressionButton.closest(".px-4.pt-4.pb-0")).toBeInTheDocument()

        fireEvent.click(progressionButton)

        expect(await screen.findByTestId("class-progression-table")).toBeInTheDocument()
    })

    it("shows the level-up button below XP in editable mode", () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        const xpInput = screen.getByLabelText("XP")
        const levelUpButton = screen.getByTestId("level-up-button")

        expect(xpInput.compareDocumentPosition(levelUpButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(levelUpButton).toHaveTextContent("Subir de nível")
        expect(levelUpButton.closest(".px-4.pt-4.pb-0")).toBeInTheDocument()
    })

    it("shows the level-up modal for 2 -> 3 with hp preview, new traits and required subclass", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))

        const modal = await screen.findByTestId("level-up-modal")
        expect(modal).toBeInTheDocument()
        expect(screen.getByText("Nível 2 -> 3")).toBeInTheDocument()
        expect(screen.getByText("Confira o que muda antes de aplicar a progressão do personagem.")).toBeInTheDocument()
        expect(screen.getByText("20 -> 27")).toBeInTheDocument()
        expect(screen.getByTestId("level-up-average-badge").parentElement).toHaveTextContent("Ganho de PV: 7")
        expect(await screen.findByText("Especialização marcial")).toBeInTheDocument()
        expect(screen.getByText("Versatilidade heroica")).toBeInTheDocument()
        expect(screen.getAllByTestId("trait-preview")).toHaveLength(2)
        expect(within(modal).getByLabelText("Subclasse")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

        expect(screen.getByText("Escolha uma subclasse para confirmar o nível 3.")).toBeInTheDocument()
        expect(form.patchField).not.toHaveBeenCalledWith("level", 3)
    })

    it("shows the required feat selector when leveling from 3 to 4", async () => {
        const { sheet, form } = createHarness({
            level: 3,
            subclass: "<p><span data-type=\"mention\" data-id=\"subclass:class-1:subclass-1\" data-entity-type=\"Subclasse\" data-label=\"Campeão\" class=\"mention\">Campeão</span></p>",
            subclassRef: "subclass-1",
        })

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))

        expect(await screen.findByTestId("level-up-modal")).toBeInTheDocument()
        expect(screen.getByText("Nível 3 -> 4")).toBeInTheDocument()
        expect(screen.getByLabelText("Talento")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

        expect(screen.getByText("Escolha um talento para confirmar o nível 4.")).toBeInTheDocument()
    })

    it("persists subclass, hpMax and level when confirming level 3 without changing hpCurrent", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))
        const modal = await screen.findByTestId("level-up-modal")
        fireEvent.change(within(modal).getByLabelText("Subclasse"), { target: { value: "Campeão" } })
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

        expect(form.patchField).toHaveBeenCalledWith(
            "subclass",
            expect.stringContaining('data-entity-type="Subclasse"')
        )
        expect(form.patchField).toHaveBeenCalledWith("hpMax", 27)
        expect(form.patchField).toHaveBeenCalledWith("level", 3)
        expect(form.patchField).not.toHaveBeenCalledWith("hpCurrent", expect.anything())
    })

    it("persists featuresNotes, hpMax and level when confirming level 4 without changing hpCurrent", async () => {
        const { sheet, form } = createHarness({
            level: 3,
            subclass: "<p><span data-type=\"mention\" data-id=\"subclass:class-1:subclass-1\" data-entity-type=\"Subclasse\" data-label=\"Campeão\" class=\"mention\">Campeão</span></p>",
            subclassRef: "subclass-1",
            featuresNotes: "<p>Notas existentes</p>",
        })

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))
        fireEvent.change(await screen.findByLabelText("Talento"), { target: { value: "Sortudo" } })
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

        expect(form.patchField).toHaveBeenCalledWith(
            "featuresNotes",
            expect.stringContaining('data-entity-type="Talento"')
        )
        expect(form.patchField).toHaveBeenCalledWith("hpMax", 27)
        expect(form.patchField).toHaveBeenCalledWith("level", 4)
        expect(form.patchField).not.toHaveBeenCalledWith("hpCurrent", expect.anything())
    })

    it("replaces the average hp gain with a rolled result", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))
        expect(await screen.findByText("20 -> 27")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Rolar ganho de pontos de vida" }))
        expect(screen.getByRole("button", { name: "Usar rolagem de PV" })).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Usar rolagem de PV" }))

        await waitFor(() => {
            expect(screen.getByText("20 -> 29")).toBeInTheDocument()
        })
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: "Usar rolagem de PV" })).not.toBeInTheDocument()
        })
        expect(screen.getByText("Resultado rolado: 9")).toBeInTheDocument()
    })

    it("disables the level-up flow at level 20", () => {
        const { sheet, form } = createHarness({ level: 20 })

        render(<SheetHeader sheet={sheet} form={form} />)

        expect(screen.getByTestId("level-up-button")).toBeDisabled()
        fireEvent.click(screen.getByTestId("level-up-button"))
        expect(screen.queryByTestId("level-up-modal")).not.toBeInTheDocument()
    })

    it("caps the class progression popover height in Owlbear mode", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} isOwlbear />)

        fireEvent.click(screen.getByRole("button", { name: "Ver progressão da classe" }))

        await waitFor(() => {
            expect(screen.getByTestId("owlbear-class-progression-popover")).toBeInTheDocument()
        })

        expect(screen.getByTestId("owlbear-class-progression-popover")).toHaveClass("max-h-[min(60vh,460px)]")
        expect(screen.getByTestId("class-progression-table")).toBeInTheDocument()
    })
})
