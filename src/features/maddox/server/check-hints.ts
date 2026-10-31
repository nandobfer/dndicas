import { loggerFor } from "@/lib/logger"
import { MADDOX_CHECK_HINT_TIMEOUT_MS, MADDOX_JEV_MODEL } from "../constants"
import type { IMaddoxCampaign } from "../models"
import type { MaddoxMasterDeclaration } from "./game-master"
import { rigorBlock } from "./interview-prompt"

/**
 * JEV "Pedir teste" (Maddox 5): com a chave `requires-check` ligada, antes da narração das declarações o JEV avalia,
 * numa só consulta, se cada declaração exige teste de atributo ou perícia. A resposta é só ORIENTAÇÃO na tarefa do
 * Maddox (ele decide). Chave desligada devolve as declarações como vieram; falha ou teto do JEV também (aviso no log).
 */

const log = loggerFor({ module: "maddox", feature: "check-hints" })

export async function withCheckHints(campaign: Pick<IMaddoxCampaign, "_id" | "rigor" | "setting" | "state">, declarations: MaddoxMasterDeclaration[]): Promise<MaddoxMasterDeclaration[]> {
    const indexes = declarations.map((declaration, index) => (declaration.kind === "declaration" && declaration.content.trim() ? index : -1)).filter((index) => index >= 0)
    if (indexes.length === 0) return declarations
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        if (!settings.jev?.["requires-check"]) return declarations
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new Error(`JEV passou de ${MADDOX_CHECK_HINT_TIMEOUT_MS} ms`))
            }, MADDOX_CHECK_HINT_TIMEOUT_MS)
        })
        const questions = Object.fromEntries(
            indexes.map((index) => [
                `d${index}`,
                {
                    type: "noul" as const,
                    instructions: `A ação declarada por ${declarations[index]!.characterName} — "${declarations[index]!.content.trim()}" — exige um teste de atributo, perícia ou resistência pelas regras do D&D e pelo grau de rigor da campanha?`,
                    criteria: {
                        true: "O resultado da tentativa é incerto e tem consequência relevante: pelas regras, pede um teste.",
                        false: "A ação é trivial, garantida, impossível ou só uma fala/intenção sem tentativa incerta: resolve-se na narração.",
                    },
                },
            ]),
        )
        let response: Awaited<ReturnType<typeof askJevSystemOne>>
        try {
            response = await Promise.race([
                askJevSystemOne({
                    model: MADDOX_JEV_MODEL,
                    tracking: { feature: "maddox", subject: String(campaign._id) },
                    signal: controller.signal,
                    state: { rigor: rigorBlock(campaign.rigor), cenario: campaign.setting ?? "", situacao: campaign.state?.situation ?? "" },
                    questions,
                }),
                timeout,
            ])
        } finally {
            if (timer) clearTimeout(timer)
        }
        const hinted = declarations.map((declaration, index) => {
            const answer = response.answers?.[`d${index}`]
            return answer?.type === "noul" && answer.noul >= 0.5 ? { ...declaration, checkHint: true } : declaration
        })
        log.info({ campaignId: String(campaign._id), hinted: hinted.filter((item) => item.checkHint).length, evaluated: indexes.length }, "[maddox] JEV avaliou se as declarações pedem teste")
        return hinted
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] JEV 'Pedir teste' indisponível; narrando sem a orientação")
        return declarations
    }
}
