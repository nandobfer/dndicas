import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUserId } from "@/core/auth"
import { DomainError } from "@/lib/api/route"
import { prepareEntityUnderstanding, streamEntityUnderstanding } from "@/features/ai/server/entity-understanding"
import { sanitizeEntityUnderstandingHtml } from "@/features/entity-understanding/services/entity-understanding-html"
import type { EntityUnderstandingChatRequest } from "@/features/entity-understanding/types/entity-understanding.types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MessageSchema = z.object({
    role: z.enum(["user", "model"]),
    html: z.string().max(8_000),
})

const ChatRequestSchema = z.object({
    entityType: z.string().min(1).max(64),
    entityId: z.string().min(1).max(256),
    entity: z.unknown(),
    mode: z.enum(["initial_summary", "conversation"]),
    messages: z.array(MessageSchema).max(30),
}) satisfies z.ZodType<EntityUnderstandingChatRequest>

const encoder = new TextEncoder()

function encodeSse(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function errorResponse(message: string, status: number): NextResponse {
    return NextResponse.json({ error: { message } }, { status })
}

/** POST /api/entity-understanding/chat — resposta do agente "Entender com IA" em SSE (`chunk`, `done`, `error`). */
export async function POST(request: NextRequest) {
    const userId = (await getCurrentUserId()) ?? undefined

    const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return errorResponse("Dados inválidos para iniciar a conversa com IA.", 400)
    }

    let prepared: Awaited<ReturnType<typeof prepareEntityUnderstanding>>
    try {
        prepared = await prepareEntityUnderstanding()
    } catch (error) {
        if (error instanceof DomainError) return errorResponse(error.message, error.status)
        console.error("Entity understanding setup failed", error)
        return errorResponse("Não foi possível iniciar a conversa agora.", 500)
    }

    const input: EntityUnderstandingChatRequest = {
        ...parsed.data,
        messages: parsed.data.messages.map((message) => ({
            role: message.role,
            html: sanitizeEntityUnderstandingHtml(message.html),
        })),
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                let failed = false
                for await (const chunk of streamEntityUnderstanding(input, prepared, { userId, signal: request.signal })) {
                    if (chunk.type === "text") controller.enqueue(encodeSse("chunk", { text: chunk.text }))
                    else {
                        failed = true
                        controller.enqueue(encodeSse("error", { message: "Não foi possível gerar a resposta agora." }))
                        break
                    }
                }
                if (!failed) controller.enqueue(encodeSse("done", { ok: true }))
            } catch (error) {
                console.error("Entity understanding chat failed", error)
                controller.enqueue(encodeSse("error", { message: "Não foi possível gerar a resposta agora." }))
            } finally {
                controller.close()
            }
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    })
}
