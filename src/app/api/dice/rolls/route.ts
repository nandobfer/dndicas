import { auth } from "@/core/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import type { ApiResponse } from "@/core/types/common"
import { DiceRollRequestSchema, type DiceRollRequestInput } from "@/features/dice-roller/schemas"
import { resolveGeneralDiceTarget } from "@/features/dice-roller/server/dice-target"
import { rollGeneralDice } from "@/features/dice-roller/server/dice-roll-service"
import { DICE_TYPES, type DiceRollMode, type DiceRollRequest, type DiceRollResponse, type DiceRollSource, type DiceTerm, type DiceType } from "@/features/dice-roller/types"

function getOptionalString(value: unknown) {
    return typeof value === "string" ? value : undefined
}

function getRequiredInteger(value: unknown) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error("Expected integer value in dice roll payload.")
    }

    return value
}

function getRequiredDiceType(value: unknown): DiceType {
    if (typeof value !== "string" || !DICE_TYPES.includes(value as DiceType)) {
        throw new Error("Expected dice type in dice roll payload.")
    }

    return value as DiceType
}

function getRequiredDiceTerms(value: unknown): DiceTerm[] {
    if (!Array.isArray(value)) {
        throw new Error("Expected dice terms in dice roll payload.")
    }

    return value.map((term) => {
        if (!term || typeof term !== "object") {
            throw new Error("Expected dice term object in dice roll payload.")
        }

        return {
            dice: getRequiredDiceType((term as { dice?: unknown }).dice),
            quantity: getRequiredInteger((term as { quantity?: unknown }).quantity),
        }
    })
}

function getRequiredMode(value: unknown): DiceRollMode {
    if (value === "normal" || value === "advantage" || value === "disadvantage") {
        return value
    }

    throw new Error("Expected dice roll mode in dice roll payload.")
}

function getOptionalSource(value: unknown): DiceRollSource | undefined {
    if (value === undefined) return undefined
    if (value === "manual" || value === "sheet" || value === "owlbear") {
        return value
    }

    throw new Error("Expected dice roll source in dice roll payload.")
}

function toDiceRollRequest(input: DiceRollRequestInput): DiceRollRequest {
    const modifier = input.modifier

    return {
        terms: getRequiredDiceTerms(input.terms),
        modifier: typeof modifier === "number" ? getRequiredInteger(modifier) : undefined,
        mode: getRequiredMode(input.mode),
        label: getOptionalString(input.label),
        source: getOptionalSource(input.source),
        diceSessionId: getOptionalString(input.diceSessionId),
        playerName: getOptionalString(input.playerName),
        owlbearRoomId: getOptionalString(input.owlbearRoomId),
        owlbearPlayerId: getOptionalString(input.owlbearPlayerId),
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        const body = await req.json()
        const parsed: DiceRollRequestInput = DiceRollRequestSchema.parse(body)
        const rollRequest = toDiceRollRequest(parsed)
        const target = resolveGeneralDiceTarget({
            userId,
            diceSessionId: rollRequest.diceSessionId,
            owlbearPlayerId: rollRequest.owlbearPlayerId,
        })

        if (!target) {
            const response: ApiResponse<null> = {
                success: false,
                error: "diceSessionId é obrigatório para rolagens anônimas.",
                code: "DICE_SESSION_REQUIRED",
            }
            return NextResponse.json(response, { status: 400 })
        }

        const result = await rollGeneralDice(rollRequest, target)

        if (rollRequest.source === "owlbear" && rollRequest.playerName && rollRequest.owlbearRoomId) {
            try {
                const { OwlbearDicePusherService } = await import("@/features/owlbear/realtime/owlbear-dice-pusher-service")
                await OwlbearDicePusherService.getInstance().publishRollResolved({
                    roomId: rollRequest.owlbearRoomId,
                    playerName: rollRequest.playerName,
                    result,
                    originId: req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined,
                })
            } catch (publishError) {
                console.error("[API] Failed to publish Owlbear dice roll event:", publishError)
            }
        }

        const response: ApiResponse<DiceRollResponse> = {
            success: true,
            data: result,
        }

        return NextResponse.json(response)
    } catch (error) {
        if (error instanceof z.ZodError) {
            const response: ApiResponse<null> = {
                success: false,
                error: "Dados inválidos.",
                code: "VALIDATION_ERROR",
                details: error.issues,
            }
            return NextResponse.json(response, { status: 400 })
        }

        console.error("[API] POST /api/dice/rolls error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno do servidor.",
            code: "INTERNAL_ERROR",
        }
        return NextResponse.json(response, { status: 500 })
    }
}
