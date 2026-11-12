import { Types } from "mongoose"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"
import { MADDOX_XP_DEFEATED_OUTCOMES } from "../constants"
import { MaddoxCampaignModel, MaddoxCombatModel, type IMaddoxCampaign, type IMaddoxCombat, type IMaddoxCombatant } from "../models"
import { grantExperience, progressionModeOf } from "./level-ups"

/**
 * XP dos monstros no fim do combate tático (DND-56, modo Experiência): cada adversário derrotado (morto, rendido,
 * capturado, posto em fuga ou poupado) vale a XP do ND dele pela tabela do D&D 2024, vezes a quantidade; o total é
 * dividido igualmente entre os personagens que participaram (humanos e Opex). Monstro sem ND (personalizado) não soma.
 */

const defeated = (combatant: IMaddoxCombatant) => combatant.side === "inimigo" && (Boolean(combatant.tactical?.defeated) || (combatant.outcome !== null && combatant.outcome !== undefined && (MADDOX_XP_DEFEATED_OUTCOMES as readonly string[]).includes(combatant.outcome)))

/** XP total dos adversários derrotados (pelo ND do catálogo). */
export async function defeatedMonstersXp(combat: Pick<IMaddoxCombat, "combatants">): Promise<number> {
    const rows = combat.combatants.filter(defeated).map((combatant) => ({ monsterId: combatant.tactical?.stats?.monsterId ?? null, quantity: Math.max(1, combatant.quantity ?? 1) }))
    const ids = [...new Set(rows.map((row) => row.monsterId).filter((id): id is string => Boolean(id && Types.ObjectId.isValid(String(id)))).map(String))]
    if (!ids.length) return 0
    const { MonsterModel } = await import("@/features/monsters/models/monster")
    const monsters = await (MonsterModel as unknown as { find: (q: unknown) => { select: (f: string) => { lean: <T>() => Promise<T> } } })
        .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
        .select("_id challengeRating experienceOverride")
        .lean<{ _id: Types.ObjectId; challengeRating?: string | null; experienceOverride?: number | null }[]>()
    const xpOf = new Map(monsters.map((monster) => [String(monster._id), monster.challengeRating ? getMonsterXp(monster.challengeRating, monster.experienceOverride ?? undefined) : 0]))
    return rows.reduce((sum, row) => sum + (row.monsterId ? (xpOf.get(String(row.monsterId)) ?? 0) * row.quantity : 0), 0)
}

/** Concede a XP do combate tático encerrado (uma vez só por combate). Nunca grava fora do modo Experiência. */
export async function grantCombatExperience(campaignId: Types.ObjectId, combat: IMaddoxCombat, turnNumber: number): Promise<number> {
    if (combat.mode !== "tactical") return 0
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor progression").lean<Pick<IMaddoxCampaign, "rigor" | "progression">>()
    if (!campaign || progressionModeOf(campaign) !== "experiencia") return 0
    const claimed = await MaddoxCombatModel.updateOne({ _id: combat._id, experienceGranted: { $ne: true } }, { $set: { experienceGranted: true } })
    if (!claimed.modifiedCount) return 0
    const total = await defeatedMonstersXp(combat)
    const participants = (combat.tactical?.characters ?? []).filter((character) => !character.left)
    if (!total || !participants.length) return 0
    const share = Math.floor(total / participants.length)
    if (!share) return 0
    await grantExperience(campaignId, participants.map((character) => ({ characterId: character.characterId, amount: share })), `Combate "${combat.title || "sem título"}"`, "combat", turnNumber)
    return total
}
