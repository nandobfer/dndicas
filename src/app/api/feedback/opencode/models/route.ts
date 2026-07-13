import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import type { ApiResponse } from "@/core/types/common"
import { listOpenCodeModels } from "@/features/feedback/services/opencode/opencode-cli-service"
import type { OpenCodeModelOption } from "@/features/feedback/types/feedback.types"

export async function GET() {
    try {
        const user = await currentUser()
        if (!user || user.publicMetadata?.role !== "admin") {
            const response: ApiResponse<null> = {
                success: false,
                error: "Você não tem permissão para consultar modelos do OpenCode",
                code: "FORBIDDEN",
            }

            return NextResponse.json(response, { status: user ? 403 : 401 })
        }

        const models = await listOpenCodeModels()
        const response: ApiResponse<OpenCodeModelOption[]> = {
            success: true,
            data: models,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("OpenCode models GET error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Não foi possível carregar os modelos disponíveis do OpenCode",
            code: "OPENCODE_MODELS_ERROR",
        }

        return NextResponse.json(response, { status: 500 })
    }
}
