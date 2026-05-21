import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { ApiResponse } from "@/core/types/common"
import { DiceOverrideCreateSchema, DiceOverrideDeleteSchema } from "@/features/dice-roller/schemas"
import { resolveGeneralDiceTarget } from "@/features/dice-roller/server/dice-target"
import { clearDiceOverrides, listDiceOverrides, upsertDiceOverride } from "@/features/dice-roller/server/dice-override-service"
import type { DiceRollOverrideRecord } from "@/features/dice-roller/types"

function missingTargetResponse() {
    const response: ApiResponse<null> = {
        success: false,
        error: "diceSessionId é obrigatório para overrides anônimos.",
        code: "DICE_SESSION_REQUIRED",
    }
    return NextResponse.json(response, { status: 400 })
}

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        const url = new URL(req.url)
        const target = resolveGeneralDiceTarget({
            userId,
            diceSessionId: url.searchParams.get("diceSessionId"),
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
        const parsed = DiceOverrideCreateSchema.parse(await req.json())
        const target = resolveGeneralDiceTarget({ userId, diceSessionId: parsed.diceSessionId })

        if (!target) return missingTargetResponse()

        const input =
            parsed.action === "min"
                ? { dice: parsed.dice, min: parsed.value }
                : parsed.action === "max"
                  ? { dice: parsed.dice, max: parsed.value }
                  : parsed.action === "range"
                    ? { dice: parsed.dice, min: parsed.min, max: parsed.max }
                    : { dice: parsed.dice, exact: parsed.value }

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
        const parsed = DiceOverrideDeleteSchema.parse(await req.json().catch(() => ({})))
        const target = resolveGeneralDiceTarget({ userId, diceSessionId: parsed.diceSessionId })

        if (!target) return missingTargetResponse()

        const data = await clearDiceOverrides(target, parsed.dice)
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
