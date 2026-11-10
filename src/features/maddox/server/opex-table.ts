import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_DECLARATION_VALIDATION_RIGORS,
    MADDOX_NARRATOR_HISTORY_CHARS,
    MADDOX_OPEX_COMBAT_CONSUMPTION_ORIGIN,
    MADDOX_OPEX_FAILED_MESSAGE,
    MADDOX_OPEX_INVALID_RETRIES,
    MADDOX_OPEX_QUESTIONS_MAX,
    MADDOX_OPEX_TURN_CONSUMPTION_ORIGIN,
} from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCampaignMessage, type IMaddoxCharacter } from "../models"
import type { MaddoxGameStateDto } from "../game-types"
import { isHiddenPlayerAction } from "../player-actions-visibility"
import { isMemberReadyToPlay } from "./campaigns"
import { enqueueMaddoxJob } from "./game-live"
import { narratorTranscript, checkResultLine } from "./narrator-prompt"
import { isOpexMember } from "./opex-members"
import { decideOpex, loadOpexModel, opexPromptContext } from "./opex-player"
import {
    buildOpexInstructions,
    opexCombatPlanSchema,
    opexCombatTask,
    opexMemoriesOf,
    opexReactionSchema,
    opexReactionTask,
    opexTableActionSchema,
    opexTableTask,
    type OpexCombatOptionLine,
    type OpexCombatPlan,
} from "./opex-prompt"
import { runOpexOnce } from "./opex-runtime"

/**
 * Personagens Opex na mesa (DND-26) — SOMENTE servidor.
 *
 * - Turno fora do combate tático: quando os humanos terminam (`evaluateTurn`), cada Opex pronto age UM DE CADA VEZ, na
 *   ordem de adição (`turn.opexActor`): até `MADDOX_OPEX_QUESTIONS_MAX` perguntas ao mestre (a resposta é gerada no job
 *   do próprio Opex, na fila da campanha — nunca um job esperando outro) e então declara ou não faz nada, pelas mesmas
 *   regras de um jogador (validação nos graus Rigoroso e Fiel, `recordTurnAction`). Com "Ocultas", o Opex não recebe o
 *   texto das declarações dos outros. Cada declaração grava as memórias dele no canal individual.
 * - Testes e rolagens: rolados automaticamente pelas funções de sempre (`rollCheck`, `rollCombatRoll`, `rollCombatAction`),
 *   que mandam o dado animado para todos.
 * - Combate tático: na vez dele, o Opex escolhe entre as opções que a ficha permite, rola e encerra a vez; nas reações,
 *   escolhe sozinho (falha = não reage, como no prazo vencido).
 * - Falha do agente (provedor, erro, demora) trava a mesa até o dono escolher "Tentar de novo" ou "Pular".
 *
 * `driveOpex` é chamado depois de cada mudança da mesa (`publishGameChanged`) e é idempotente, com single-flight.
 */

const log = loggerFor({ module: "maddox", feature: "opex-table" })

type CampaignDoc = IMaddoxCampaign
type MemberDoc = IMaddoxCampaignMember
type MessageDoc = IMaddoxCampaignMessage

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const opexScheduled = globalThis as typeof globalThis & { __maddoxOpexScheduled?: Set<string> }
const scheduled = () => (opexScheduled.__maddoxOpexScheduled ??= new Set())

// ── Transcrição vista pelo Opex ─────────────────────────────────────────────

/** Transcrição recente do ponto de vista do Opex: as declarações ocultas dos outros ficam de fora (DND-36). */
async function opexTranscript(campaign: CampaignDoc, member: MemberDoc): Promise<string> {
    const { checkResultOf } = await import("./narrator")
    const recent = (await MaddoxCampaignMessageModel.find({ campaignId: campaign._id }).sort({ _id: -1 }).limit(200).lean<MessageDoc[]>()).reverse()
    const viewer = { memberId: String(member._id), hidePlayerActions: Boolean(campaign.hidePlayerActions) }
    return narratorTranscript(
        recent
            // Declaração oculta dos outros (DND-36): some da transcrição; o Opex só descobre o que fizeram pela narração.
            .filter((message) => !message.error && message.kind !== "reminder" && !isHiddenPlayerAction(message, viewer))
            .map((message) => {
                const check = checkResultOf(message)
                if (message.combatAction) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: message.combatAction.status === "cancelled" ? "" : message.combatAction.summary }
                if (message.combatRoll) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: message.combatRoll.status === "cancelled" ? "" : `${message.characterName ?? "Personagem"} — ${message.combatRoll.reason}: ${message.combatRoll.outcome ?? message.combatRoll.status}` }
                if (message.combatReaction) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: `${message.characterName ?? "Personagem"} — reação (${message.combatReaction.description}): ${message.combatReaction.outcome ?? message.combatReaction.status}` }
                if (message.kind === "check") return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: check ? checkResultLine(check) : "" }
                if (message.kind === "combat") return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: "" }
                return { turnNumber: message.turnNumber, kind: message.kind, characterName: message.characterName, content: message.content }
            }),
        MADDOX_NARRATOR_HISTORY_CHARS,
    )
}

// ── Turno fora do combate ───────────────────────────────────────────────────

const turnKey = (campaignId: Types.ObjectId | string, memberId: Types.ObjectId | string, turnNumber: number) => `${String(campaignId)}:${String(memberId)}:${turnNumber}`

/** Põe a vez do Opex na fila da campanha (uma por turno e membro). */
export function scheduleOpexTurn(campaignId: Types.ObjectId, memberId: Types.ObjectId, turnNumber: number): void {
    const key = turnKey(campaignId, memberId, turnNumber)
    if (scheduled().has(key)) return
    scheduled().add(key)
    void enqueueMaddoxJob(
        String(campaignId),
        `vez do Personagem Opex no turno ${turnNumber}`,
        async ({ jobId }) => {
            try {
                await runOpexTurn(campaignId, memberId, turnNumber, jobId)
            } finally {
                scheduled().delete(key)
            }
        },
        { kind: "answer", turnNumber, round: 0 },
    )
}

async function currentActor(campaignId: Types.ObjectId, memberId: Types.ObjectId, turnNumber: number): Promise<CampaignDoc | null> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active" || campaign.turn?.phase !== "players" || campaign.turn.number !== turnNumber) return null
    const actor = campaign.turn.opexActor
    if (!actor || String(actor.memberId) !== String(memberId) || actor.failedAt) return null
    return campaign
}

async function failTurn(campaignId: Types.ObjectId, memberId: Types.ObjectId, turnNumber: number, reason: string): Promise<void> {
    log.warn({ campaignId: String(campaignId), memberId: String(memberId), turnNumber, err: reason }, "[maddox] Personagem Opex não conseguiu agir: a mesa espera o dono")
    await MaddoxCampaignModel.updateOne(
        { _id: campaignId, "turn.number": turnNumber, "turn.opexActor.memberId": memberId },
        { $set: { "turn.opexActor.failedAt": new Date(), "turn.opexActor.error": reason.slice(0, 500) || MADDOX_OPEX_FAILED_MESSAGE } },
    )
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

async function runOpexTurn(campaignId: Types.ObjectId, memberId: Types.ObjectId, turnNumber: number, jobId: string): Promise<void> {
    await dbConnect()
    let campaign = await currentActor(campaignId, memberId, turnNumber)
    if (!campaign) return
    const member = await MaddoxCampaignMemberModel.findOne({ _id: memberId, campaignId, status: "joined" }).lean<MemberDoc>()
    const game = await import("./game")
    if (!member || !isOpexMember(member)) {
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.opexActor.memberId": memberId }, { $set: { "turn.opexActor": null } })
        await game.evaluateTurn(campaignId)
        return
    }
    try {
        const character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<IMaddoxCharacter>() : null
        if (!isMemberReadyToPlay(character)) throw new Error("o personagem ainda não concluiu a entrevista")
        const { settings, model } = await loadOpexModel(campaign.rigor)
        const context = await opexPromptContext(campaign, member, character, settings)
        const instructions = buildOpexInstructions(context, { withMemoryRule: true })
        let invalidReason: string | null = null
        let invalidCount = 0
        for (let step = 0; step < MADDOX_OPEX_QUESTIONS_MAX + MADDOX_OPEX_INVALID_RETRIES + 2; step++) {
            campaign = await currentActor(campaignId, memberId, turnNumber)
            if (!campaign) return
            const questions = campaign.turn.opexActor?.questions ?? 0
            const transcript = await opexTranscript(campaign, member)
            const action = await decideOpex({
                model,
                instructions,
                prompt: opexTableTask({ turnNumber, transcript, questionsLeft: Math.max(0, MADDOX_OPEX_QUESTIONS_MAX - questions), invalidReason }),
                schema: opexTableActionSchema,
                title: `Personagem Opex · turno ${turnNumber} · ${campaign.name}`,
                origin: MADDOX_OPEX_TURN_CONSUMPTION_ORIGIN,
                subject: String(campaignId),
            })
            const text = action.texto.trim().slice(0, 4_000)
            if (action.acao === "perguntar" && text && questions < MADDOX_OPEX_QUESTIONS_MAX) {
                const counted = await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.number": turnNumber, "turn.opexActor.memberId": memberId, "turn.opexActor.questions": questions }, { $inc: { "turn.opexActor.questions": 1 } })
                if (counted.modifiedCount === 0) return
                const question = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "players", kind: "question", memberId, userId: member.userId, characterId: character?._id ?? null, characterName: character?.name ?? null, content: text })
                await game.publishGameChanged(campaignId)
                await game.answerQuestion(campaignId, jobId, turnNumber, question._id, character?.name ?? "Personagem", text)
                continue
            }
            let kind: "declaration" | "pass" = action.acao === "declarar" && text ? "declaration" : "pass"
            if (kind === "declaration" && MADDOX_DECLARATION_VALIDATION_RIGORS.includes(campaign.rigor)) {
                const { validateDeclaration } = await import("./action-validation")
                const verdict = await validateDeclaration({ campaign, character, content: text })
                if (!verdict.valid) {
                    if (invalidCount < MADDOX_OPEX_INVALID_RETRIES) {
                        invalidCount++
                        invalidReason = verdict.reason
                        continue
                    }
                    log.info({ campaignId: String(campaignId), memberId: String(memberId) }, "[maddox] declarações do Personagem Opex recusadas: registrado como \"não fez nada\"")
                    kind = "pass"
                }
            }
            const fresh = await currentActor(campaignId, memberId, turnNumber)
            if (!fresh) return
            await game.recordTurnAction(fresh, member, character, kind, kind === "declaration" ? text : "", null)
            const memories = opexMemoriesOf(action)
            if (memories.length) {
                void import("@/features/engramind/server/opex-characters")
                    .then(({ saveOpexCharacterMemories }) => saveOpexCharacterMemories({ campaignId: String(campaignId), memberId: String(memberId), characterName: character?.name ?? "" }, memories))
                    .catch((error: unknown) => log.warn({ memberId: String(memberId), err: errorText(error) }, "[maddox] memórias do Personagem Opex não gravadas"))
            }
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.number": turnNumber, "turn.opexActor.memberId": memberId }, { $set: { "turn.opexActor": null } })
            await game.publishGameChanged(campaignId)
            await game.evaluateTurn(campaignId)
            return
        }
        throw new Error("o Personagem Opex não chegou a uma decisão")
    } catch (error) {
        const code = (error as { code?: string }).code
        // Já declarou (o dono pulou no meio) ou o turno fechou: nada a fazer, a vez segue.
        if (code === "ALREADY_DECLARED" || code === "TURN_CLOSED") {
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.number": turnNumber, "turn.opexActor.memberId": memberId }, { $set: { "turn.opexActor": null } })
            await game.evaluateTurn(campaignId)
            return
        }
        await failTurn(campaignId, memberId, turnNumber, errorText(error))
    }
}

// ── Combate tático ──────────────────────────────────────────────────────────

const combatKey = (campaignId: string) => `combat:${campaignId}`

async function setTableFailure(campaignId: Types.ObjectId, memberId: Types.ObjectId | string, reason: string | null): Promise<void> {
    await MaddoxCampaignMemberModel.updateOne(
        { _id: memberId, kind: "opex" },
        { $set: { "opex.run": reason ? { status: "failed", stage: "table", error: reason.slice(0, 500), updatedAt: new Date() } : { status: "idle", stage: "table", error: null, updatedAt: new Date() } } },
    )
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

function optionLines(state: MaddoxGameStateDto): OpexCombatOptionLine[] {
    const options = state.me.combat?.options
    if (!options) return []
    return [...options.action, ...options.bonus]
        .filter((option) => option.id !== "standard:ready" && option.economy !== "reaction")
        .map((option) => ({
            id: option.id,
            economy: option.economy === "bonus" ? ("bonus" as const) : ("action" as const),
            label: option.label,
            detail: option.detail,
            target: option.target === "enemy" ? "inimigo" : option.target === "ally" ? "aliado" : option.target === "self" ? "você" : option.target === "any" ? "qualquer um" : "nenhum",
            levels: option.spell?.levels,
            skills: option.skills,
            needsText: option.id === "free" || Boolean(option.uncertain),
            sneakAttack: option.attack?.riders?.[0]?.label ?? null,
            adjusted: option.adjusted?.reason ?? null,
        }))
}

function situationOf(state: MaddoxGameStateDto, actorKey: string | null): { text: string; targets: { key: string; name: string; side: "inimigo" | "aliado" | "você" }[]; round: number } {
    const tactical = state.combat?.tactical
    if (!tactical) return { text: "(sem combate tático ativo)", targets: [], round: 0 }
    const lines = tactical.order.map((slot) => {
        const health = slot.hp ? `PV ${slot.hp.current}/${slot.hp.max}` : slot.band ? `estado: ${slot.band}` : ""
        const conditions = slot.conditions.length ? `; condições: ${slot.conditions.map((item) => item.label).join(", ")}` : ""
        const flags = [slot.defeated ? "derrotado" : null, slot.dead ? "morto" : null, slot.dying ? "morrendo" : null].filter(Boolean).join(", ")
        return `- ${slot.name} (${slot.actorKey === actorKey ? "você" : slot.side}${slot.initiative !== null ? `, iniciativa ${slot.initiative}` : ""}) ${health}${conditions}${flags ? ` [${flags}]` : ""}`
    })
    const targets = tactical.order
        .filter((slot) => !slot.defeated && !slot.dead)
        .map((slot) => ({ key: slot.actorKey, name: slot.name, side: slot.actorKey === actorKey ? ("você" as const) : slot.side === "inimigo" ? ("inimigo" as const) : ("aliado" as const) }))
    return { text: [`${state.combat?.title ?? "Combate"}${state.combat?.location ? ` (${state.combat.location})` : ""}`, ...lines].join("\n"), targets, round: tactical.round }
}

/** Ação de combate ainda pendente do Opex (a que acabou de declarar ou o ataque de oportunidade de uma reação). */
async function pendingActionOf(campaignId: Types.ObjectId, memberId: Types.ObjectId) {
    return MaddoxCampaignMessageModel.findOne({ campaignId, memberId, kind: "combat-action", "combatAction.status": "pending" }).sort({ _id: -1 }).select("_id").lean<{ _id: Types.ObjectId }>()
}

async function resolvePendingAction(campaignId: Types.ObjectId, memberId: Types.ObjectId, userId: string): Promise<void> {
    const { rollCombatAction } = await import("./tactical-actions")
    for (let step = 0; step < 8; step++) {
        const pending = await pendingActionOf(campaignId, memberId)
        if (!pending) return
        await rollCombatAction(String(campaignId), String(pending._id), userId)
    }
}

/** A vez do Opex no combate tático: escolhe, rola e encerra a vez. Falha do agente = a mesa espera o dono. */
async function runOpexCombatTurn(campaign: CampaignDoc, member: MemberDoc, character: IMaddoxCharacter | null): Promise<void> {
    const campaignId = campaign._id
    const userId = member.userId
    const tactical = await import("./tactical-actions")
    const { getGameState } = await import("./game")
    const current = await MaddoxCampaignMemberModel.findOne({ _id: member._id, status: "joined" }).select("opex.run").lean<Pick<MemberDoc, "opex">>()
    if (!current || (current.opex?.run?.stage === "table" && current.opex.run.status === "failed")) return
    try {
        await resolvePendingAction(campaignId, member._id, userId)
        let state = await getGameState(String(campaignId), userId)
        if (!state.me.combat?.myTurn) return
        if (state.me.combat.dying) return
        const { settings, model } = await loadOpexModel(campaign.rigor)
        const instructions = buildOpexInstructions(await opexPromptContext(campaign, member, character, settings))
        let previousError: string | null = null
        let plan: OpexCombatPlan = { acoes: [], movimento: "" }
        for (let attempt = 0; attempt < 2; attempt++) {
            const situation = situationOf(state, state.me.combat?.actorKey ?? null)
            plan = await decideOpex({
                model,
                instructions,
                prompt: opexCombatTask({ round: situation.round, situation: situation.text, options: optionLines(state), targets: situation.targets, economy: { action: Boolean(state.me.combat?.economy?.action), bonus: Boolean(state.me.combat?.economy?.bonus) }, previousError }),
                schema: opexCombatPlanSchema,
                title: `Personagem Opex · combate · ${campaign.name}`,
                origin: MADDOX_OPEX_COMBAT_CONSUMPTION_ORIGIN,
                subject: String(campaignId),
            })
            previousError = null
            for (const choice of plan.acoes) {
                try {
                    await tactical.submitCombatAction(
                        String(campaignId),
                        {
                            economy: choice.economia,
                            optionId: choice.opcao,
                            ...(choice.alvos.length ? { targets: choice.alvos.slice(0, 8) } : {}),
                            ...(choice.circulo ? { spellLevel: choice.circulo } : {}),
                            ...(choice.pericia ? { skill: choice.pericia } : {}),
                            ...(choice.texto?.trim() ? { freeText: choice.texto.trim().slice(0, 1_000) } : {}),
                            ...(choice.ataqueFurtivo ? { sneakAttack: true } : {}),
                        },
                        userId,
                    )
                } catch (error) {
                    const code = (error as { code?: string }).code
                    if (!code) throw error
                    previousError = errorText(error)
                    break
                }
                await resolvePendingAction(campaignId, member._id, userId)
            }
            if (!previousError) break
            state = await getGameState(String(campaignId), userId)
            if (!state.me.combat?.myTurn) return
        }
        const fresh = await getGameState(String(campaignId), userId)
        if (!fresh.me.combat?.myTurn) return
        await tactical.endCombatTurn(String(campaignId), plan.movimento.trim() ? { movimento: plan.movimento.trim().slice(0, 1_000) } : {}, userId)
        if (member.opex?.run?.stage === "table") await setTableFailure(campaignId, member._id, null)
    } catch (error) {
        await setTableFailure(campaignId, member._id, errorText(error) || MADDOX_OPEX_FAILED_MESSAGE)
    }
}

// ── Rolagens automáticas e reações ──────────────────────────────────────────

async function autoRolls(campaign: CampaignDoc, opex: Map<string, MemberDoc>): Promise<void> {
    const memberIds = [...opex.values()].map((member) => member._id)
    const pending = await MaddoxCampaignMessageModel.find({
        campaignId: campaign._id,
        memberId: { $in: memberIds },
        $or: [{ kind: "check", "check.status": "pending" }, { kind: "combat-roll", "combatRoll.status": "pending", "combatRoll.kind": { $ne: "enemy-initiative" } }],
    })
        .sort({ _id: 1 })
        .select("_id kind memberId")
        .lean<{ _id: Types.ObjectId; kind: string; memberId: Types.ObjectId }[]>()
    for (const message of pending) {
        const member = opex.get(String(message.memberId))
        if (!member) continue
        try {
            if (message.kind === "check") {
                const { rollCheck } = await import("./game-checks")
                await rollCheck(String(campaign._id), String(message._id), member.userId)
            } else {
                const { rollCombatRoll } = await import("./tactical-actions")
                await rollCombatRoll(String(campaign._id), String(message._id), member.userId)
            }
        } catch (error) {
            log.info({ campaignId: String(campaign._id), messageId: String(message._id), err: errorText(error) }, "[maddox] rolagem automática do Personagem Opex adiada")
        }
    }
    // Ataque de oportunidade aberto por uma reação (card de ação dentro da espera do turno do mestre).
    for (const member of opex.values()) {
        if (campaign.turn?.phase !== "master") break
        try {
            await resolvePendingAction(campaign._id, member._id, member.userId)
        } catch (error) {
            log.info({ campaignId: String(campaign._id), memberId: String(member._id), err: errorText(error) }, "[maddox] ação pendente do Personagem Opex adiada")
        }
    }
}

async function autoReactions(campaign: CampaignDoc, opex: Map<string, MemberDoc>): Promise<void> {
    const reactions = await MaddoxCampaignMessageModel.find({ campaignId: campaign._id, memberId: { $in: [...opex.values()].map((member) => member._id) }, kind: "combat-reaction", "combatReaction.status": "pending" })
        .select("_id memberId combatReaction")
        .lean<MessageDoc[]>()
    for (const message of reactions) {
        const member = opex.get(String(message.memberId))
        const reaction = message.combatReaction
        if (!member || !reaction) continue
        let choice = "none"
        try {
            const character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<IMaddoxCharacter>() : null
            const { settings, model } = await loadOpexModel(campaign.rigor)
            const instructions = buildOpexInstructions(await opexPromptContext(campaign, member, character, settings))
            const answer = await decideOpex({
                model,
                instructions,
                prompt: opexReactionTask({ trigger: reaction.description, options: reaction.options.map((option) => ({ id: option.id, label: option.label })), situation: campaign.state?.situation ?? "" }),
                schema: opexReactionSchema,
                title: `Personagem Opex · reação · ${campaign.name}`,
                origin: MADDOX_OPEX_COMBAT_CONSUMPTION_ORIGIN,
                subject: String(campaign._id),
            })
            choice = reaction.options.some((option) => option.id === answer.escolha) ? answer.escolha : "none"
        } catch (error) {
            log.info({ campaignId: String(campaign._id), messageId: String(message._id), err: errorText(error) }, "[maddox] Personagem Opex não decidiu a reação: não reage")
        }
        try {
            const { decideReaction } = await import("./combat-reactions")
            await decideReaction(String(campaign._id), String(message._id), choice, member.userId)
            if (choice !== "none") await resolvePendingAction(campaign._id, member._id, member.userId)
        } catch (error) {
            log.info({ campaignId: String(campaign._id), messageId: String(message._id), err: errorText(error) }, "[maddox] reação do Personagem Opex não registrada")
        }
    }
}

// ── Motor ───────────────────────────────────────────────────────────────────

/**
 * Faz o que estiver pendente para os Personagens Opex da campanha: rolagens, reações, a vez no combate tático e a vez
 * fora dele (posta na fila). Idempotente e com single-flight por campanha; nunca rejeita.
 */
export function driveOpex(campaignId: Types.ObjectId | string): Promise<void> {
    const id = String(campaignId)
    return runOpexOnce(`table:${id}`, () => driveOnce(id))
}

async function driveOnce(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return
    await dbConnect()
    const campaignId = new Types.ObjectId(id)
    const members = await MaddoxCampaignMemberModel.find({ campaignId, kind: "opex", status: "joined" }).lean<MemberDoc[]>()
    if (!members.length) return
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active") return
    const opex = new Map(members.map((member) => [String(member._id), member]))
    await autoRolls(campaign, opex)
    await autoReactions(campaign, opex)
    const fresh = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!fresh || fresh.status !== "active" || fresh.turn?.phase !== "players") return
    const combatActor = fresh.turn.combatActor
    if (combatActor) {
        if (!opex.has(String(combatActor.memberId))) return
        // A tarefa relê o ator a cada passada: uma nova passada pedida durante a vez de um Opex age pelo ator da vez
        // (o próximo Opex da iniciativa), não pelo que já encerrou.
        void runOpexOnce(combatKey(id), () => runCurrentCombatActor(campaignId))
        return
    }
    const actor = fresh.turn.opexActor
    if (actor && !actor.failedAt) scheduleOpexTurn(campaignId, actor.memberId, fresh.turn.number)
}

/** Vez do Opex que está agindo agora no combate tático (campanha, membro e personagem lidos na hora). */
async function runCurrentCombatActor(campaignId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active" || campaign.turn?.phase !== "players") return
    const actor = campaign.turn.combatActor
    if (!actor) return
    const member = await MaddoxCampaignMemberModel.findOne({ _id: actor.memberId, campaignId, kind: "opex", status: "joined" }).lean<MemberDoc>()
    if (!member) return
    if (member.opex?.run?.stage === "table" && member.opex.run.status === "failed") return
    const character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<IMaddoxCharacter>() : null
    await runOpexCombatTurn(campaign, member, character)
}

// ── Ações do dono ───────────────────────────────────────────────────────────

/** "Tentar de novo": limpa a falha do Opex da vez e o põe para agir de novo. */
export async function retryOpexAction(campaign: CampaignDoc, memberId: Types.ObjectId): Promise<void> {
    if (campaign.turn?.combatActor && String(campaign.turn.combatActor.memberId) === String(memberId)) {
        await setTableFailure(campaign._id, memberId, null)
        return
    }
    await MaddoxCampaignModel.updateOne({ _id: campaign._id, "turn.opexActor.memberId": memberId }, { $set: { "turn.opexActor.failedAt": null, "turn.opexActor.error": null } })
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaign._id)
}

/** "Pular": registra "não fez nada" (ou encerra a vez no combate) no lugar do Opex que falhou. */
export async function skipOpexAction(campaign: CampaignDoc, member: MemberDoc, skippedBy: string): Promise<void> {
    const game = await import("./game")
    if (campaign.turn?.combatActor && String(campaign.turn.combatActor.memberId) === String(member._id)) {
        await MaddoxCampaignMemberModel.updateOne({ _id: member._id }, { $set: { "opex.run": { status: "idle", stage: "table", error: null, updatedAt: new Date() } } })
        const { skipCombatTurn } = await import("./tactical-actions")
        await skipCombatTurn(campaign, member, skippedBy, false)
        return
    }
    const character = await game.characterOf(member)
    try {
        await game.recordTurnAction(campaign, member, character, "pass", "", skippedBy)
    } catch (error) {
        if ((error as { code?: string }).code !== "ALREADY_DECLARED") throw error
    }
    await MaddoxCampaignModel.updateOne({ _id: campaign._id, "turn.opexActor.memberId": member._id }, { $set: { "turn.opexActor": null } })
    await game.publishGameChanged(campaign._id)
    await game.evaluateTurn(campaign._id)
}
