import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_LEVEL_UP_CONSUMPTION_ORIGIN, MADDOX_LEVEL_UP_OPEX_FAILURE } from "../constants"
import { ABILITY_BY_LABEL } from "../interview-scores"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter, type IMaddoxLevelUp } from "../models"
import type { LevelUpChoices, LevelUpFeatAttributeRule, LevelUpOptions } from "@/features/character-sheets/level-up/level-up-types"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { MaddoxGameStateDto } from "../game-types"
import { completeLevelUpStep, currentSteps, hasLevels } from "./level-ups"
import { isOpexRunning, runOpexOnce } from "./opex-runtime"

/**
 * Subida de nível do Personagem Opex (DND-56) — SOMENTE servidor. As escolhas que o wizard mostraria (PV, subclasse,
 * talento ou melhoria, magias e truques) vão ao agente do personagem numa tarefa de decisão (JSON validado, sem
 * ferramentas, com memórias, personalidade e motivações); o servidor rola o PV e aplica com a mesma validação do wizard.
 * Falha depois de uma nova tentativa: o degrau fica `failed` e o dono conclui no wizard da ficha do Opex.
 */

const log = loggerFor({ module: "maddox", feature: "level-up-opex" })

type CampaignDoc = IMaddoxCampaign
type MemberDoc = IMaddoxCampaignMember

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Falha com motivo já em linguagem de mesa (pt-BR), que o dono pode ler no card. */
class OpexLevelUpFailure extends Error {}

/**
 * Motivo que vai ao card: só o texto amigável (falha conhecida ou erro de domínio, que já é pt-BR para o usuário). O erro
 * técnico (exceção do runtime, do provedor, do bundle) fica só no log e em `errorDetail`, nunca na tela compartilhada.
 */
export function friendlyLevelUpFailure(error: unknown): string {
    if (error instanceof OpexLevelUpFailure || error instanceof DomainError) return error.message
    return MADDOX_LEVEL_UP_OPEX_FAILURE.generic
}

export const opexLevelUpKey = (stepId: Types.ObjectId | string) => `levelup:${String(stepId)}`

/** Degraus atuais dos Opex que esperam decisão: cada um roda fora da fila da campanha (não segura a mesa). */
export async function autoLevelUps(campaign: CampaignDoc, opex: ReadonlyMap<string, MemberDoc>): Promise<void> {
    if (!hasLevels(campaign.rigor)) return
    for (const step of currentSteps(campaign)) {
        if (step.kind !== "opex") continue
        if (step.status === "deciding") {
            await recoverInterrupted(campaign._id, step, opex.has(String(step.memberId)))
            continue
        }
        if (step.status !== "pending" || !opex.has(String(step.memberId))) continue
        void runOpexOnce(opexLevelUpKey(step._id), () => runOpexLevelUp(campaign._id, step._id))
    }
}

/** Decisão que não roda mais neste processo depois de começar. */
const INTERRUPTED_TEXT = MADDOX_LEVEL_UP_OPEX_FAILURE.interrupted

/**
 * `deciding` sem execução em andamento neste processo (app de instância única: o processo caiu no meio da decisão)
 * volta a `pending` e é decidido de novo; se o Personagem Opex não está mais na mesa, fica `failed` para o dono concluir.
 */
async function recoverInterrupted(campaignId: Types.ObjectId, step: IMaddoxLevelUp, opexAtTable: boolean): Promise<void> {
    if (isOpexRunning(opexLevelUpKey(step._id))) return
    const filter = { _id: campaignId, levelUps: { $elemMatch: { _id: step._id, status: "deciding" } } }
    if (!opexAtTable) {
        await markFailed(campaignId, step._id, INTERRUPTED_TEXT, "deciding sem execução e o Personagem Opex fora da mesa")
        return
    }
    const reset = await MaddoxCampaignModel.updateOne(filter, { $set: { "levelUps.$.status": "pending", "levelUps.$.decidingAt": null } })
    if (!reset.modifiedCount) return
    log.warn({ campaignId: String(campaignId), stepId: String(step._id) }, "[maddox] subida de nível do Personagem Opex interrompida: decidindo de novo")
    void runOpexOnce(opexLevelUpKey(step._id), () => runOpexLevelUp(campaignId, step._id))
}

const ruleText = (rule: LevelUpFeatAttributeRule) => (rule.kind === "asi" ? "+2 em um atributo ou +1 em dois" : rule.kind === "one-of" ? `+1 em ${rule.options.map((key) => MADDOX_ABILITY_LABELS[key]).join(" ou ")}` : "")

function taskInput(options: LevelUpOptions, step: Pick<IMaddoxLevelUp, "characterName" | "fromLevel" | "toLevel">, reason: string, previousError: string | null) {
    return {
        characterName: step.characterName,
        reason,
        fromLevel: step.fromLevel,
        toLevel: step.toLevel,
        hitDie: options.hitDie,
        hpAverage: options.hpAverage,
        traits: options.traits.map((trait) => trait.label),
        feat: options.feat ? { kind: options.feat.kind, cap: options.feat.cap, options: options.feat.options.map((option) => ({ id: option.id, name: option.name, rule: ruleText(option.attributeRule) })) } : null,
        spells: options.spells
            ? {
                  cantrips: options.spells.cantrips,
                  spells: options.spells.spells,
                  maxCircle: options.spells.maxCircle,
                  cantripOptions: options.spells.cantripOptions,
                  spellOptions: options.spells.spellOptions,
                  known: options.spells.known.filter((spell) => spell.circle > 0),
                  swap: options.spells.swap.allowed,
              }
            : null,
        resources: options.resources.map((change) => `${change.name}: ${change.before ?? 0} → ${change.after}`),
        scores: Object.entries(options.scores)
            .map(([key, value]) => `${MADDOX_ABILITY_LABELS[key as AttributeType]} ${value}`)
            .join(", "),
        previousError,
    }
}

/** Resposta do agente → escolhas do wizard (o servidor rola o PV na "rolagem"). */
export function choicesOfDecision(decision: import("./opex-prompt").OpexLevelUpDecision, options: LevelUpOptions, subclassId: string | null): LevelUpChoices {
    const attributes = Object.fromEntries(
        Object.entries(decision.talento?.atributos ?? {})
            .map(([label, value]) => [ABILITY_BY_LABEL[label] ?? (label in MADDOX_ABILITY_LABELS ? label : null), value] as const)
            .filter((entry): entry is readonly [AttributeType, number] => Boolean(entry[0]) && entry[1] > 0),
    ) as Partial<Record<AttributeType, number>>
    return {
        targetLevel: options.targetLevel,
        hp: decision.pv === "rolagem" ? { method: "roll" } : { method: "average" },
        subclassId,
        feat: options.feat && decision.talento ? { id: decision.talento.id, attributes } : null,
        cantrips: options.spells?.cantrips ? decision.truques : [],
        spells: options.spells?.spells ? decision.magias : [],
        swap: options.spells?.swap.allowed && decision.troca ? { remove: decision.troca.sai, add: decision.troca.entra } : null,
    }
}

async function markFailed(campaignId: Types.ObjectId, stepId: Types.ObjectId, error: string, detail: string | null) {
    await MaddoxCampaignModel.updateOne({ _id: campaignId, levelUps: { $elemMatch: { _id: stepId, status: "deciding" } } }, { $set: { "levelUps.$.status": "failed", "levelUps.$.error": error.slice(0, 1_000), "levelUps.$.errorDetail": detail?.slice(0, 2_000) ?? null } })
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

export async function runOpexLevelUp(campaignId: Types.ObjectId, stepId: Types.ObjectId): Promise<void> {
    const claimed = await MaddoxCampaignModel.updateOne({ _id: campaignId, levelUps: { $elemMatch: { _id: stepId, status: "pending", kind: "opex" } } }, { $set: { "levelUps.$.status": "deciding", "levelUps.$.error": null, "levelUps.$.errorDetail": null, "levelUps.$.decidingAt": new Date() } })
    if (!claimed.modifiedCount) return
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
        const step = campaign?.levelUps?.find((item) => String(item._id) === String(stepId))
        if (!campaign || !step) return
        const member = await MaddoxCampaignMemberModel.findOne({ _id: step.memberId, campaignId, kind: "opex", status: "joined" }).lean<MemberDoc>()
        const character = await MaddoxCharacterModel.findById(step.characterId).lean<IMaddoxCharacter>()
        if (!member || !character?.sheetId) throw new OpexLevelUpFailure(MADDOX_LEVEL_UP_OPEX_FAILURE.noSheet)
        const reason = await reasonOf(campaign, step)
        const [{ loadOpexModel, opexPromptContext, decideOpex }, prompts, { buildLevelUpOptions }, { applyLevelUp, }, { LevelUpError }, { spellSwapResolver }] = await Promise.all([
            import("./opex-player"),
            import("./opex-prompt"),
            import("@/features/character-sheets/level-up/level-up-options"),
            import("@/features/character-sheets/level-up/level-up-apply"),
            import("@/features/character-sheets/level-up/level-up-context"),
            import("./spell-swap"),
        ])
        const { settings, model } = await loadOpexModel(campaign.rigor)
        const instructions = prompts.buildOpexInstructions(await opexPromptContext(campaign, member, character, settings))
        const sheetId = String(character.sheetId)
        const resolveSpellSwap = spellSwapResolver(campaign.rigor)
        const base = { model, instructions, origin: MADDOX_LEVEL_UP_CONSUMPTION_ORIGIN, subject: String(campaignId), title: `Personagem Opex · subida de nível · ${campaign.name}` }
        let options = await buildLevelUpOptions(sheetId, { resolveSpellSwap })
        if (options.targetLevel !== step.toLevel) throw new OpexLevelUpFailure(MADDOX_LEVEL_UP_OPEX_FAILURE.levelMismatch(options.currentLevel, step.toLevel))
        let subclassId: string | null = null
        if (options.subclass.required) {
            const ids = options.subclass.options.map((option) => option.id)
            const picked = await decideOpex({
                ...base,
                prompt: prompts.opexLevelUpSubclassTask({ characterName: step.characterName, toLevel: step.toLevel, reason, options: options.subclass.options.map((option) => ({ ...option, traits: (options.subclassTraits[option.id] ?? []).map((trait) => trait.label) })) }),
                schema: prompts.opexLevelUpSubclassSchema(ids),
            })
            subclassId = picked.subclasse
            options = await buildLevelUpOptions(sheetId, { subclassId, resolveSpellSwap })
        }
        let previousError: string | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
            const decision = await decideOpex({ ...base, prompt: prompts.opexLevelUpTask(taskInput(options, step, reason, previousError)), schema: prompts.opexLevelUpSchema, attempts: attempt === 0 ? 2 : 1 })
            try {
                const { gains } = await applyLevelUp(sheetId, choicesOfDecision(decision, options, subclassId), { userId: campaign.ownerId, by: "opex", context: { campaign: String(campaignId), character: step.characterName } }, { resolveSpellSwap })
                await completeLevelUpStep(campaignId, stepId, gains, "opex")
                log.info({ campaignId: String(campaignId), character: step.characterName, level: step.toLevel }, "[maddox] Personagem Opex subiu de nível")
                return
            } catch (error) {
                if (!(error instanceof LevelUpError) || error.status !== 422) throw error
                previousError = error.message
            }
        }
        throw new OpexLevelUpFailure(MADDOX_LEVEL_UP_OPEX_FAILURE.invalidChoice(previousError))
    } catch (error) {
        log.warn({ campaignId: String(campaignId), stepId: String(stepId), err: errorText(error) }, "[maddox] subida de nível do Personagem Opex falhou: fica para o dono")
        await markFailed(campaignId, stepId, friendlyLevelUpFailure(error), errorText(error)).catch(() => undefined)
    }
}

/** Motivo da subida (o da declaração ou o da XP), para a tarefa. */
async function reasonOf(campaign: CampaignDoc, step: IMaddoxLevelUp): Promise<string> {
    if (step.declarationId) return campaign.progression?.declared?.find((item) => item.id === step.declarationId)?.reason ?? ""
    if (!step.messageId) return ""
    const { MaddoxCampaignMessageModel } = await import("../models")
    const message = await MaddoxCampaignMessageModel.findById(step.messageId).select("levelUp").lean<{ levelUp?: { reason?: string } | null }>()
    return message?.levelUp?.reason ?? ""
}

/**
 * "Tentar de novo" do dono (DND-56): o degrau do Personagem Opex que falhou volta a `pending` e o agente decide de novo
 * (fora da fila da campanha). Só o dono, só o degrau atual do personagem, só com o Opex ainda na mesa.
 */
export async function retryOpexLevelUp(campaignId: string, stepId: string, userId: string): Promise<MaddoxGameStateDto> {
    const [{ assertActive, getGameState, publishGameChanged }, { loadMembership }] = await Promise.all([import("./game"), import("./campaigns")])
    const campaign = (await loadMembership(campaignId, userId)).campaign as CampaignDoc
    assertActive(campaign)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode fazer isso.", "FORBIDDEN")
    const step = Types.ObjectId.isValid(stepId) ? campaign.levelUps?.find((item) => String(item._id) === stepId) : undefined
    if (!step || step.kind !== "opex") throw new DomainError(404, "Subida de nível não encontrada.", "LEVEL_UP_NOT_FOUND")
    if (step.status !== "failed") throw new DomainError(409, "Esta subida de nível não está com falha.", "LEVEL_UP_NOT_FAILED")
    if (!currentSteps(campaign).some((item) => String(item._id) === stepId)) throw new DomainError(409, "Conclua antes a subida anterior deste personagem.", "LEVEL_UP_NOT_CURRENT")
    const member = await MaddoxCampaignMemberModel.findOne({ _id: step.memberId, campaignId: campaign._id, kind: "opex", status: "joined" }).select("_id").lean()
    if (!member) throw new DomainError(409, "Este Personagem Opex não está mais na mesa. Conclua a subida no wizard da ficha.", "OPEX_NOT_AT_TABLE")
    const reset = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, levelUps: { $elemMatch: { _id: step._id, status: "failed", kind: "opex" } } },
        { $set: { "levelUps.$.status": "pending", "levelUps.$.error": null, "levelUps.$.errorDetail": null, "levelUps.$.decidingAt": null } },
    )
    if (!reset.modifiedCount) throw new DomainError(409, "Esta subida de nível não está com falha.", "LEVEL_UP_NOT_FAILED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { levelUp: stepId, character: step.characterName, toLevel: step.toLevel, opex: "retry" } })
    log.info({ campaignId: String(campaign._id), stepId, character: step.characterName }, "[maddox] dono pediu nova decisão da subida de nível do Personagem Opex")
    void runOpexOnce(opexLevelUpKey(step._id), () => runOpexLevelUp(campaign._id, step._id))
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}
