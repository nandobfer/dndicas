import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { MADDOX_LEVEL_UP_CONSUMPTION_ORIGIN } from "../constants"
import { ABILITY_BY_LABEL } from "../interview-scores"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter, type IMaddoxLevelUp } from "../models"
import type { LevelUpChoices, LevelUpFeatAttributeRule, LevelUpOptions } from "@/features/character-sheets/level-up/level-up-types"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
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
const INTERRUPTED_TEXT = "A decisão da subida de nível foi interrompida (o servidor reiniciou)."

/**
 * `deciding` sem execução em andamento neste processo (app de instância única: o processo caiu no meio da decisão)
 * volta a `pending` e é decidido de novo; se o Personagem Opex não está mais na mesa, fica `failed` para o dono concluir.
 */
async function recoverInterrupted(campaignId: Types.ObjectId, step: IMaddoxLevelUp, opexAtTable: boolean): Promise<void> {
    if (isOpexRunning(opexLevelUpKey(step._id))) return
    const filter = { _id: campaignId, levelUps: { $elemMatch: { _id: step._id, status: "deciding" } } }
    if (!opexAtTable) {
        await markFailed(campaignId, step._id, INTERRUPTED_TEXT)
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

async function markFailed(campaignId: Types.ObjectId, stepId: Types.ObjectId, error: string) {
    await MaddoxCampaignModel.updateOne({ _id: campaignId, levelUps: { $elemMatch: { _id: stepId, status: "deciding" } } }, { $set: { "levelUps.$.status": "failed", "levelUps.$.error": error.slice(0, 1_000) } })
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

export async function runOpexLevelUp(campaignId: Types.ObjectId, stepId: Types.ObjectId): Promise<void> {
    const claimed = await MaddoxCampaignModel.updateOne({ _id: campaignId, levelUps: { $elemMatch: { _id: stepId, status: "pending", kind: "opex" } } }, { $set: { "levelUps.$.status": "deciding", "levelUps.$.error": null, "levelUps.$.decidingAt": new Date() } })
    if (!claimed.modifiedCount) return
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
        const step = campaign?.levelUps?.find((item) => String(item._id) === String(stepId))
        if (!campaign || !step) return
        const member = await MaddoxCampaignMemberModel.findOne({ _id: step.memberId, campaignId, kind: "opex", status: "joined" }).lean<MemberDoc>()
        const character = await MaddoxCharacterModel.findById(step.characterId).lean<IMaddoxCharacter>()
        if (!member || !character?.sheetId) throw new Error("o personagem não tem ficha")
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
        if (options.targetLevel !== step.toLevel) throw new Error(`a ficha está no nível ${options.currentLevel}, e o degrau é para o nível ${step.toLevel}`)
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
        throw new Error(`a escolha não passou na validação (${previousError})`)
    } catch (error) {
        log.warn({ campaignId: String(campaignId), stepId: String(stepId), err: errorText(error) }, "[maddox] subida de nível do Personagem Opex falhou: fica para o dono")
        await markFailed(campaignId, stepId, `O Personagem Opex não conseguiu decidir a subida de nível (${errorText(error)}).`).catch(() => undefined)
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
