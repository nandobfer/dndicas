import { loggerFor } from "@/lib/logger"
import { MADDOX_JEV_MODEL, MADDOX_SCENE_IMAGE_JEV_TIMEOUT_MS } from "../constants"
import type { IMaddoxCampaign } from "../models"
import { rigorBlock } from "./interview-prompt"

/**
 * JEV "Gerar imagem na cena" (Maddox 10): com a chave `scene-image` ligada, antes de gerar a imagem pedida pelo Maddox
 * (`request_scene_image`) o JEV confere se a narração gravada corresponde mesmo à situação pedida — filtro contra
 * excesso. `null` = sem veredito (falha ou teto): a imagem segue (o Maddox decidiu; aviso no log).
 */

const log = loggerFor({ module: "maddox", feature: "scene-image-hints" })

export async function sceneImageMatches(
    campaign: Pick<IMaddoxCampaign, "_id" | "rigor" | "setting" | "state">,
    situation: { label: string; description: string },
    narration: string,
): Promise<number | null> {
    try {
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new Error(`JEV passou de ${MADDOX_SCENE_IMAGE_JEV_TIMEOUT_MS} ms`))
            }, MADDOX_SCENE_IMAGE_JEV_TIMEOUT_MS)
        })
        let response: Awaited<ReturnType<typeof askJevSystemOne>>
        try {
            response = await Promise.race([
                askJevSystemOne({
                    model: MADDOX_JEV_MODEL,
                    tracking: { feature: "maddox", subject: String(campaign._id) },
                    signal: controller.signal,
                    state: { rigor: rigorBlock(campaign.rigor), cenario: campaign.setting ?? "", situacao: campaign.state?.situation ?? "" },
                    questions: {
                        imagem: {
                            type: "noul" as const,
                            instructions: `A narração abaixo é uma cena da situação "${situation.label}" (${situation.description})?\n\nNarração:\n${narration.trim().slice(0, 6000)}`,
                            criteria: { true: "A narração mostra claramente essa situação acontecendo agora.", false: "A situação não acontece nesta narração ou é só mencionada de passagem." },
                        },
                    },
                }),
                timeout,
            ])
        } finally {
            if (timer) clearTimeout(timer)
        }
        const answer = response.answers?.imagem
        const score = answer?.type === "noul" ? answer.noul : null
        log.info({ campaignId: String(campaign._id), situation: situation.label, score }, "[maddox] JEV avaliou a imagem da cena")
        return score
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] JEV 'Gerar imagem na cena' indisponível; a imagem segue sem o filtro")
        return null
    }
}
