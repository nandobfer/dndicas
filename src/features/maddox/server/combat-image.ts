import { loggerFor } from "@/lib/logger"
import { MaddoxCombatModel, type IMaddoxCombat } from "../models"

/**
 * Gatilho da imagem de fim de batalha (Maddox 6) — ponto de extensão da geração de imagens nas cenas (Maddox 10). Hoje
 * só registra o pedido: a cena final (`finalScene`, descrição visual escrita pelo Maddox) fica gravada no combate e a
 * imagem fica `awaiting-feature`. O Maddox 10 troca este corpo pela geração (respeitando as situações e a frequência
 * configuradas na aba do Maddox).
 */

const log = loggerFor({ module: "maddox", feature: "combat-image" })

export async function onCombatEnded(combat: Pick<IMaddoxCombat, "_id" | "campaignId" | "title" | "finalScene">): Promise<void> {
    const status = combat.finalScene?.trim() ? "awaiting-feature" : "skipped"
    await MaddoxCombatModel.updateOne({ _id: combat._id }, { $set: { image: { status, requestedAt: new Date() } } })
    log.info({ campaignId: String(combat.campaignId), combatId: String(combat._id), status }, "[maddox] imagem de fim de batalha: geração de imagens ainda não disponível (Maddox 10)")
}
