import { currentUser } from "@clerk/nextjs/server"
import { EntityGenerationPusherService } from "@/features/entity-generation/realtime/entity-generation-pusher-service"
import { generateMonsterCandidates } from "@/features/entity-generation/server/monster-ai-generation-service"
import type { MonsterGenerationGenerateRequest } from "@/features/entity-generation/types/entity-generation.types"

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
        const body = (await request.json()) as MonsterGenerationGenerateRequest
        runId = body.runId?.trim()

        if (!runId) return Response.json({ error: "runId obrigatório." }, { status: 400 })

        const pusher = EntityGenerationPusherService.getInstance()
        await pusher.publishProgress(runId, { current: 0, total: 1, message: "Buscando fonte de dados..." })

        const result = await generateMonsterCandidates(id, (progress) => pusher.publishProgress(runId!, progress))
        return Response.json(result)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao gerar dados com IA."
        if (runId) await EntityGenerationPusherService.getInstance().publishFailure(runId, message).catch(() => undefined)
        return Response.json({ error: message }, { status: message === "Acesso negado." ? 403 : 500 })
    }
}
