import { loggerFor } from "@/lib/logger"
import { MADDOX_COMBAT_HINT_TIMEOUT_MS, MADDOX_COMBAT_RIGORS, MADDOX_JEV_MODEL, MADDOX_TACTICAL_COMBAT_RIGORS } from "../constants"
import type { IMaddoxCampaign } from "../models"
import type { MaddoxMasterDeclaration } from "./game-master"
import { rigorBlock } from "./interview-prompt"

/**
 * JEV "Início ou fim de combate" (Maddox 6): com a chave `combat-boundary` ligada, nos graus com combate narrativo, antes
 * da narração das declarações (também nos graus táticos do Maddox 7) o JEV avalia numa só pergunta se elas levam a cena a um combate (fora de combate) ou o
 * encerram (em combate). A resposta é só ORIENTAÇÃO na tarefa: quem abre e fecha o combate é o Maddox, pelas ferramentas.
 * Chave desligada, falha ou teto do JEV: narra sem a orientação (aviso no log).
 */

const log = loggerFor({ module: "maddox", feature: "combat-hints" })

export async function combatBoundaryHint(
    campaign: Pick<IMaddoxCampaign, "_id" | "rigor" | "setting" | "state">,
    declarations: readonly MaddoxMasterDeclaration[],
    inCombat: { title: string } | null,
): Promise<"start" | "end" | null> {
    if (!MADDOX_COMBAT_RIGORS.includes(campaign.rigor) && !MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)) return null
    const actions = declarations.filter((item) => item.kind === "declaration" && item.content.trim())
    if (actions.length === 0) return null
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        if (!settings.jev?.["combat-boundary"]) return null
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new Error(`JEV passou de ${MADDOX_COMBAT_HINT_TIMEOUT_MS} ms`))
            }, MADDOX_COMBAT_HINT_TIMEOUT_MS)
        })
        const listed = actions.map((item) => `- ${item.characterName}: "${item.content.trim()}"`).join("\n")
        const question = inCombat
            ? {
                  type: "noul" as const,
                  instructions: `O grupo está em combate ("${inCombat.title}"). Com as ações declaradas abaixo, o combate está terminando (inimigos derrotados ou rendidos, fuga, trégua)?\n${listed}`,
                  criteria: { true: "As ações encerram a luta ou tornam o fim dela iminente.", false: "A luta continua depois dessas ações." },
              }
            : {
                  type: "noul" as const,
                  instructions: `Com as ações declaradas abaixo, a cena entra em combate agora (alguém ataca ou a hostilidade começa)?\n${listed}`,
                  criteria: { true: "Há um ataque ou uma hostilidade física começando.", false: "Conversa, exploração, ameaça sem ataque ou ação pacífica." },
              }
        let response: Awaited<ReturnType<typeof askJevSystemOne>>
        try {
            response = await Promise.race([
                askJevSystemOne({
                    model: MADDOX_JEV_MODEL,
                    tracking: { feature: "maddox", subject: String(campaign._id) },
                    signal: controller.signal,
                    state: { rigor: rigorBlock(campaign.rigor), cenario: campaign.setting ?? "", situacao: campaign.state?.situation ?? "" },
                    questions: { combate: question },
                }),
                timeout,
            ])
        } finally {
            if (timer) clearTimeout(timer)
        }
        const answer = response.answers?.combate
        const yes = answer?.type === "noul" && answer.noul >= 0.5
        const hint = yes ? (inCombat ? "end" : "start") : null
        log.info({ campaignId: String(campaign._id), inCombat: Boolean(inCombat), hint }, "[maddox] JEV avaliou o início ou fim de combate")
        return hint
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] JEV 'Início ou fim de combate' indisponível; narrando sem a orientação")
        return null
    }
}
