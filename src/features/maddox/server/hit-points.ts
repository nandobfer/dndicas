import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { abilityModifier } from "../combat-rules"
import { MADDOX_SHEET_AUDIT_ENTITY, MADDOX_SHEET_RIGORS } from "../constants"
import { applyHitPointsChange, availableHitDice, hitPointsLine, parseHitDice, type HitPointsChange, type MaddoxHitPointOperation, type SheetHitPoints } from "../hit-points-ops"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign } from "../models"

/**
 * PV dos personagens fora do combate tático (DND-49) — SOMENTE servidor. Usado pela ferramenta
 * `update_character_hit_points` do narrador e pela checagem de quem está a 0 PV ao abrir o combate (no job da
 * preparação da mesa). Grava na FICHA (auditoria FichaPersonagem, tempo real) e põe na mesa a linha
 * "PV de X: 0 → 1 (motivo)". Nos graus sem ficha não existe; durante o combate tático ativo os PV mudam pelas ações e
 * pelo `apply_effect`.
 */

const log = loggerFor({ module: "maddox", feature: "hit-points" })

export class HitPointsError extends Error {}

export interface HitPointsRequest {
    campaignId: Types.ObjectId
    characterName: string
    operation: MaddoxHitPointOperation
    /** curar: dados que o servidor rola ("2d4+2"). */
    dice?: string | null
    /** curar: valor fixo; definir: o novo PV. */
    value?: number | null
    /** descanso-curto: quantos dados de vida gasta. */
    hitDice?: number | null
    reason: string
    turnNumber: number
    /** `narrator`: ferramenta do narrador (recusada no combate tático ativo); `combat-open`: checagem antes da iniciativa. */
    origin: "narrator" | "combat-open" | "question"
    /** DND-51: quem pediu pelo "Pergunte ao mestre" (vai na auditoria). */
    requestedBy?: string | null
}

export interface HitPointsResult {
    characterName: string
    before: number
    after: number
    hpMax: number
    line: string
}

type StoredSheet = { _id: Types.ObjectId; hpCurrent?: number | null; hpMax?: number | null; hpTemp?: number | null; deathSavesSuccess?: number; deathSavesFailure?: number; hitDiceUsed?: number; hitDiceTotal?: string; constitution?: number }

export async function changeCharacterHitPoints(request: HitPointsRequest): Promise<HitPointsResult> {
    const campaign = await MaddoxCampaignModel.findById(request.campaignId).select("rigor ownerId").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId">>()
    if (!campaign) throw new HitPointsError("Campanha não encontrada.")
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new HitPointsError("Esta campanha é narrativa: não há PV na ficha para mudar.")
    const { findActiveTactical, mutateTactical } = await import("./tactical-combat")
    const combat = await findActiveTactical(request.campaignId)
    if (request.origin === "narrator" && combat) throw new HitPointsError("Há um combate tático em andamento: os PV mudam pelas ações dos jogadores e pelo `apply_effect`.")
    const reason = request.reason.trim()
    if (!reason) throw new HitPointsError("Informe o motivo da mudança de PV.")

    const characters = await MaddoxCharacterModel.find({ campaignId: request.campaignId, status: { $in: ["active", "dead"] } }).select("name status sheetId").lean<{ _id: Types.ObjectId; name: string; status: string; sheetId: Types.ObjectId | null }[]>()
    const wanted = normalizeCatalogName(request.characterName)
    const character = characters.find((item) => normalizeCatalogName(item.name) === wanted)
    if (!character) throw new HitPointsError(`Nenhum personagem jogador chamado "${request.characterName}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (character.status === "dead") throw new HitPointsError(`${character.name} está morto: os PV não mudam.`)
    if (!character.sheetId) throw new HitPointsError(`${character.name} não tem ficha.`)
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(character.sheetId).lean<StoredSheet>()
    if (!sheet || !sheet.hpMax) throw new HitPointsError(`A ficha de ${character.name} não tem PV máximo.`)
    const current: SheetHitPoints = {
        hp: Math.max(0, sheet.hpCurrent ?? sheet.hpMax),
        hpMax: sheet.hpMax,
        tempHp: Math.max(0, sheet.hpTemp ?? 0),
        deathSuccess: sheet.deathSavesSuccess ?? 0,
        deathFailure: sheet.deathSavesFailure ?? 0,
        hitDiceUsed: sheet.hitDiceUsed ?? 0,
        hitDiceTotal: sheet.hitDiceTotal ?? "",
    }

    const { rollExpression } = await import("./tactical-combat")
    let change: HitPointsChange
    let rolled: string | null = null
    switch (request.operation) {
        case "curar": {
            if (request.dice?.trim()) {
                const roll = await rollExpression(request.dice.trim(), { label: `${character.name} · cura` }).catch(() => null)
                if (!roll) throw new HitPointsError(`Expressão de dados inválida: "${request.dice}".`)
                rolled = `${request.dice.trim()} = ${roll.total}`
                change = { op: "curar", amount: roll.total }
            } else if (request.value && request.value > 0) change = { op: "curar", amount: request.value }
            else throw new HitPointsError("Para curar, envie `dados` (o servidor rola) ou `valor` (cura fixa).")
            break
        }
        case "definir":
            if (request.value === undefined || request.value === null) throw new HitPointsError("Para definir, envie `valor` com o novo PV.")
            change = { op: "definir", value: request.value }
            break
        case "descanso-curto": {
            const spend = Math.max(0, Math.floor(request.hitDice ?? 0))
            const parsed = parseHitDice(current.hitDiceTotal)
            if (!parsed) throw new HitPointsError(`A ficha de ${character.name} não tem dados de vida registrados.`)
            if (spend <= 0) throw new HitPointsError("Informe em `dadosDeVida` quantos dados de vida o personagem gasta no descanso curto.")
            if (spend > availableHitDice(current)) throw new HitPointsError(`${character.name} só tem ${availableHitDice(current)} dado(s) de vida disponível(is).`)
            const con = abilityModifier(sheet.constitution ?? 10)
            const roll = await rollExpression(`${spend}${parsed.die}`, { label: `${character.name} · dados de vida` })
            const healed = Math.max(0, roll.total + con * spend)
            rolled = `${spend}${parsed.die}${con ? `${con > 0 ? "+" : ""}${con * spend}` : ""} = ${healed}`
            change = { op: "descanso-curto", healed, spent: spend }
            break
        }
        default:
            change = { op: request.operation }
    }
    const { next, error } = applyHitPointsChange(current, change)
    if (error) throw new HitPointsError(error)

    await CharacterSheet.updateOne(
        { _id: sheet._id },
        { $set: { hpCurrent: next.hp, hpTemp: next.tempHp, deathSavesSuccess: next.deathSuccess, deathSavesFailure: next.deathFailure, hitDiceUsed: next.hitDiceUsed } },
    )
    const { publishPatched } = await import("./combat-sheet")
    await publishPatched(String(sheet._id))
    await recordAudit({
        userId: request.requestedBy ?? campaign.ownerId,
        entidade: MADDOX_SHEET_AUDIT_ENTITY,
        entidadeId: String(sheet._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { hpCurrent: current.hp, hpTemp: current.tempHp, deathSaves: { success: current.deathSuccess, failure: current.deathFailure }, hitDiceUsed: current.hitDiceUsed },
        depois: { by: "maddox", origin: request.origin === "narrator" ? "narrator-hit-points" : request.origin === "question" ? "question-hit-points" : "combat-open-hit-points", requestedBy: request.requestedBy ?? null, campaign: String(request.campaignId), character: character.name, operation: request.operation, reason, ...(rolled ? { rolled } : {}), hpCurrent: next.hp, hpTemp: next.tempHp, deathSaves: { success: next.deathSuccess, failure: next.deathFailure }, hitDiceUsed: next.hitDiceUsed },
    })
    // Na abertura do combate (fase de iniciativa), o estado do personagem no combate acompanha a ficha.
    if (combat) {
        await mutateTactical(request.campaignId, (live) => {
            const state = live.tactical.characters.find((item) => item.characterId === String(character._id))
            if (!state || state.dead) return
            state.hpZero = next.hp <= 0
            state.stable = next.hp <= 0 && next.deathSuccess >= 3
            if (next.hp > 0) state.conditions = state.conditions.filter((condition) => condition.key !== "unconscious")
        })
    }
    const line = hitPointsLine(character.name, current.hp, next.hp, reason)
    await MaddoxCampaignMessageModel.create({ campaignId: request.campaignId, turnNumber: request.turnNumber, phase: "master", kind: "hit-points", characterId: character._id, characterName: character.name, content: line })
    log.info({ campaignId: String(request.campaignId), character: character.name, operation: request.operation, before: current.hp, after: next.hp, origin: request.origin }, "[maddox] PV do personagem alterados")
    return { characterName: character.name, before: current.hp, after: next.hp, hpMax: next.hpMax, line }
}

/** Linha "X segue caído (motivo)" da checagem ao abrir o combate, quando o Maddox confirma que o personagem não se recuperou. */
export async function postStillDown(campaignId: Types.ObjectId, turnNumber: number, character: { id: Types.ObjectId; name: string }, reason: string): Promise<void> {
    await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "hit-points", characterId: character.id, characterName: character.name, content: `${character.name} segue caído com 0 PV (${reason.trim() || "a história não mostra recuperação"})` })
}
