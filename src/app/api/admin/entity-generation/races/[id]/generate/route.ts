import { currentUser } from "@/core/auth/server"
import { generateRaceCandidates } from "@/features/entity-generation/server/race-ai-generation-service"
import { EntityGenerationPusherService } from "@/features/entity-generation/realtime/entity-generation-pusher-service"
import type { RaceGenerationGenerateRequest } from "@/features/entity-generation/types/entity-generation.types"

export const maxDuration = 300

async function requireAdmin() {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== "admin") {
        throw new Error("Acesso negado.")
    }
    return user
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let runId: string | undefined

    try {
        const user = await requireAdmin()
        const { id } = await params
        const body = (await request.json()) as RaceGenerationGenerateRequest
        runId = body.runId?.trim()

        if (!runId) {
            return Response.json({ error: "runId obrigatório." }, { status: 400 })
        }

        const generationRunId = runId
        const pusher = EntityGenerationPusherService.getInstance()
        await pusher.publishProgress(generationRunId, { current: 0, total: 1, message: "Buscando fonte de dados..." })

        const result = await generateRaceCandidates(id, user.id, (progress) => pusher.publishProgress(generationRunId, progress))
        return Response.json(result)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao gerar dados com IA."

        if (runId) {
            await EntityGenerationPusherService.getInstance().publishFailure(runId, message).catch(() => undefined)
        }

        return Response.json({ error: message }, { status: message === "Acesso negado." ? 403 : 500 })
    }
}
