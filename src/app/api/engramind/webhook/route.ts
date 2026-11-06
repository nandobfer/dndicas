import { handleWebhook } from "@/features/engramind/server/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Webhook do Engramind: público, autenticado só pela assinatura (`401` sem corpo quando inválida). */
export async function POST(request: Request): Promise<Response> {
    return handleWebhook(request)
}
