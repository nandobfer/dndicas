"use client"

import { buildPusherOriginHeader } from "@/core/realtime/pusher-origin"
import type { ApiResponse } from "@/core/types/common"
import { getOrCreateDiceSessionId } from "./client-session"
import type { DiceRollOverrideRecord, DiceRollRequest, DiceRollResponse, DiceType } from "./types"

async function parseApiResponse<T>(response: Response) {
    const body = (await response.json()) as ApiResponse<T>
    if (!response.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${response.status}`)
    }
    return body.data as T
}

export async function requestDiceRoll(input: Omit<DiceRollRequest, "diceSessionId">) {
    const response = await fetch("/api/dice/rolls", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...buildPusherOriginHeader(),
        },
        body: JSON.stringify({
            ...input,
            diceSessionId: getOrCreateDiceSessionId(),
        }),
    })

    return parseApiResponse<DiceRollResponse>(response)
}

export async function setDiceOverride(input:
    | { action: "min"; dice: DiceType; value: number; owlbearPlayerId?: string }
    | { action: "max"; dice: DiceType; value: number; owlbearPlayerId?: string }
    | { action: "range"; dice: DiceType; min: number; max: number; owlbearPlayerId?: string }
    | { action: "exact"; dice: DiceType; value: number; owlbearPlayerId?: string }
) {
    const response = await fetch("/api/dice/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ...input,
            diceSessionId: getOrCreateDiceSessionId(),
        }),
    })

    return parseApiResponse<DiceRollOverrideRecord>(response)
}

export async function clearDiceOverride(dice?: DiceType) {
    return clearScopedDiceOverride({ dice })
}

export async function clearScopedDiceOverride(input: { dice?: DiceType; owlbearPlayerId?: string }) {
    const response = await fetch("/api/dice/overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ...input,
            diceSessionId: getOrCreateDiceSessionId(),
        }),
    })

    return parseApiResponse<{ deletedCount: number }>(response)
}

export async function listDiceOverrides() {
    return listScopedDiceOverrides({})
}

export async function listScopedDiceOverrides(input: { owlbearPlayerId?: string }) {
    const params = new URLSearchParams()
    const diceSessionId = getOrCreateDiceSessionId()
    if (diceSessionId) params.set("diceSessionId", diceSessionId)
    if (input.owlbearPlayerId) params.set("owlbearPlayerId", input.owlbearPlayerId)

    const response = await fetch(`/api/dice/overrides?${params.toString()}`)
    return parseApiResponse<DiceRollOverrideRecord[]>(response)
}
