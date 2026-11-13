import type { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { MADDOX_MILESTONE_TRIGGER_LABELS, MADDOX_RIGOR_LEVEL_DEFS, type MaddoxMilestoneTrigger } from "../constants"
import { MaddoxCampaignModel, MaddoxCombatModel, type IMaddoxCampaign } from "../models"
import { groupLevel, partyOf, progressionModeOf, setPendingMilestone, type PartyMember } from "./level-ups"

/**
 * Decisão "marco atingido?" (DND-56, modo Marco): roda só em acontecimentos-chave (fim de combate, missão concluída,
 * capítulo encerrado) e na ferramenta "Avaliar marco de nível". Com a chave `level-milestone` do JEV ligada, decide o
 * JEV; desligada (ou JEV sem chave/indisponível), uma geração curta do narrador. Falha final = `null` (sem orientação).
 */

const log = loggerFor({ module: "maddox", feature: "level-milestone" })

export interface MilestoneDecision {
    reached: boolean
    reason: string
    via: "jev" | "narrator"
}

type CampaignDoc = Pick<IMaddoxCampaign, "_id" | "name" | "rigor" | "setting" | "startingLevel" | "progression" | "chapters">

const partyLine = (member: PartyMember) => `- ${member.characterName}${member.kind === "opex" ? " (Personagem Opex)" : ""}${member.className ? `, ${member.className}` : ""}, nível ${member.level ?? "?"}`

/** Fatos enviados à decisão (montados pelo servidor, nunca pelo modelo). */
export async function milestoneFacts(campaign: CampaignDoc, trigger: MaddoxMilestoneTrigger, detail: string): Promise<{ facts: Record<string, string>; party: PartyMember[]; level: number }> {
    const party = (await partyOf(campaign._id)).filter((member) => member.ready)
    const level = groupLevel(party, campaign)
    const declared = campaign.progression?.declared ?? []
    const lastTurn = declared.length ? Math.max(...declared.map((item) => item.turnNumber)) : 0
    const combats = await MaddoxCombatModel.find({ campaignId: campaign._id, status: "ended", endedTurn: { $gt: lastTurn } })
        .select("title outcome mode")
        .sort({ _id: 1 })
        .limit(20)
        .lean<{ title?: string; outcome?: string; mode?: string }[]>()
    const chapters = (campaign.chapters ?? []).filter((chapter) => chapter.turnNumber > lastTurn)
    const since = [
        ...combats.map((combat) => `- Combate ${combat.mode === "tactical" ? "tático" : "narrativo"} "${combat.title ?? "sem título"}" (${combat.outcome ?? "encerrado"})`),
        ...chapters.map((chapter) => `- Capítulo encerrado: ${chapter.title}`),
    ]
    return {
        party,
        level,
        facts: {
            "Grau de rigor": MADDOX_RIGOR_LEVEL_DEFS[campaign.rigor]?.label ?? campaign.rigor,
            "Cenário (aventura oficial ou mundo próprio)": (campaign.setting ?? "").slice(0, 3_000),
            "Personagens ativos": `${party.length} personagem(ns)\n${party.map(partyLine).join("\n")}`,
            "Nível atual do grupo": String(level),
            Acontecimento: `${MADDOX_MILESTONE_TRIGGER_LABELS[trigger]}${detail ? `: ${detail}` : ""}`,
            "Desde a última subida": [lastTurn ? `(última subida declarada no turno ${lastTurn})` : "(o grupo ainda não subiu de nível nesta campanha)", ...since].join("\n"),
        },
    }
}

/** Decide se o marco foi atingido. `null` = grau/modo sem marco, nível 20 ou a decisão falhou. */
export async function evaluateLevelMilestone(campaign: CampaignDoc, trigger: MaddoxMilestoneTrigger, detail: string): Promise<MilestoneDecision | null> {
    if (progressionModeOf(campaign) !== "marco") return null
    const { facts, party, level } = await milestoneFacts(campaign, trigger, detail)
    if (!party.length || level >= 20) return null
    const input = { campaignId: String(campaign._id), campaignName: campaign.name, rigor: campaign.rigor, facts }
    const ai = await import("./level-up-ai")
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    if (settings.jev?.["level-milestone"]) {
        try {
            const probability = await ai.askMilestoneJev(input)
            if (probability !== null) {
                const reached = probability >= 0.5
                const reason = reached
                    ? `O ${MADDOX_MILESTONE_TRIGGER_LABELS[trigger]}${detail ? ` (${detail})` : ""} vale como marco para ${party.length} personagem(ns) no nível ${level}.`
                    : `O ${MADDOX_MILESTONE_TRIGGER_LABELS[trigger]}${detail ? ` (${detail})` : ""} ainda não basta para o grupo de ${party.length} personagem(ns) sair do nível ${level}.`
                log.info({ campaignId: input.campaignId, trigger, probability, reached }, "[maddox] JEV avaliou o marco de nível")
                return { reached, reason, via: "jev" }
            }
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: input.campaignId }, "[maddox] JEV do marco de nível indisponível; decide o narrador")
        }
    }
    try {
        const raw = (await ai.askMilestoneNarrator(input)) as { atingido?: unknown; motivo?: unknown } | null
        if (typeof raw?.atingido !== "boolean") throw new Error("resposta fora do formato")
        const reason = typeof raw.motivo === "string" && raw.motivo.trim() ? raw.motivo.trim().slice(0, 500) : raw.atingido ? "O grupo atingiu um marco da história." : "O grupo ainda não atingiu um marco."
        log.info({ campaignId: input.campaignId, trigger, reached: raw.atingido }, "[maddox] narrador avaliou o marco de nível")
        return { reached: raw.atingido, reason, via: "narrator" }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: input.campaignId, trigger }, "[maddox] decisão do marco de nível indisponível")
        return null
    }
}

/**
 * Fim de combate sem a decisão já tomada na geração (fim forçado do combate tático): o marco positivo vira orientação da
 * próxima narração. Nunca lança.
 */
export async function milestoneAfterCombat(campaignId: Types.ObjectId, combat: { _id: Types.ObjectId; title?: string; milestoneEvaluated?: boolean }, turnNumber: number): Promise<void> {
    try {
        if (combat.milestoneEvaluated) return
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
        if (!campaign || progressionModeOf(campaign) !== "marco") return
        const claimed = await MaddoxCombatModel.updateOne({ _id: combat._id, milestoneEvaluated: { $ne: true } }, { $set: { milestoneEvaluated: true } })
        if (!claimed.modifiedCount) return
        const decision = await evaluateLevelMilestone(campaign, "combat-end", combat.title ?? "")
        if (decision?.reached) await setPendingMilestone(campaignId, "combat-end", decision.reason, turnNumber)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] falha ao avaliar o marco depois do combate")
    }
}
