import { NextRequest } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { generateRaceCandidates } from "@/features/entity-generation/server/race-ai-generation-service"

async function requireAdmin() {
    const user = await currentUser()
    if (!user || user.publicMetadata?.role !== "admin") {
        throw new Error("Acesso negado.")
    }
    return user
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAdmin()
        const { id } = await params
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            async start(controller) {
                const send = (event: string, data: unknown) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
                }

                try {
                    const result = await generateRaceCandidates(id, (progress) => send("progress", progress))
                    for (const candidate of result.candidates) send("candidate", candidate)
                    send("done", { candidateCount: result.candidates.length })
                } catch (error) {
                    send("failure", { message: error instanceof Error ? error.message : "Erro ao gerar dados com IA." })
                } finally {
                    controller.close()
                }
            },
        })

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            },
        })
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Acesso negado." }, { status: 403 })
    }
}
