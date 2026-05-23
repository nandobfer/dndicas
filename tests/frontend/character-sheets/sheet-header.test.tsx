import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SheetHeader } from "@/features/character-sheets/components/sheet-header"
import type { CharacterSheet, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

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

const form = {
    watch: ((field?: keyof PatchSheetBody) => {
        if (!field) return {}
        return baseSheet[field]
    }) as {
        (): PatchSheetBody
        <TFieldName extends keyof PatchSheetBody>(name: TFieldName): PatchSheetBody[TFieldName]
    },
    setFieldLocally: () => undefined,
    patchField: () => undefined,
}

describe("SheetHeader", () => {
    it("caps the class progression popover height in Owlbear mode", async () => {
        render(<SheetHeader sheet={baseSheet} form={form} isOwlbear />)

        fireEvent.click(screen.getByRole("button", { name: "Ver progressão da classe" }))

        await waitFor(() => {
            expect(screen.getByTestId("owlbear-class-progression-popover")).toBeInTheDocument()
        })

        expect(screen.getByTestId("owlbear-class-progression-popover")).toHaveClass("max-h-[min(60vh,460px)]")
        expect(screen.getByTestId("class-progression-table")).toBeInTheDocument()
    })
})
