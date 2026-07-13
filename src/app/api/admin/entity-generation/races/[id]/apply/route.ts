import { currentUser } from "@/core/auth/server"
import { applyRaceGenerationCandidate } from "@/features/entity-generation/server/race-ai-generation-service"
import type { RaceGenerationApplyRequest } from "@/features/entity-generation/types/entity-generation.types"

async function requireAdmin() {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== "admin") {
        throw new Error("Acesso negado.")
    }
    return user
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireAdmin()
        const { id } = await params
        const body = (await request.json()) as RaceGenerationApplyRequest

        if (!body.candidate) {
            return Response.json({ error: "Candidato obrigatório." }, { status: 400 })
        }

        const race = await applyRaceGenerationCandidate(id, body.candidate, user.id)
        return Response.json({ race })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao salvar geração com IA."
        return Response.json({ error: message }, { status: message === "Acesso negado." ? 403 : 500 })
    }
}
