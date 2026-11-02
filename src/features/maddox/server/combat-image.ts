import { loggerFor } from "@/lib/logger"
import { MaddoxCampaignMessageModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxNpcModel, type IMaddoxCombat } from "../models"

/**
 * Imagem de fim de batalha (Maddox 6 → Maddox 10): com a situação "Fim de batalha" ativa, a cena final escrita pelo
 * Maddox em `end_combat` vira imagem ligada ao card "Fim do combate", com os personagens e os NPCs conhecidos do combate
 * como referência de aparência. Respeita a chave da campanha e a frequência como as demais automáticas (sem o JEV: o fim
 * do combate é um fato). `combat.image.status`: `requested` (pedida) ou `skipped` (sem cena final ou fora das regras).
 */

const log = loggerFor({ module: "maddox", feature: "combat-image" })

export async function onCombatEnded(combat: Pick<IMaddoxCombat, "_id" | "campaignId" | "title" | "finalScene" | "combatants" | "endedTurn">): Promise<void> {
    const setStatus = (status: "requested" | "skipped") => MaddoxCombatModel.updateOne({ _id: combat._id }, { $set: { image: { status, requestedAt: new Date() } } })
    const scene = combat.finalScene?.trim()
    if (!scene) {
        await setStatus("skipped")
        log.info({ campaignId: String(combat.campaignId), combatId: String(combat._id) }, "[maddox] imagem de fim de batalha: combate sem cena final")
        return
    }
    const card = await MaddoxCampaignMessageModel.findOne({ campaignId: combat.campaignId, kind: "combat", "combat.combatId": combat._id, "combat.event": "end" }).select("_id turnNumber segment").lean<{ _id: import("mongoose").Types.ObjectId; turnNumber: number; segment: number }>()
    const npcIds = (combat.combatants ?? []).map((item) => item.npcId).filter((id): id is NonNullable<typeof id> => Boolean(id))
    const [characters, npcs] = await Promise.all([
        MaddoxCharacterModel.find({ campaignId: combat.campaignId, status: "active", "interview.status": "done" }).select("name").lean<{ name: string }[]>(),
        npcIds.length ? MaddoxNpcModel.find({ _id: { $in: npcIds }, campaignId: combat.campaignId, visibility: "players" }).select("name").lean<{ name: string }[]>() : Promise.resolve([]),
    ])
    const { scheduleSceneImage } = await import("./scene-images")
    const scheduled = await scheduleSceneImage({
        campaignId: combat.campaignId,
        source: "combat-end",
        turnNumber: card?.turnNumber ?? combat.endedTurn ?? 0,
        segment: card?.segment ?? 0,
        messageId: card?._id ?? null,
        situation: "combat-end",
        description: scene,
        caption: combat.title,
        characters: characters.map((item) => item.name),
        npcs: npcs.map((item) => item.name),
    }).catch((error: unknown) => {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(combat.campaignId), combatId: String(combat._id) }, "[maddox] imagem de fim de batalha indisponível")
        return { image: null, reason: "falha ao pedir a imagem" }
    })
    await setStatus(scheduled.image ? "requested" : "skipped")
    log.info({ campaignId: String(combat.campaignId), combatId: String(combat._id), requested: Boolean(scheduled.image), reason: scheduled.reason }, "[maddox] imagem de fim de batalha")
}
