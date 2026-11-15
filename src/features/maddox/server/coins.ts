import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { MADDOX_SHEET_RIGORS } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { coinChangeProblem, type MaddoxCoinChange } from "../coin-rules"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign } from "../models"

/**
 * Moedas dos personagens pela narração (DND-65) — SOMENTE servidor. Usado pela ferramenta `update_character_coins` fora
 * do "Pergunte ao mestre" (lá ela passa por `updateCharacterSheetFromQuestion`). Grava pela lista fechada da ficha
 * (`applySheetChanges`: auditoria FichaPersonagem e tempo real) e põe na mesa "Moedas de X: 11 po → 11 po, 15 pp (motivo)".
 */

const log = loggerFor({ module: "maddox", feature: "coins" })

export class CoinsError extends Error {}

export interface CoinsRequest {
    campaignId: Types.ObjectId
    characterName: string
    change: MaddoxCoinChange
    reason: string
    turnNumber: number
}

export interface CoinsResult {
    characterName: string
    before: string
    after: string
    line: string
}

export async function changeCharacterCoins(request: CoinsRequest): Promise<CoinsResult> {
    const campaign = await MaddoxCampaignModel.findById(request.campaignId).select("rigor ownerId").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId">>()
    if (!campaign) throw new CoinsError("Campanha não encontrada.")
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new CoinsError("Esta campanha é narrativa: não há moedas na ficha.")
    const reason = request.reason.trim()
    if (!reason) throw new CoinsError("Informe o motivo da mudança nas moedas.")
    const problem = coinChangeProblem(request.change)
    if (problem) throw new CoinsError(`Moedas: ${problem}.`)

    const characters = await MaddoxCharacterModel.find({ campaignId: request.campaignId, status: { $in: ["active", "dead"] } }).select("name status sheetId").lean<{ _id: Types.ObjectId; name: string; status: string; sheetId: Types.ObjectId | null }[]>()
    const wanted = normalizeCatalogName(request.characterName)
    const character = characters.find((item) => normalizeCatalogName(item.name) === wanted)
    if (!character) throw new CoinsError(`Nenhum personagem jogador chamado "${request.characterName}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (!character.sheetId) throw new CoinsError(`${character.name} não tem ficha.`)

    const { applySheetChanges } = await import("./combat-sheet-writes")
    const written = await applySheetChanges([{ type: "coins", ...request.change, reason }], {
        sheetId: String(character.sheetId),
        campaignId: String(request.campaignId),
        auditUserId: campaign.ownerId,
        requestedBy: null,
        characterName: character.name,
        origin: "narrator",
    })
    const outcome = written.changes[0]
    if (!outcome) throw new CoinsError(`A ficha de ${character.name} não foi encontrada.`)
    if (outcome.refused) throw new CoinsError(outcome.refused)
    if (!outcome.applied) throw new CoinsError("A ficha mudou agora há pouco: leia o saldo de novo e tente outra vez.")

    const line = `Moedas de ${character.name}: ${outcome.before} → ${outcome.after} (${reason})`
    await MaddoxCampaignMessageModel.create({ campaignId: request.campaignId, turnNumber: request.turnNumber, phase: "master", kind: "sheet-change", characterId: character._id, characterName: character.name, content: line })
    log.info({ campaignId: String(request.campaignId), character: character.name, before: outcome.before, after: outcome.after }, "[maddox] moedas do personagem alteradas")
    return { characterName: character.name, before: outcome.before, after: outcome.after, line }
}
