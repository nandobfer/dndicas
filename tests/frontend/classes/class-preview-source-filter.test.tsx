import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ClassPreview, subclassMatchesSourceFilters } from "@/features/classes/components/class-preview"
import type { CharacterClass, Subclass } from "@/features/classes/types/classes.types"

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: ComponentPropsWithoutRef<"span">) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/glass-attribute-chip", () => ({
    GlassAttributeChip: ({ attribute }: { attribute: string }) => <span>{attribute}</span>,
}))

vi.mock("@/components/ui/glass-empty-value", () => ({
    GlassEmptyValue: () => <span>Nenhuma</span>,
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock("@/components/ui/glass-input", () => ({
    GlassInput: (props: ComponentPropsWithoutRef<"input">) => <input {...props} />,
}))

vi.mock("@/components/ui/glass-selector", () => ({
    GlassSelector: ({
        options,
        value = [],
        onChange,
    }: {
        options: Array<{ value: string; label: string }>
        value?: string | string[]
        onChange?: (value: string | string[]) => void
    }) => (
        <div data-testid="glass-selector">
            {options.map((option) => {
                const selectedValues = Array.isArray(value) ? value : value ? [value] : []
                const isSelected = selectedValues.includes(option.value)
                const nextValue = isSelected
                    ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                    : [...selectedValues, option.value]

                return (
                    <button key={option.value} type="button" onClick={() => onChange?.(nextValue)}>
                        {option.label}
                    </button>
                )
            })}
        </div>
    ),
}))

vi.mock("@/components/ui/chip", () => ({
    Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
    EntityTitleLink: ({ name }: { name: string }) => <span>{name}</span>,
}))

vi.mock("@/features/classes/components/mention-renderer", () => ({
    MentionRenderer: ({ item }: { item: { description?: string } }) => <div>{item.description}</div>,
}))

vi.mock("@/components/ui/glass-dice-value", () => ({
    GlassDiceValue: ({ value }: { value: { tipo: string } }) => <span>{value.tipo}</span>,
}))

vi.mock("@/features/rules/components/entity-source", () => ({
    EntitySource: ({ source }: { source?: string }) => <span>{source}</span>,
}))

vi.mock("@/features/classes/components/class-progression-table", () => ({
    ClassProgressionTable: ({ subclassData = [] }: { subclassData?: Array<{ name: string }> }) => (
        <div data-testid="class-progression-subclasses">{subclassData.map((subclass) => subclass.name).join(",")}</div>
    ),
}))

vi.mock("@/features/classes/components/subclass-preview", () => ({
    SubclassPreview: ({ subclass }: { subclass: Subclass }) => <div data-testid="selected-subclass">{subclass.name}</div>,
}))

const makeSubclass = (overrides: Partial<Subclass>): Subclass => ({
    _id: "subclass-1",
    name: "Subclasse",
    source: "LDJ pág. 72",
    description: "<p>Descrição</p>",
    color: "#f59e0b",
    spellcasting: false,
    traits: [],
    ...overrides,
})

const makeClass = (subclasses: Subclass[]): CharacterClass => ({
    _id: "class-1",
    name: "Guerreiro",
    description: "<p>Classe marcial.</p>",
    source: "LDJ pág. 70",
    status: "active",
    hitDice: "d10",
    primaryAttributes: ["Força"],
    savingThrows: ["Força", "Constituição"],
    armorProficiencies: [],
    weaponProficiencies: [],
    skillCount: 2,
    availableSkills: [],
    spellcasting: false,
    subclasses,
    traits: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

describe("ClassPreview source filters", () => {
    it("matches subclass sources by case-insensitive prefix", () => {
        expect(subclassMatchesSourceFilters(makeSubclass({ source: "LDJ pág. 72" }), ["ldj"])).toBe(true)
        expect(subclassMatchesSourceFilters(makeSubclass({ source: "XGE pág. 31" }), ["LDJ"])).toBe(false)
        expect(subclassMatchesSourceFilters(makeSubclass({ source: undefined }), ["LDJ"])).toBe(false)
    })

    it("renders all subclasses when no source filter is active", () => {
        render(
            <ClassPreview
                characterClass={makeClass([
                    makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
                    makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
                ])}
            />,
        )

        expect(screen.getByText("Campeão")).toBeInTheDocument()
        expect(screen.getByText("Samurai")).toBeInTheDocument()
    })

    it("renders only subclasses matching the active source filters", () => {
        render(
            <ClassPreview
                characterClass={makeClass([
                    makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
                    makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
                ])}
                sourceFilters={["LDJ"]}
            />,
        )

        expect(screen.getByText("Campeão")).toBeInTheDocument()
        expect(screen.queryByText("Samurai")).not.toBeInTheDocument()
    })

    it("does not include filtered-out selected subclasses in progression data", () => {
        render(
            <ClassPreview
                characterClass={makeClass([
                    makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
                    makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
                ])}
                initialSelectedSubclassIds={["xge-sub"]}
                sourceFilters={["LDJ"]}
            />,
        )

        expect(screen.getByTestId("class-progression-subclasses")).toHaveTextContent("")
        expect(screen.queryByText("Samurai")).not.toBeInTheDocument()
    })

    it("preselects multiple subclasses from props", () => {
        render(
            <ClassPreview
                characterClass={makeClass([
                    makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
                    makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
                ])}
                initialSelectedSubclassIds={["ldj-sub", "xge-sub"]}
            />,
        )

        expect(screen.getByTestId("class-progression-subclasses")).toHaveTextContent("Campeão,Samurai")
        expect(screen.getAllByTestId("selected-subclass")).toHaveLength(2)
    })

    it("updates the selected subclasses and emits the callback when the selection changes", () => {
        const onSelectedSubclassIdsChange = vi.fn()

        render(
            <ClassPreview
                characterClass={makeClass([
                    makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
                    makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
                ])}
                onSelectedSubclassIdsChange={onSelectedSubclassIdsChange}
            />,
        )

        fireEvent.click(screen.getByRole("button", { name: "Samurai" }))

        expect(onSelectedSubclassIdsChange).toHaveBeenCalledWith(["xge-sub"])
        expect(screen.getByTestId("class-progression-subclasses")).toHaveTextContent("Samurai")
    })

    it("synchronizes internal selection when the initial props change", () => {
        const characterClass = makeClass([
            makeSubclass({ _id: "ldj-sub", name: "Campeão", source: "LDJ pág. 72" }),
            makeSubclass({ _id: "xge-sub", name: "Samurai", source: "XGE pág. 31" }),
        ])
        const { rerender } = render(<ClassPreview characterClass={characterClass} initialSelectedSubclassIds={["ldj-sub"]} />)

        expect(screen.getByTestId("class-progression-subclasses")).toHaveTextContent("Campeão")

        rerender(<ClassPreview characterClass={characterClass} initialSelectedSubclassIds={["xge-sub"]} />)

        expect(screen.getByTestId("class-progression-subclasses")).toHaveTextContent("Samurai")
    })
})
