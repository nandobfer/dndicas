import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearGmInitiativeTab } from "@/features/owlbear/gm-initiative-tab"
import type { OwlbearRoomNpc } from "@/features/owlbear/room-npcs-api"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"

const useRoomNpcsMock = vi.hoisted(() => vi.fn())
const useRoomLinkedSheetsMock = vi.hoisted(() => vi.fn())
const useRoomInitiativeMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/owlbear/use-room-npcs", () => ({
    useRoomNpcs: (...args: unknown[]) => useRoomNpcsMock(...args),
}))

vi.mock("@/features/owlbear/use-room-linked-sheets", () => ({
    useRoomLinkedSheets: (...args: unknown[]) => useRoomLinkedSheetsMock(...args),
}))

vi.mock("@/features/owlbear/use-room-initiative", () => ({
    useRoomInitiative: (...args: unknown[]) => useRoomInitiativeMock(...args),
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const runtime = {
    status: "ready" as const,
    role: "GM" as const,
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark" as const,
    sceneReady: true,
}

const session = {
    sessionStatus: "ready" as const,
    sessionToken: "token-1",
    sessionExpiresAt: "2099-01-01T00:00:00.000Z",
}

function roomNpc(overrides: Partial<OwlbearRoomNpc> = {}): OwlbearRoomNpc {
    return {
        id: "npc-1",
        _id: "npc-1",
        roomId: "room-1",
        sourceKind: "monster",
        sourceId: "monster-1",
        hpCurrent: 12,
        hpMax: 20,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        source: {
            _id: "monster-1",
            id: "monster-1",
            name: "Lobo",
            originalName: "Wolf",
            source: "LDM",
            description: "",
            image: "",
            status: "active",
            type: "beast",
            size: "M",
            alignment: "unaligned",
            armorClass: 13,
            hitPointsFormula: "2d8 + 2",
            speed: "12m",
            attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
            savingThrows: {},
            skills: {},
            senses: {},
            sensesAndLanguages: [],
            challengeRating: "1/4",
            languages: "—",
            damageVulnerabilities: [],
            damageResistances: [],
            damageImmunities: [],
            conditionImmunities: [],
            traits: [],
            actions: [],
            bonusActions: [],
            reactions: [],
            legendaryActions: [],
            lairActions: [],
            regionalEffects: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        },
        ...overrides,
    }
}

function sheet(overrides: Partial<CharacterSheetFull> = {}): CharacterSheetFull {
    return {
        _id: "sheet-1",
        slug: "kael",
        userId: "user-1",
        username: "kael",
        name: "Kael",
        class: "Guerreiro",
        classRef: null,
        subclass: "",
        subclassRef: null,
        level: 3,
        experience: "0",
        race: "Humano",
        raceRef: null,
        origin: "",
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
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        proficiencyBonusOverride: null,
        savingThrows: { strength: false, dexterity: false, constitution: false, intelligence: false, wisdom: false, charisma: false },
        skills: {} as CharacterSheetFull["skills"],
        movementSpeed: "9m",
        hpMax: 30,
        hpCurrent: 18,
        hpTemp: 0,
        hitDiceTotal: "3d10",
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
        armorTraining: { light: false, medium: false, heavy: false, shields: false },
        weaponProficiencies: "",
        toolProficiencies: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        items: [],
        spells: [],
        feats: [],
        traits: [],
        attacks: [],
        ...overrides,
    }
}

function renderTab(props: {
    npcs?: OwlbearRoomNpc[]
    sheets?: CharacterSheetFull[]
    initiative?: {
        npcs: Record<string, { initiative: number; roll: number; dexModifier: number; addedAt: string }>
        players: Record<string, { initiative: number; updatedAt: string }>
    }
    updateNpc?: ReturnType<typeof vi.fn>
    removeNpcInitiative?: ReturnType<typeof vi.fn>
    setPlayerInitiative?: ReturnType<typeof vi.fn>
} = {}) {
    const updateNpc = props.updateNpc ?? vi.fn().mockResolvedValue(null)
    const removeNpcInitiative = props.removeNpcInitiative ?? vi.fn().mockResolvedValue(undefined)
    const setPlayerInitiative = props.setPlayerInitiative ?? vi.fn().mockResolvedValue(undefined)
    useRoomNpcsMock.mockReturnValue({
        items: props.npcs ?? [roomNpc()],
        isLoading: false,
        errorMessage: null,
        reload: vi.fn(),
        linkNpc: vi.fn(),
        updateNpc,
        removeNpc: vi.fn(),
    })
    useRoomLinkedSheetsMock.mockReturnValue({
        entries: [],
        sheets: props.sheets ?? [sheet()],
        isLoading: false,
        errorMessage: null,
        reload: vi.fn(),
        unlinkSheet: vi.fn(),
    })
    useRoomInitiativeMock.mockReturnValue({
        initiative: props.initiative ?? {
            npcs: { "npc-1": { initiative: 18, roll: 16, dexModifier: 2, addedAt: "2026-01-01T00:00:00.000Z" } },
            players: { "sheet-1": { initiative: 12, updatedAt: "2026-01-01T00:00:00.000Z" } },
        },
        isLoading: false,
        errorMessage: null,
        addNpcInitiative: vi.fn(),
        removeNpcInitiative,
        setPlayerInitiative,
    })

    render(<OwlbearGmInitiativeTab runtime={runtime} session={session} isAuthenticated isAuthLoaded />)

    return { updateNpc, removeNpcInitiative, setPlayerInitiative }
}

describe("OwlbearGmInitiativeTab", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders combatants ordered by initiative descending", () => {
        renderTab({
            npcs: [roomNpc({ id: "npc-1" })],
            sheets: [sheet({ _id: "sheet-1", name: "Kael" })],
            initiative: {
                npcs: { "npc-1": { initiative: 18, roll: 16, dexModifier: 2, addedAt: "2026-01-01T00:00:00.000Z" } },
                players: { "sheet-1": { initiative: 12, updatedAt: "2026-01-01T00:00:00.000Z" } },
            },
        })

        const list = screen.getByTestId("gm-initiative-list")
        const rows = within(list).getAllByText(/Lobo|Kael/)

        expect(rows[0]).toHaveTextContent("Lobo")
        expect(rows[1]).toHaveTextContent("Kael")
    })

    it("removes an NPC only from initiative", async () => {
        const removeNpcInitiative = vi.fn().mockResolvedValue(undefined)
        renderTab({ removeNpcInitiative })

        fireEvent.click(screen.getByLabelText("Remover Lobo da iniciativa"))

        await waitFor(() => expect(removeNpcInitiative).toHaveBeenCalledWith("npc-1"))
    })

    it("updates NPC HP through the shared room NPC endpoint", async () => {
        const updateNpc = vi.fn().mockResolvedValue(roomNpc({ hpCurrent: 8 }))
        renderTab({ updateNpc })

        const input = screen.getByLabelText("Ajustar vida de Lobo")
        fireEvent.change(input, { target: { value: "-4" } })
        fireEvent.keyDown(input, { key: "Enter" })

        await waitFor(() => expect(updateNpc).toHaveBeenCalledWith("npc-1", { hpCurrent: 8 }))
    })

    it("persists player initiative from the PC input", async () => {
        const setPlayerInitiative = vi.fn().mockResolvedValue(undefined)
        renderTab({ setPlayerInitiative })

        const input = screen.getByLabelText("Iniciativa de Kael")
        fireEvent.change(input, { target: { value: "21" } })
        fireEvent.keyDown(input, { key: "Enter" })

        await waitFor(() => expect(setPlayerInitiative).toHaveBeenCalledWith("sheet-1", 21))
    })
})
