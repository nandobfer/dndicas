import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_SHEET_AUDIT_ENTITY, MADDOX_SHEET_RIGORS } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { exhaustionLevel, exhaustionLine, isExhaustionDeath, nextExhaustion } from "../exhaustion-rules"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign } from "../models"

/**
 * Exaustão dos personagens (DND-58) — SOMENTE servidor. Usado pela ferramenta `update_character_exhaustion` do Maddox
 * (narração e "Pergunte ao mestre"). Grava na FICHA (auditoria FichaPersonagem, tempo real), põe na mesa a linha
 * "Exaustão de X: 1 → 2 (motivo)" e, no nível 6, o personagem morre (fora e dentro do combate tático).
 */

const log = loggerFor({ module: "maddox", feature: "exhaustion" })

export class ExhaustionError extends Error {}

export interface ExhaustionRequest {
    campaignId: Types.ObjectId
    characterName: string
    /** Variação em níveis (+1 ganha, −1 perde). */
    delta: number
    reason: string
    turnNumber: number
    origin: "narrator" | "question"
    requestedBy?: string | null
}

export interface ExhaustionResult {
    characterName: string
    before: number
    after: number
    dead: boolean
    line: string
}

export async function changeCharacterExhaustion(request: ExhaustionRequest): Promise<ExhaustionResult> {
    const campaign = await MaddoxCampaignModel.findById(request.campaignId).select("rigor ownerId").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId">>()
    if (!campaign) throw new ExhaustionError("Campanha não encontrada.")
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new ExhaustionError("Esta campanha é narrativa: não há exaustão na ficha.")
    const reason = request.reason.trim()
    if (!reason) throw new ExhaustionError("Informe o motivo da mudança na exaustão.")
    const delta = Math.trunc(request.delta)
    if (!delta) throw new ExhaustionError("Informe a variação da exaustão (positiva para ganhar níveis, negativa para perder).")

    const characters = await MaddoxCharacterModel.find({ campaignId: request.campaignId, status: { $in: ["active", "dead"] } }).select("name status sheetId").lean<{ _id: Types.ObjectId; name: string; status: string; sheetId: Types.ObjectId | null }[]>()
    const wanted = normalizeCatalogName(request.characterName)
    const character = characters.find((item) => normalizeCatalogName(item.name) === wanted)
    if (!character) throw new ExhaustionError(`Nenhum personagem jogador chamado "${request.characterName}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (character.status === "dead") throw new ExhaustionError(`${character.name} está morto.`)
    if (!character.sheetId) throw new ExhaustionError(`${character.name} não tem ficha.`)
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(character.sheetId).select("exhaustion").lean<{ _id: Types.ObjectId; exhaustion?: number }>()
    if (!sheet) throw new ExhaustionError(`A ficha de ${character.name} não foi encontrada.`)
    const before = exhaustionLevel(sheet.exhaustion)
    const after = nextExhaustion(before, delta)
    if (after === before) throw new ExhaustionError(`${character.name} já está com exaustão ${before}: nada a mudar.`)

    // Troca condicional: duas chamadas simultâneas não pulam um nível.
    const updated = await CharacterSheet.updateOne({ _id: sheet._id, exhaustion: sheet.exhaustion ?? { $in: [null, 0] } }, { $set: { exhaustion: after } })
    if (updated.modifiedCount === 0) throw new ExhaustionError("A ficha mudou agora há pouco: leia de novo e tente outra vez.")
    const { publishPatched } = await import("./combat-sheet")
    await publishPatched(String(sheet._id))
    await recordAudit({
        userId: request.requestedBy ?? campaign.ownerId,
        entidade: MADDOX_SHEET_AUDIT_ENTITY,
        entidadeId: String(sheet._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { exhaustion: before },
        depois: { by: "maddox", origin: request.origin === "question" ? "question-exhaustion" : "narrator-exhaustion", requestedBy: request.requestedBy ?? null, campaign: String(request.campaignId), character: character.name, reason, exhaustion: after },
    })
    const line = exhaustionLine(character.name, before, after, reason)
    await MaddoxCampaignMessageModel.create({ campaignId: request.campaignId, turnNumber: request.turnNumber, phase: request.origin === "question" ? "players" : "master", kind: "sheet-change", characterId: character._id, characterName: character.name, content: line })

    const dead = isExhaustionDeath(after)
    if (dead) await killByExhaustion(campaign, character._id)
    log.info({ campaignId: String(request.campaignId), character: character.name, before, after, dead, origin: request.origin }, "[maddox] exaustão do personagem alterada")
    return { characterName: character.name, before, after, dead, line }
}

/**
 * Exaustão 6 marcada direto na ficha (edição da ficha, fora da ferramenta do Maddox): o personagem de campanha Maddox
 * ligado à ficha morre do mesmo jeito. Chamado pelo PATCH da ficha; nunca lança.
 */
export async function applySheetExhaustionDeath(sheetId: string): Promise<void> {
    try {
        if (!Types.ObjectId.isValid(sheetId)) return
        const characters = await MaddoxCharacterModel.find({ sheetId: new Types.ObjectId(sheetId), status: "active" }).select("campaignId").lean<{ _id: Types.ObjectId; campaignId: Types.ObjectId }[]>()
        for (const character of characters) {
            const campaign = await MaddoxCampaignModel.findById(character.campaignId).select("rigor ownerId status").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId" | "status">>()
            if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) continue
            await killByExhaustion(campaign, character._id)
            log.info({ campaignId: String(campaign._id), characterId: String(character._id) }, "[maddox] exaustão 6 marcada na ficha: personagem morto")
            if (campaign.status === "active") {
                const { publishGameChanged } = await import("./game")
                await publishGameChanged(campaign._id)
            }
        }
    } catch (error) {
        log.warn({ sheetId, err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao aplicar a morte por exaustão marcada na ficha")
    }
}

/** Nível 6: o personagem da campanha fica `dead` (e, no combate tático, sai da luta). */
async function killByExhaustion(campaign: Pick<IMaddoxCampaign, "_id" | "ownerId">, characterId: Types.ObjectId): Promise<void> {
    const killed = await MaddoxCharacterModel.updateOne({ _id: characterId, campaignId: campaign._id, status: { $ne: "dead" } }, { $set: { status: "dead", currentState: "Morreu de exaustão.", currentStatePublic: true } })
    if (killed.modifiedCount === 0) return
    await recordAudit({ userId: campaign.ownerId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { by: "maddox", characterDied: String(characterId), cause: "exhaustion" } })
    const { findActiveTactical, mutateTactical } = await import("./tactical-combat")
    if (!(await findActiveTactical(campaign._id))) return
    await mutateTactical(campaign._id, (live) => {
        const state = live.tactical.characters.find((item) => item.characterId === String(characterId))
        if (state) state.dead = true
    }).catch((error) => log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] falha ao tirar do combate o personagem morto de exaustão"))
}
