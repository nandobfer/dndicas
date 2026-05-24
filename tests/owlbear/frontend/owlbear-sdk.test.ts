import { describe, expect, it, vi, beforeEach } from "vitest"
import { appendRoomDiceHistoryEntry, getRoomMetadataState } from "@/features/owlbear/sdk"
import type { OwlbearDiceHistoryEntry } from "@/features/owlbear/types"
import type { DiceRollResponse } from "@/features/dice-roller/types"

const sdkMock = vi.hoisted(() => {
    let mockMetadata: Record<string, any> = {}
    return {
        isAvailable: true,
        isReady: true,
        room: {
            id: "room-1",
            getMetadata: vi.fn(async () => mockMetadata),
            setMetadata: vi.fn(async (metadata) => {
                mockMetadata = metadata
            }),
        },
    }
})

vi.mock("@owlbear-rodeo/sdk", () => ({
    default: sdkMock,
}))

describe("Owlbear SDK - Dice History Limit", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const createDummyEntry = (id: string, createdAt: string): OwlbearDiceHistoryEntry => ({
        id,
        playerName: "Player " + id,
        playerId: "player-id-" + id,
        playerRole: "PLAYER",
        createdAt,
        result: {
            rollId: id,
            terms: [],
            mode: "normal",
            diceTotal: 10,
            modifier: 0,
            total: 10,
            createdAt,
        } as unknown as DiceRollResponse,
    })

    it("should append a new history entry when empty", async () => {
        let currentMetadata: any = {}
        sdkMock.room.getMetadata.mockImplementation(async () => currentMetadata)
        sdkMock.room.setMetadata.mockImplementation(async (metadata) => {
            currentMetadata = metadata
        })

        const entry = createDummyEntry("1", "2026-01-01T00:00:00.000Z")
        await appendRoomDiceHistoryEntry(entry)

        const state = await getRoomMetadataState()
        expect(state.diceHistory).toHaveLength(1)
        expect(state.diceHistory[0].id).toBe("1")
    })

    it("should discard the oldest entry and keep exactly 13 entries when limit is reached", async () => {
        let currentMetadata: any = {
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
                diceHistory: Array.from({ length: 13 }, (_, i) => 
                    createDummyEntry(`roll-${i}`, `2026-01-01T00:00:0${i < 10 ? '0' + i : i}.000Z`)
                )
            }
        }

        sdkMock.room.getMetadata.mockImplementation(async () => currentMetadata)
        sdkMock.room.setMetadata.mockImplementation(async (metadata) => {
            currentMetadata = metadata
        })

        const initialState = await getRoomMetadataState()
        expect(initialState.diceHistory).toHaveLength(13)

        const newEntry = createDummyEntry("entry-new", "2026-01-02T00:00:00.000Z")
        await appendRoomDiceHistoryEntry(newEntry)

        const state = await getRoomMetadataState()
        expect(state.diceHistory).toHaveLength(13)
        expect(state.diceHistory[0].id).toBe("entry-new")
        expect(state.diceHistory[12].id).toBe("roll-11")
        expect(state.diceHistory.find(e => e.id === "roll-12")).toBeUndefined()
    })
})
