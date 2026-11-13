/** @vitest-environment happy-dom */
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

const mockLevelUpStatus = vi.hoisted(() => ({ campaign: null as null | Record<string, unknown> }))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useSheetLevelUpStatus: () => ({ data: { options: null, campaign: mockLevelUpStatus.campaign, unavailable: null } }),
}))

vi.mock("@/features/character-sheets/components/level-up/level-up-wizard", () => ({
    LevelUpWizard: ({ open, sheetId }: { open: boolean; sheetId: string }) => (open ? <div data-testid="level-up-modal" data-sheet-id={sheetId} /> : null),
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
    GlassSelector: ({
        value,
        options,
        onChange,
        mode,
    }: {
        value: string | string[]
        options?: Array<{ value: string; label: React.ReactNode }>
        onChange?: (value: string | string[]) => void
        mode?: "single" | "multi"
    }) => options?.length ? (
        <div>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                        if (mode === "multi") {
                            const current = Array.isArray(value) ? value : value ? [value] : []
                            onChange?.(current.includes(option.value)
                                ? current.filter((item) => item !== option.value)
                                : [...current, option.value])
                            return
                        }
                        onChange?.(option.value)
                    }}
                >
                    {option.label}
                </button>
            ))}
        </div>
    ) : <div>{value}</div>,
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
    experience: 0,
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
    exhaustion: 0,
    armorClassOverride: null,
    armorClassBonus: null,
    unarmoredDefense: { enabled: false, base: 10, attributes: [] },
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
    notePages: [],
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
        mockLevelUpStatus.campaign = null
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

    it("DND-58: shows the exhaustion level (0–6) and toggles it in editable mode", () => {
        const { sheet, form } = createHarness({ exhaustion: 2 })
        render(<SheetHeader sheet={sheet} form={form} />)
        const exhaustion = screen.getByTestId("sheet-exhaustion")
        expect(exhaustion).toHaveTextContent("Exaustão 2")
        expect(screen.getByRole("button", { name: "Exaustão nível 2" })).toHaveAttribute("aria-pressed", "true")
        expect(screen.getByRole("button", { name: "Exaustão nível 3" })).toHaveAttribute("aria-pressed", "false")
        fireEvent.click(screen.getByRole("button", { name: "Exaustão nível 3" }))
        expect(form.patchField).toHaveBeenCalledWith("exhaustion", 3)
        fireEvent.click(screen.getByRole("button", { name: "Exaustão nível 2" }))
        expect(form.patchField).toHaveBeenCalledWith("exhaustion", 1)
    })

    it("DND-58: exhaustion is read-only in read-only mode", () => {
        const { sheet, form } = createHarness({ exhaustion: 1 })
        render(<SheetHeader sheet={sheet} form={form} isReadOnly />)
        expect(screen.getByRole("button", { name: "Exaustão nível 2" })).toBeDisabled()
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
            notes: undefined,
            notePages: undefined,
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

    it("shows the armor class config trigger above the progression table trigger and still opens the table", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        const configButton = screen.getByRole("button", { name: "Configurar Classe de Armadura" })
        const progressionButton = screen.getByTestId("class-progression-button")

        expect(configButton.compareDocumentPosition(progressionButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(progressionButton).toHaveClass("whitespace-nowrap")
        expect(progressionButton).toHaveTextContent("progressão")
        expect(progressionButton.closest(".px-4.pt-4.pb-0")).toBeInTheDocument()

        fireEvent.click(progressionButton)

        expect(await screen.findByTestId("class-progression-table")).toBeInTheDocument()
    })

    it("opens armor class settings and persists manual bonus and unarmored defense options", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByRole("button", { name: "Configurar Classe de Armadura" }))

        expect(await screen.findByText("Configurar Classe de Armadura")).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText("Bônus de CA"), { target: { value: "2" } })
        expect(form.patchField).toHaveBeenCalledWith("armorClassBonus", 2)

        const unarmoredDefenseSwitch = screen.getByLabelText("Ativar Defesa sem Armadura")
        expect(unarmoredDefenseSwitch).toHaveAttribute("type", "checkbox")
        fireEvent.click(unarmoredDefenseSwitch)
        expect(form.patchField).toHaveBeenCalledWith("unarmoredDefense", {
            enabled: true,
            base: 10,
            attributes: [],
        })

        fireEvent.change(screen.getByLabelText("CA base"), { target: { value: "14" } })
        expect(form.patchField).toHaveBeenCalledWith("unarmoredDefense", {
            enabled: false,
            base: 14,
            attributes: [],
        })

        expect(screen.queryByText("Nenhum")).not.toBeInTheDocument()
        await waitFor(() => expect(screen.getByText("Constituição")).toBeInTheDocument())
        expect(screen.getByText("Força")).toBeInTheDocument()
        expect(screen.getByText("Destreza")).toBeInTheDocument()
        expect(screen.getByText("Inteligência")).toBeInTheDocument()
        expect(screen.getByText("Sabedoria")).toBeInTheDocument()
        expect(screen.getByText("Carisma")).toBeInTheDocument()

        fireEvent.click(screen.getByText("Constituição"))
        expect(form.patchField).toHaveBeenCalledWith("unarmoredDefense", {
            enabled: false,
            base: 10,
            attributes: ["constitution"],
        })
    })

    it("adds another unarmored defense attribute to the existing selection", async () => {
        const { sheet, form } = createHarness({
            unarmoredDefense: { enabled: true, base: 10, attributes: ["constitution"] },
        })

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByRole("button", { name: "Configurar Classe de Armadura" }))
        await waitFor(() => expect(screen.getByText("Sabedoria")).toBeInTheDocument())
        fireEvent.click(screen.getByText("Sabedoria"))

        expect(form.patchField).toHaveBeenCalledWith("unarmoredDefense", {
            enabled: true,
            base: 10,
            attributes: ["constitution", "wisdom"],
        })
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

    it("opens the server-driven level-up wizard from the button", async () => {
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        fireEvent.click(screen.getByTestId("level-up-button"))

        expect(await screen.findByTestId("level-up-modal")).toHaveAttribute("data-sheet-id", sheet._id)
        expect(form.patchField).not.toHaveBeenCalledWith("level", expect.anything())
    })

    it("shows how much XP is missing for the next level (D&D 2024 table)", () => {
        const { sheet, form } = createHarness({ level: 2, experience: 500 })

        render(<SheetHeader sheet={sheet} form={form} />)

        expect(screen.getByTestId("experience-to-next")).toHaveTextContent("Faltam 400 XP para o nível 3")
        fireEvent.change(screen.getByLabelText("XP"), { target: { value: "650" } })
        expect(form.patchField).toHaveBeenCalledWith("experience", 650)
    })

    it("campaign sheet: the button only opens with a pending level-up, and the XP of Experience mode belongs to Maddox", () => {
        mockLevelUpStatus.campaign = { campaignId: "c1", stepId: null, toLevel: null, mode: "experiencia", status: null, blocked: "Esta ficha só sobe de nível quando atingir a XP do próximo nível." }
        const { sheet, form } = createHarness()

        render(<SheetHeader sheet={sheet} form={form} />)

        expect(screen.getByTestId("level-up-button")).toBeDisabled()
        expect(screen.getByText("Controlado pelo Maddox")).toBeInTheDocument()
        expect(screen.queryByTestId("level-up-banner")).not.toBeInTheDocument()
    })

    it("campaign sheet with a pending level-up: persistent banner and the wizard opens by itself once", async () => {
        window.sessionStorage.clear()
        mockLevelUpStatus.campaign = { campaignId: "c1", stepId: "step-1", toLevel: 3, mode: "marco", status: "pending", blocked: null }
        const { sheet, form } = createHarness()

        const { unmount } = render(<SheetHeader sheet={sheet} form={form} />)

        expect(await screen.findByTestId("level-up-modal")).toBeInTheDocument()
        expect(screen.getByTestId("level-up-banner")).toHaveTextContent("Você pode subir para o nível 3.")
        expect(screen.getByTestId("level-up-button")).not.toBeDisabled()
        unmount()

        render(<SheetHeader sheet={sheet} form={form} />)
        expect(screen.getByTestId("level-up-banner")).toBeInTheDocument()
        expect(screen.queryByTestId("level-up-modal")).not.toBeInTheDocument()
        fireEvent.click(within(screen.getByTestId("level-up-banner")).getByRole("button", { name: "Subir de nível" }))
        expect(await screen.findByTestId("level-up-modal")).toBeInTheDocument()
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
