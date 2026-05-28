import { currentUser } from "@clerk/nextjs/server"
import { EntityGenerationPusherService } from "@/features/entity-generation/realtime/entity-generation-pusher-service"
import { generateFeatCandidates } from "@/features/entity-generation/server/feat-ai-generation-service"
import type { FeatGenerationGenerateRequest } from "@/features/entity-generation/types/entity-generation.types"

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
        await requireAdmin()
        const { id } = await params
        const body = (await request.json()) as FeatGenerationGenerateRequest
        runId = body.runId?.trim()

        if (!runId) return Response.json({ error: "runId obrigatório." }, { status: 400 })

        const pusher = EntityGenerationPusherService.getInstance()
        await pusher.publishProgress(runId, { current: 0, total: 1, message: "Buscando fonte de dados..." })

        const result = await generateFeatCandidates(id, (progress) => pusher.publishProgress(runId!, progress))
        return Response.json(result)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao gerar dados com IA."
        if (runId) await EntityGenerationPusherService.getInstance().publishFailure(runId, message).catch(() => undefined)
        return Response.json({ error: message }, { status: message === "Acesso negado." ? 403 : 500 })
    }
}
