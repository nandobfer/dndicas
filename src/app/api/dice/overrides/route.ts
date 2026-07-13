import { auth } from "@/core/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { ApiResponse } from "@/core/types/common"
import { DiceOverrideCreateSchema, DiceOverrideDeleteSchema, type DiceOverrideCreateInput, type DiceOverrideDeleteInput } from "@/features/dice-roller/schemas"
import { resolveGeneralDiceTarget } from "@/features/dice-roller/server/dice-target"
import { clearDiceOverrides, listDiceOverrides, upsertDiceOverride } from "@/features/dice-roller/server/dice-override-service"
import { DICE_TYPES, type DiceRollOverrideInput, type DiceRollOverrideRecord, type DiceType } from "@/features/dice-roller/types"

function missingTargetResponse() {
    const response: ApiResponse<null> = {
        success: false,
        error: "diceSessionId é obrigatório para overrides anônimos.",
        code: "DICE_SESSION_REQUIRED",
    }
    return NextResponse.json(response, { status: 400 })
}

function getOptionalString(value: unknown) {
    return typeof value === "string" ? value : undefined
}

function getRequiredInteger(value: unknown) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error("Expected integer value in dice override payload.")
    }

    return value
}

function getRequiredDiceType(value: unknown): DiceType {
    if (typeof value !== "string" || !DICE_TYPES.includes(value as DiceType)) {
        throw new Error("Expected dice type in dice override payload.")
    }

    return value as DiceType
}

function getOptionalDiceType(value: unknown) {
    return value === undefined ? undefined : getRequiredDiceType(value)
}

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        const url = new URL(req.url)
        const target = resolveGeneralDiceTarget({
            userId,
            diceSessionId: url.searchParams.get("diceSessionId"),
            owlbearPlayerId: url.searchParams.get("owlbearPlayerId"),
        })

        if (!target) return missingTargetResponse()

        const data = await listDiceOverrides(target)
        const response: ApiResponse<DiceRollOverrideRecord[]> = {
            success: true,
            data,
        }
        return NextResponse.json(response)
    } catch (error) {
        console.error("[API] GET /api/dice/overrides error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno do servidor.",
            code: "INTERNAL_ERROR",
        }
        return NextResponse.json(response, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        const parsed: DiceOverrideCreateInput = DiceOverrideCreateSchema.parse(await req.json())
        const target = resolveGeneralDiceTarget({
            userId,
            diceSessionId: getOptionalString(parsed.diceSessionId),
            owlbearPlayerId: getOptionalString(parsed.owlbearPlayerId),
        })

        if (!target) return missingTargetResponse()

        const dice = getRequiredDiceType(parsed.dice)
        const input: DiceRollOverrideInput =
            parsed.action === "min"
                ? { dice, min: getRequiredInteger(parsed.value) }
                : parsed.action === "max"
                  ? { dice, max: getRequiredInteger(parsed.value) }
                  : parsed.action === "range"
                    ? { dice, min: getRequiredInteger(parsed.min), max: getRequiredInteger(parsed.max) }
                    : { dice, exact: getRequiredInteger(parsed.value) }

        const data = await upsertDiceOverride(target, input)
        const response: ApiResponse<DiceRollOverrideRecord> = {
            success: true,
            data,
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

        console.error("[API] POST /api/dice/overrides error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno do servidor.",
            code: "INTERNAL_ERROR",
        }
        return NextResponse.json(response, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth()
        const parsed: DiceOverrideDeleteInput = DiceOverrideDeleteSchema.parse(await req.json().catch(() => ({})))
        const target = resolveGeneralDiceTarget({
            userId,
            diceSessionId: getOptionalString(parsed.diceSessionId),
            owlbearPlayerId: getOptionalString(parsed.owlbearPlayerId),
        })

        if (!target) return missingTargetResponse()

        const data = await clearDiceOverrides(target, getOptionalDiceType(parsed.dice))
        const response: ApiResponse<typeof data> = {
            success: true,
            data,
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

        console.error("[API] DELETE /api/dice/overrides error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno do servidor.",
            code: "INTERNAL_ERROR",
        }
        return NextResponse.json(response, { status: 500 })
    }
}
