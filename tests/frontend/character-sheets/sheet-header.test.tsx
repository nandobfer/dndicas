import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SheetHeader } from "@/features/character-sheets/components/sheet-header"
import type { CharacterItem, CharacterSheet, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("@/features/classes/api/classes-queries", () => ({
    useClass: () => ({
        data: {
            traits: [],
            spellcasting: true,
            progressionTable: {},
            subclasses: [],
        },
    }),
}))

vi.mock("@/features/classes/components/class-progression-table", () => ({
    ClassProgressionTable: () => <div data-testid="class-progression-table">Tabela de progressao</div>,
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

vi.mock("@/features/character-sheets/components/compact-rich-input", () => ({
    CompactRichInput: ({ label }: { label: string }) => <div>{label}</div>,
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
    raceRef: null,
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
    armorClassBonus: 0,
    initiativeOverride: null,
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
                catalogAcType: "base" as const,
                catalogArmorType: "pesada" as const,
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
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("age")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("height")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("weight")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("eyes")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("skin")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("hair")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("personalityTraits")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("ideals")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("bonds")
        expect(uploaderProps?.getAIPayload?.()).not.toHaveProperty("flaws")
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
