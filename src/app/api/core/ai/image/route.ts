import { z } from "zod"
import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireActor } from "@/features/auth/server/actor"
import { generateAndStoreDndImage } from "@/features/ai/server/image-generator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GenerateImageSchema = z
    .object({
        prompt: z.string().trim().min(1, "Prompt é obrigatório").max(4000, "Até 4.000 caracteres").optional(),
        entityLabel: z.string().trim().min(1).max(200).optional(),
        preferredAspectRatio: z.string().trim().min(1).max(10).optional(),
        formData: z.unknown().optional(),
    })
    .refine((value) => Boolean(value.prompt) || typeof value.formData !== "undefined", {
        message: "Prompt ou dados do formulário são obrigatórios",
        path: ["prompt"],
    })

/**
 * @openapi
 * /api/core/ai/image:
 *   post:
 *     summary: Gera uma imagem de D&D com o agente "Gerador de imagens"
 *     description: Usa o provedor e o modelo configurados em Integrações › Provedores de IA › Gerador de imagens (login obrigatório).
 *     responses:
 *       201: { description: Imagem gerada e gravada no storage }
 *       409: { description: Agente desativado ou provedor não conectado }
 *       422: { description: Imagem acima de 5MB }
 */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireActor()
    const body = await parseBody(req, GenerateImageSchema)
    if (!body.ok) return body.response
    const image = await generateAndStoreDndImage({ ...body.data, userId: actor.id })
    return created({ key: image.key, url: image.url, mimeType: image.mimeType })
})
