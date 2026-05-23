import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { createClassSchema, type CreateClassSchema } from "@/features/classes/api/validation"
import { SpellsSection, TraitsSection } from "@/features/classes/components/shared-form-components"

vi.mock("@/components/ui/glass-entity-chooser", () => ({
    GlassEntityChooser: ({ value }: { value?: { label?: string } }) => <div>{value?.label ?? ""}</div>,
}))

vi.mock("framer-motion", async () => {
    const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")
    const MockDiv = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>

    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: MockDiv,
        },
    }
})

function SubclassTraitFormHarness({
    onSubmit,
    onError,
}: {
    onSubmit: (data: CreateClassSchema) => void
    onError: (errors: unknown) => void
}) {
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<z.input<typeof createClassSchema>, undefined, CreateClassSchema>({
        resolver: zodResolver(createClassSchema),
        defaultValues: {
            name: "Artífice",
            originalName: "Artificer",
            image: "",
            description: "<p>Classe válida com descrição longa.</p>",
            source: "EFA",
            status: "active",
            hitDice: "d8",
            primaryAttributes: ["Inteligência"],
            savingThrows: ["Constituição", "Inteligência"],
            armorProficiencies: ["Armaduras Leves"],
            weaponProficiencies: ["Armas Simples"],
            skillCount: 2,
            availableSkills: ["Arcanismo"],
            spellcasting: true,
            spellcastingAttribute: "Inteligência",
            spells: [],
            traits: [],
            subclasses: [
                {
                    _id: "subclass-1",
                    name: "Alquimista",
                    source: "EFA",
                    image: "",
                    description: "<p>Descrição da subclasse.</p>",
                    color: "#10B981",
                    spellcasting: true,
                    spellcastingAttribute: "Inteligência",
                    spells: [{ id: "spell-1", name: "Mísseis Mágicos", circle: 1, level: 3 }],
                    traits: [
                        {
                            _id: "trait-1",
                            level: 3,
                            description: '<span data-type="mention" data-id="tools" data-entity-type="trait" class="mention">Ferramentas do Comércio</span>',
                        },
                        {
                            _id: "trait-2",
                            level: 5,
                            description: '<span data-type="mention" data-id="restorative" data-entity-type="trait" class="mention">Reagentes Restauradores</span>',
                        },
                    ],
                },
            ],
        },
    })

    const subclassTraits = useFieldArray({
        control,
        name: "subclasses.0.traits",
    })

    return (
        <form onSubmit={handleSubmit(onSubmit, onError)}>
            <SpellsSection control={control} isSubmitting={isSubmitting} spellsFieldName="subclasses.0.spells" errors={errors} />
            <TraitsSection
                fields={subclassTraits.fields}
                append={subclassTraits.append}
                remove={subclassTraits.remove}
                control={control}
                isSubmitting={isSubmitting}
                traitsFieldName="subclasses.0.traits"
                errors={errors}
            />
            <button type="button" onClick={() => subclassTraits.remove(0)}>
                Remover primeiro trait
            </button>
            <button type="submit">Salvar</button>
        </form>
    )
}

function ExistingSubclassesHarness() {
    const { control, watch } = useForm<z.input<typeof createClassSchema>, undefined, CreateClassSchema>({
        resolver: zodResolver(createClassSchema),
        defaultValues: {
            name: "Artífice",
            originalName: "Artificer",
            image: "",
            description: "<p>Classe válida com descrição longa.</p>",
            source: "EFA",
            status: "active",
            hitDice: "d8",
            primaryAttributes: ["Inteligência"],
            savingThrows: ["Constituição", "Inteligência"],
            armorProficiencies: ["Armaduras Leves"],
            weaponProficiencies: ["Armas Simples"],
            skillCount: 2,
            availableSkills: ["Arcanismo"],
            spellcasting: false,
            spells: [],
            traits: [],
            subclasses: [
                {
                    _id: "subclass-1",
                    name: "Alquimista",
                    source: "EFA",
                    spellcasting: false,
                    spells: [],
                    traits: [],
                },
                {
                    _id: "subclass-2",
                    name: "Armadura",
                    source: "EFA",
                    spellcasting: false,
                    spells: [],
                    traits: [],
                },
            ],
        },
    })

    useFieldArray({
        control,
        name: "subclasses",
    })

    const subclasses = watch("subclasses") || []

    return (
        <div>
            <span data-testid="subclass-count">{subclasses.length}</span>
            {subclasses.map((subclass) => (
                <span key={subclass._id ?? subclass.name}>{subclass.name}</span>
            ))}
        </div>
    )
}

describe("class form subclass trait arrays", () => {
    it("submits cleanly after removing the first imported subclass trait", async () => {
        const onSubmit = vi.fn()
        const onError = vi.fn()

        render(<SubclassTraitFormHarness onSubmit={onSubmit} onError={onError} />)

        fireEvent.click(screen.getByRole("button", { name: "Lista de Habilidades" }))
        fireEvent.click(screen.getByRole("button", { name: "Remover primeiro trait" }))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))

        await waitFor(() => {
            expect(onError).not.toHaveBeenCalled()
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    subclasses: [
                        expect.objectContaining({
                            traits: [
                                expect.objectContaining({
                                    level: 5,
                                    description: expect.stringContaining("Reagentes Restauradores"),
                                }),
                            ],
                        }),
                    ],
                }),
                expect.anything(),
            )
        })
    })

    it("keeps existing subclasses available in form state through the root subclasses field array", () => {
        render(<ExistingSubclassesHarness />)

        expect(screen.getByTestId("subclass-count")).toHaveTextContent("2")
        expect(screen.getByText("Alquimista")).toBeInTheDocument()
        expect(screen.getByText("Armadura")).toBeInTheDocument()
    })
})
