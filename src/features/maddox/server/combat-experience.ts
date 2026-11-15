import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"
import { MADDOX_XP_DEFEATED_OUTCOMES } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCombatModel, type IMaddoxCampaign, type IMaddoxCombat, type IMaddoxCombatant } from "../models"
import { grantExperience, partyOf, progressionModeOf, ProgressionRefusal } from "./level-ups"

/**
 * XP dos monstros no fim do combate tático (DND-56, modo Experiência): cada adversário derrotado (morto, rendido,
 * capturado, posto em fuga ou poupado) vale a XP do ND dele pela tabela do D&D 2024, vezes a quantidade; o total é
 * dividido igualmente entre os personagens que participaram (humanos e Opex).
 *
 * DND-70: adversário derrotado fora do catálogo (bloco próprio, sem ND) continua valendo XP, mas o servidor não estima:
 * o combate fica com XP pendente (`experiencePending` e card de pendência) e o mestre estima e concede com
 * `grant_experience` citando o combate (`resolveCombatExperience`, uma vez por combate). Nunca termina sem desfecho.
 */

const log = loggerFor({ module: "maddox", feature: "combat-experience" })

const defeated = (combatant: IMaddoxCombatant) => combatant.side === "inimigo" && (Boolean(combatant.tactical?.defeated) || (combatant.outcome !== null && combatant.outcome !== undefined && (MADDOX_XP_DEFEATED_OUTCOMES as readonly string[]).includes(combatant.outcome)))

const quantityOf = (combatant: IMaddoxCombatant) => Math.max(1, combatant.quantity ?? 1)

const validId = (id: unknown): id is string | Types.ObjectId => Boolean(id && Types.ObjectId.isValid(String(id)))

export const combatExperienceReason = (combat: Pick<IMaddoxCombat, "title">) => `Combate "${combat.title || "sem título"}"`

export interface CombatExperienceBreakdown {
    /** XP oficial (catálogo) dos derrotados com ND. */
    catalogXp: number
    /** Derrotados sem ND do catálogo (bloco próprio ou monstro sem ND): a XP espera a estimativa do mestre. */
    missing: { name: string; quantity: number }[]
    /** Quantos adversários (linhas) foram derrotados. */
    defeatedCount: number
}

/** XP oficial dos derrotados e os que ficaram sem ND. */
export async function combatExperienceBreakdown(combat: Pick<IMaddoxCombat, "combatants">): Promise<CombatExperienceBreakdown> {
    const rows = combat.combatants.filter(defeated)
    const ids = [...new Set(rows.map((combatant) => combatant.tactical?.stats?.monsterId).filter(validId).map(String))]
    const xpOf = new Map<string, number>()
    if (ids.length) {
        const { MonsterModel } = await import("@/features/monsters/models/monster")
        const monsters = await (MonsterModel as unknown as { find: (q: unknown) => { select: (f: string) => { lean: <T>() => Promise<T> } } })
            .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
            .select("_id challengeRating experienceOverride")
            .lean<{ _id: Types.ObjectId; challengeRating?: string | null; experienceOverride?: number | null }[]>()
        for (const monster of monsters) {
            const xp = monster.challengeRating ? getMonsterXp(monster.challengeRating, monster.experienceOverride ?? undefined) : 0
            if (xp > 0) xpOf.set(String(monster._id), xp)
        }
    }
    let catalogXp = 0
    const missing: { name: string; quantity: number }[] = []
    for (const combatant of rows) {
        const monsterId = combatant.tactical?.stats?.monsterId
        const xp = validId(monsterId) ? xpOf.get(String(monsterId)) : undefined
        if (xp) catalogXp += xp * quantityOf(combatant)
        else missing.push({ name: combatant.name, quantity: quantityOf(combatant) })
    }
    return { catalogXp, missing, defeatedCount: rows.length }
}

/** XP total dos adversários derrotados (pelo ND do catálogo). */
export async function defeatedMonstersXp(combat: Pick<IMaddoxCombat, "combatants">): Promise<number> {
    return (await combatExperienceBreakdown(combat)).catalogXp
}

const participantsOf = (combat: Pick<IMaddoxCombat, "tactical">) => (combat.tactical?.characters ?? []).filter((character) => !character.left)

export interface CombatExperienceResult {
    /** XP oficial concedida (total). */
    granted: number
    /** Adversários cuja XP ficou pendente para o mestre. */
    pending: { name: string; quantity: number }[]
}

/** Concede a XP do combate tático encerrado (uma vez só por combate). Nunca grava fora do modo Experiência. */
export async function grantCombatExperience(campaignId: Types.ObjectId, combat: IMaddoxCombat, turnNumber: number): Promise<CombatExperienceResult> {
    const none: CombatExperienceResult = { granted: 0, pending: [] }
    if (combat.mode !== "tactical") return none
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor progression").lean<Pick<IMaddoxCampaign, "rigor" | "progression">>()
    if (!campaign || progressionModeOf(campaign) !== "experiencia") return none
    // `experienceProcessedAt` no mesmo claim: o combate em processamento nunca parece legado (`legacyBurned`).
    const claimed = await MaddoxCombatModel.updateOne({ _id: combat._id, experienceGranted: { $ne: true } }, { $set: { experienceGranted: true, experienceProcessedAt: new Date() } })
    if (!claimed.modifiedCount) return none
    const breakdown = await combatExperienceBreakdown(combat)
    const participants = participantsOf(combat)
    const context = { campaignId: String(campaignId), combatId: String(combat._id) }
    if (!breakdown.defeatedCount) {
        log.info(context, "[maddox] combate encerrado sem adversário derrotado: sem XP")
        return none
    }
    if (!participants.length) {
        log.info(context, "[maddox] combate encerrado sem personagem participante: sem XP")
        return none
    }
    const share = Math.floor(breakdown.catalogXp / participants.length)
    let granted = 0
    if (share > 0) {
        const result = await grantExperience(campaignId, participants.map((character) => ({ characterId: character.characterId, amount: share })), combatExperienceReason(combat), "combat", turnNumber, { combatId: combat._id })
        granted = result.total
    }
    // A parte oficial que dividiu para 0 também vira pendência: o mestre decide o valor, nada some em silêncio.
    const pending = granted > 0 ? breakdown.missing : breakdown.missing.length ? breakdown.missing : combat.combatants.filter(defeated).map((combatant) => ({ name: combatant.name, quantity: quantityOf(combatant) }))
    if (pending.length) await markExperiencePending(campaignId, combat, pending, turnNumber)
    log.info({ ...context, catalogXp: breakdown.catalogXp, granted, pending: pending.map((item) => item.name) }, "[maddox] XP do fim do combate")
    return { granted, pending }
}

async function markExperiencePending(campaignId: Types.ObjectId, combat: IMaddoxCombat, adversaries: { name: string; quantity: number }[], turnNumber: number) {
    await MaddoxCombatModel.updateOne({ _id: combat._id }, { $set: { experiencePending: { adversaries, turnNumber, at: new Date() } } })
    await MaddoxCampaignMessageModel.create({
        campaignId,
        turnNumber,
        phase: "master",
        kind: "experience",
        content: "",
        experience: { source: "combat", reason: combatExperienceReason(combat), total: 0, entries: [], combatId: combat._id, estimated: false, pending: adversaries },
    })
}

// ── XP pendente (o mestre estima) ──────────────────────────────────────────────

type CombatRow = Pick<IMaddoxCombat, "_id" | "title" | "status" | "mode" | "combatants" | "tactical" | "experienceGranted" | "experienceProcessedAt" | "experiencePending" | "experienceResolved" | "endedTurn">

const COMBAT_FIELDS = "_id title status mode combatants tactical experienceGranted experienceProcessedAt experiencePending experienceResolved endedTurn"

export interface PendingCombatExperience {
    combatId: string
    title: string
    adversaries: { name: string; quantity: number }[]
    /** Personagens que participaram (recebem a XP). */
    characterIds: string[]
    characterNames: string[]
    /** Combate encerrado antes da DND-70 sem XP gravada (a automação "queimou" o combate). */
    legacy: boolean
}

const pendingOf = (combat: CombatRow, legacy: boolean): PendingCombatExperience => ({
    combatId: String(combat._id),
    title: combat.title,
    adversaries: legacy ? combat.combatants.filter(defeated).map((combatant) => ({ name: combatant.name, quantity: quantityOf(combatant) })) : (combat.experiencePending?.adversaries ?? []),
    characterIds: participantsOf(combat).map((character) => String(character.characterId)),
    characterNames: participantsOf(combat).map((character) => character.name),
    legacy,
})

/**
 * Antes da DND-70 o combate era marcado como concedido antes da conta: tático encerrado, `experienceGranted` sem
 * `experienceProcessedAt` (o código novo grava os dois juntos), sem pendência, sem resolução, com derrotado e sem card de XP
 * dele (pelo `combatId` ou pelo motivo `Combate "<título>"`).
 */
async function legacyBurned(campaignId: Types.ObjectId, combats: readonly CombatRow[]): Promise<CombatRow[]> {
    const candidates = combats.filter((combat) => combat.mode === "tactical" && combat.status === "ended" && combat.experienceGranted && !combat.experienceProcessedAt && !combat.experiencePending && !combat.experienceResolved && combat.combatants.some(defeated))
    if (!candidates.length) return []
    const cards = await MaddoxCampaignMessageModel.find({ campaignId, kind: "experience", "experience.source": "combat" }).select("experience").lean<{ experience?: { reason?: string; combatId?: Types.ObjectId | null } | null }[]>()
    const ids = new Set(cards.map((card) => (card.experience?.combatId ? String(card.experience.combatId) : null)).filter(Boolean))
    const reasons = new Set(cards.map((card) => card.experience?.reason ?? ""))
    return candidates.filter((combat) => !ids.has(String(combat._id)) && !reasons.has(combatExperienceReason(combat)))
}

/** Pendências sem o filtro de elegibilidade (o motivo da recusa precisa delas). */
async function rawPendingCombatExperience(campaignId: Types.ObjectId): Promise<PendingCombatExperience[]> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor progression").lean<Pick<IMaddoxCampaign, "rigor" | "progression">>()
    if (!campaign || progressionModeOf(campaign) !== "experiencia") return []
    const combats = await MaddoxCombatModel.find({ campaignId, mode: "tactical", status: "ended", experienceResolved: null }).select(COMBAT_FIELDS).sort({ _id: 1 }).lean<CombatRow[]>()
    const legacy = new Set((await legacyBurned(campaignId, combats)).map((combat) => String(combat._id)))
    return combats.filter((combat) => combat.experiencePending || legacy.has(String(combat._id))).map((combat) => pendingOf(combat, legacy.has(String(combat._id))))
}

/**
 * Combates com XP pendente para o mestre (modo Experiência), do mais antigo ao mais novo. Só os que o mestre consegue
 * liquidar: pelo menos um participante com ficha concluída (senão a pendência ficaria na tarefa para sempre).
 */
export async function pendingCombatExperience(campaignId: Types.ObjectId): Promise<PendingCombatExperience[]> {
    const pending = await rawPendingCombatExperience(campaignId)
    if (!pending.length) return []
    const ready = new Set((await partyOf(campaignId)).filter((member) => member.ready).map((member) => String(member.characterId)))
    return pending.filter((item) => item.characterIds.some((id) => ready.has(id)))
}

/** Final do id mostrado na tarefa (o mestre cita o combate por ele ou pelo id inteiro). */
export const combatRefOf = (combatId: string) => combatId.slice(-6)

/** O combate citado em `grant_experience`, se a XP dele está pendente. Recusa com o motivo em pt-BR. */
export async function findPendingCombat(campaignId: Types.ObjectId, ref: string): Promise<PendingCombatExperience> {
    const wanted = ref.trim().toLowerCase()
    const combats = await MaddoxCombatModel.find({ campaignId }).select(COMBAT_FIELDS).sort({ _id: 1 }).lean<CombatRow[]>()
    const combat = combats.find((item) => String(item._id) === wanted) ?? (wanted.length >= 4 ? combats.find((item) => String(item._id).endsWith(wanted)) : undefined) ?? combats.find((item) => item.title.trim().toLowerCase() === wanted)
    const [pending, raw] = await Promise.all([pendingCombatExperience(campaignId), rawPendingCombatExperience(campaignId)])
    const listing = pending.length ? ` Combates com XP pendente: ${pending.map((item) => `"${item.title}" (${combatRefOf(item.combatId)})`).join(", ")}.` : " Nenhum combate tem XP pendente."
    if (!combat) throw new ProgressionRefusal(`Combate "${ref}" não encontrado.${listing}`)
    if (combat.status !== "ended") throw new ProgressionRefusal(`O combate "${combat.title}" ainda não terminou: a XP dele sai no fim.`)
    if (combat.mode !== "tactical") throw new ProgressionRefusal(`"${combat.title}" foi um combate narrativo: conceda a XP sem \`combate\`.`)
    if (combat.experienceResolved) throw new ProgressionRefusal(`A XP do combate "${combat.title}" já foi concedida (${combat.experienceResolved.amount.toLocaleString("pt-BR")} XP por personagem).`)
    const found = pending.find((item) => item.combatId === String(combat._id))
    if (!found && raw.some((item) => item.combatId === String(combat._id))) throw new ProgressionRefusal(`Nenhum participante do combate "${combat.title}" tem ficha concluída para receber XP.`)
    if (!found) throw new ProgressionRefusal(`O combate "${combat.title}" não tem XP pendente: a XP dele já saiu pela tabela oficial.${listing}`)
    return found
}

/**
 * Grava a XP estimada pelo mestre para o combate pendente (depois da fala, em `commitProgression`): troca condicional
 * (`experienceResolved: null`), então vale uma vez por combate. Se a gravação falhar, a pendência volta.
 */
export async function resolveCombatExperience(campaignId: Types.ObjectId, grant: { entries: { characterId: string; amount: number }[]; reason: string; combatId?: string; requestedBy?: string | null }, turnNumber: number): Promise<number> {
    if (!grant.combatId || !Types.ObjectId.isValid(grant.combatId)) return 0
    const combatId = new Types.ObjectId(grant.combatId)
    const amount = grant.entries[0]?.amount ?? 0
    const claimed = await MaddoxCombatModel.updateOne(
        { _id: combatId, campaignId, status: "ended", experienceResolved: null },
        { $set: { experienceGranted: true, experienceResolved: { by: "master", reason: grant.reason, amount, total: 0, messageId: null, at: new Date() } } },
    )
    if (!claimed.modifiedCount) {
        log.warn({ campaignId: String(campaignId), combatId: grant.combatId }, "[maddox] XP do combate já resolvida; concessão do mestre descartada")
        return 0
    }
    // Fichas já somadas antes de uma falha: a pendência NÃO volta (a próxima concessão duplicaria a XP de quem recebeu).
    const applied: { characterId: Types.ObjectId; amount: number }[] = []
    try {
        const result = await grantExperience(campaignId, grant.entries, grant.reason, "grant", turnNumber, { combatId, estimated: true, requestedBy: grant.requestedBy ?? null, onSheetUpdated: (characterId, value) => applied.push({ characterId, amount: value }) })
        if (!result.total) throw new Error("nenhum personagem recebeu XP")
        await MaddoxCombatModel.updateOne({ _id: combatId }, { $set: { "experienceResolved.total": result.total, "experienceResolved.messageId": result.messageId } })
        return result.total
    } catch (error) {
        if (!applied.length) {
            await MaddoxCombatModel.updateOne({ _id: combatId }, { $set: { experienceResolved: null } })
            throw error
        }
        const total = applied.reduce((sum, item) => sum + item.amount, 0)
        await MaddoxCombatModel.updateOne({ _id: combatId }, { $set: { "experienceResolved.total": total, "experienceResolved.partial": true } })
        log.error({ campaignId: String(campaignId), combatId: grant.combatId, applied: applied.map((item) => String(item.characterId)), total, err: error instanceof Error ? error.message : String(error) }, "[maddox] XP estimada do combate gravada em parte das fichas; combate mantido como resolvido")
        return total
    }
}
