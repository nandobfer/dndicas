import type { ButtonHTMLAttributes } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import GenericEntityPage from "@/app/(dashboard)/_components/generic-entity-page-container"

const routerPush = vi.fn()
const routerReplace = vi.fn()
const invalidateQueries = vi.fn()
const queryMockState = vi.hoisted(
    (): {
        result: {
            data: { _id: string; name: string } | null
            isLoading: boolean
        }
    } => ({
        result: {
            data: { _id: "class-1", name: "Guerreiro" },
            isLoading: false,
        },
    }),
)

let currentSearchParams = new URLSearchParams("foo=bar&subclass=champion&subclass=samurai")

vi.mock("next/navigation", () => ({
    useParams: () => ({ slug: "guerreiro" }),
    usePathname: () => "/classes/guerreiro",
    useRouter: () => ({
        push: routerPush,
        replace: routerReplace,
    }),
    useSearchParams: () => currentSearchParams,
}))

vi.mock("@tanstack/react-query", () => ({
    useQuery: () => queryMockState.result,
    useQueryClient: () => ({
        invalidateQueries,
    }),
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({ isAdmin: false }),
}))

vi.mock("@/core/context/window-context", () => ({
    useWindows: () => ({ addWindow: vi.fn() }),
}))

vi.mock("@/features/rules/hooks/useRulesPage", () => ({
    useRulesPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/traits/hooks/useTraitsPage", () => ({
    useTraitsPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/feats/hooks/useFeatsPage", () => ({
    useFeatsPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/spells/hooks/useSpellsPage", () => ({
    useSpellsPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/classes/hooks/useClassesPage", () => ({
    useClassesPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/backgrounds/hooks/useBackgroundsPage", () => ({
    useBackgroundsPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/races/hooks/useRacesPage", () => ({
    useRacesPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/items/hooks/useItemsPage", () => ({
    useItemsPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("@/features/monsters/hooks/useMonstersPage", () => ({
    useMonstersPage: () => ({ actions: {}, modals: {} }),
}))

vi.mock("framer-motion", () => ({
    motion: {
        button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    },
}))

vi.mock("@/features/rules/components/entity-page", () => ({
    EntityPage: ({
        item,
        isLoading,
        renderOptions,
    }: {
        item?: { name?: string } | null
        isLoading?: boolean
        renderOptions?: {
            initialSelectedSubclassIds?: string[]
            onSelectedSubclassIdsChange?: (subclassIds: string[]) => void
        }
    }) => (
        <div>
            <div data-testid="entity-page-item">{item?.name ?? "none"}</div>
            <div data-testid="entity-page-loading">{String(isLoading)}</div>
            <div data-testid="initial-selected-subclasses">{(renderOptions?.initialSelectedSubclassIds ?? []).join(",")}</div>
            <button type="button" onClick={() => renderOptions?.onSelectedSubclassIdsChange?.(["samurai", "eldritch-knight"])}>
                Atualizar subclasses
            </button>
        </div>
    ),
}))

vi.mock("@/features/rules/components/rule-form-modal", () => ({
    RuleFormModal: () => null,
}))

vi.mock("@/features/rules/components/delete-rule-dialog", () => ({
    DeleteRuleDialog: () => null,
}))

vi.mock("@/features/traits/components/trait-form-modal", () => ({
    TraitFormModal: () => null,
}))

vi.mock("@/features/traits/components/delete-trait-dialog", () => ({
    DeleteTraitDialog: () => null,
}))

vi.mock("@/features/feats/components/feat-form-modal", () => ({
    FeatFormModal: () => null,
}))

vi.mock("@/features/feats/components/delete-feat-dialog", () => ({
    DeleteFeatDialog: () => null,
}))

vi.mock("@/features/classes/components/class-form-modal", () => ({
    ClassFormModal: () => null,
}))

vi.mock("@/features/classes/components/delete-class-dialog", () => ({
    DeleteClassDialog: () => null,
}))

vi.mock("@/features/spells/components/spell-form-modal", () => ({
    SpellFormModal: () => null,
}))

vi.mock("@/features/backgrounds/components/background-form-modal", () => ({
    BackgroundFormModal: () => null,
}))

vi.mock("@/features/backgrounds/components/delete-background-dialog", () => ({
    DeleteBackgroundDialog: () => null,
}))

vi.mock("@/features/races/components/race-form-modal", () => ({
    RaceFormModal: () => null,
}))

vi.mock("@/features/races/components/delete-race-dialog", () => ({
    DeleteRaceDialog: () => null,
}))

vi.mock("@/features/spells/components/delete-spell-dialog", () => ({
    DeleteSpellDialog: () => null,
}))

vi.mock("@/features/items/components/item-form-modal", () => ({
    ItemFormModal: () => null,
}))

vi.mock("@/features/items/components/delete-item-dialog", () => ({
    DeleteItemDialog: () => null,
}))

vi.mock("@/features/monsters/components/monster-form-modal", () => ({
    MonsterFormModal: () => null,
}))

vi.mock("@/features/monsters/components/delete-monster-dialog", () => ({
    DeleteMonsterDialog: () => null,
}))

describe("GenericEntityPage subclasses params", () => {
    beforeEach(() => {
        currentSearchParams = new URLSearchParams("foo=bar&subclass=champion&subclass=samurai")
        queryMockState.result = {
            data: { _id: "class-1", name: "Guerreiro" },
            isLoading: false,
        }
        routerPush.mockReset()
        routerReplace.mockReset()
        invalidateQueries.mockReset()
    })

    it("passes all subclass params to the class preview", () => {
        render(<GenericEntityPage entityTypeKey="Classe" />)

        expect(screen.getByTestId("initial-selected-subclasses")).toHaveTextContent("champion,samurai")
    })

    it("updates the url with repeated subclass params when the selection changes", () => {
        render(<GenericEntityPage entityTypeKey="Classe" />)

        fireEvent.click(screen.getByRole("button", { name: "Atualizar subclasses" }))

        expect(routerReplace).toHaveBeenCalledWith("/classes/guerreiro?foo=bar&subclass=samurai&subclass=eldritch-knight", {
            scroll: false,
        })
    })

    it("keeps cached item visible instead of passing loading to the entity page", () => {
        queryMockState.result = {
            data: { _id: "class-1", name: "Guerreiro" },
            isLoading: true,
        }

        render(<GenericEntityPage entityTypeKey="Classe" />)

        expect(screen.getByTestId("entity-page-item")).toHaveTextContent("Guerreiro")
        expect(screen.getByTestId("entity-page-loading")).toHaveTextContent("false")
    })

    it("still passes loading when there is no cached item", () => {
        queryMockState.result = {
            data: null,
            isLoading: true,
        }

        render(<GenericEntityPage entityTypeKey="Classe" />)

        expect(screen.getByTestId("entity-page-item")).toHaveTextContent("none")
        expect(screen.getByTestId("entity-page-loading")).toHaveTextContent("true")
    })
})
