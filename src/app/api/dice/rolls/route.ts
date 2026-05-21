import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { ApiResponse } from "@/core/types/common"
import { DiceRollRequestSchema } from "@/features/dice-roller/schemas"
import { resolveGeneralDiceTarget } from "@/features/dice-roller/server/dice-target"
import { rollGeneralDice } from "@/features/dice-roller/server/dice-roll-service"
import type { DiceRollResponse } from "@/features/dice-roller/types"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        const body = await req.json()
        const parsed = DiceRollRequestSchema.parse(body)
        const target = resolveGeneralDiceTarget({ userId, diceSessionId: parsed.diceSessionId })

        if (!target) {
            const response: ApiResponse<null> = {
                success: false,
                error: "diceSessionId é obrigatório para rolagens anônimas.",
                code: "DICE_SESSION_REQUIRED",
            }
            return NextResponse.json(response, { status: 400 })
        }

        const result = await rollGeneralDice(parsed, target)
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
