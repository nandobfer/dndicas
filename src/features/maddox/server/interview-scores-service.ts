import { randomUUID } from "node:crypto"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { calculateDropLowestScore } from "@/features/character-sheets/utils/ability-score-rules"
import { MADDOX_ABILITY_ROLLS, MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INTERVIEW_MESSAGES_MAX, type MaddoxScriptKind } from "../constants"
import { MaddoxInterviewModel, type IMaddoxAbilityRolls, type IMaddoxInterview, type IMaddoxInterviewMessage } from "../models"
import type { MaddoxAbilityRollResultDto, MaddoxInterviewDto } from "../interview-types"
import type { MaddoxAbilityScoresSubmitInput } from "../interview-schemas"
import { abilityMethodLabel, scoresLine, sixthScore, validateSubmission, type AbilityScores } from "../interview-scores"
import { notifyInterviewChanged } from "./campaign-realtime"
import { latestAbilityCard } from "./interview-tools"
import { acquireInterviewLock, existingInterview, interviewDto, loadSubject, prepareTurn, releaseInterviewLock, usesAbilityCard, type InterviewSubject, type PreparedTurn } from "./interviews"

/**
 * Card de atributos da entrevista (Maddox 5) — SOMENTE servidor. A rolagem acontece AQUI, com o motor de dados do site
 * (`rollGeneralDice`, regras de dado do jogador): cada 4d6 fica gravado na entrevista e o envio só aceita exatamente
 * as pontuações roladas. O envio grava o card como `submitted` e uma fala interna para o Maddox, e transmite a fala
 * seguinte dele.
 */

const log = loggerFor({ module: "maddox", feature: "interview-scores" })

type InterviewDoc = IMaddoxInterview

async function loadCardInterview(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<{ subject: InterviewSubject; doc: InterviewDoc }> {
    await dbConnect()
    if (kind !== "character") throw new DomainError(404, "Entrevista não encontrada", "NOT_FOUND")
    const subject = await loadSubject(campaignId, kind, userId, "write")
    if (!usesAbilityCard(subject, kind)) throw new DomainError(409, "Este grau de rigor não usa atributos: o personagem é só narrativo.", "ABILITIES_DISABLED")
    const doc = await existingInterview(subject, kind)
    return { subject, doc }
}

const pendingCardOf = (doc: InterviewDoc) => {
    const latest = latestAbilityCard(doc.messages)
    return latest?.card.status === "pending" ? latest : null
}

const NO_CARD = "O Maddox ainda não abriu o card de atributos."

/** Rola um 4d6 (descartando o menor) com o motor de dados e grava na entrevista; na quinta, calcula a sexta. */
export async function rollAbilityScore(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<MaddoxAbilityRollResultDto> {
    const { subject, doc } = await loadCardInterview(campaignId, kind, userId)
    if (!pendingCardOf(doc)) throw new DomainError(409, NO_CARD, "NO_PENDING_SCORES")
    const current = doc.abilityRolls?.rolls ?? []
    if (doc.abilityRolls?.invalid) throw new DomainError(409, "A sexta pontuação ficou fora do intervalo 3-18. Reinicie as rolagens.", "ROLLS_INVALID")
    if (current.length >= MADDOX_ABILITY_ROLLS) throw new DomainError(409, `As ${MADDOX_ABILITY_ROLLS} rolagens já foram feitas.`, "ROLLS_DONE")
    const [{ rollGeneralDice }, { resolveGeneralDiceTarget }] = await Promise.all([import("@/features/dice-roller/server/dice-roll-service"), import("@/features/dice-roller/server/dice-target")])
    const roll = await rollGeneralDice(
        { terms: [{ dice: "d6", quantity: 4 }], modifier: 0, mode: "normal", label: `Atributo ${current.length + 1} de ${MADDOX_ABILITY_ROLLS}`, source: "sheet" },
        resolveGeneralDiceTarget({ userId: subject.member.userId })!,
    )
    const dice = roll.terms.find((term) => term.dice === "d6")?.results ?? []
    const score = calculateDropLowestScore(dice)
    if (score === null) throw new DomainError(502, "A rolagem não voltou com quatro dados. Tente de novo.", "ROLL_FAILED")
    const scores = [...current.map((item) => item.score), score]
    const { sixth, invalid } = sixthScore(scores)
    const next: IMaddoxAbilityRolls = { rolls: [...current, { dice, score, rollId: roll.rollId }], sixth, invalid }
    // Troca condicional pelo tamanho atual: dois cliques ao mesmo tempo gravam uma rolagem só.
    const saved = await MaddoxInterviewModel.updateOne(
        { _id: doc._id, status: { $ne: "done" }, ...(current.length ? { "abilityRolls.rolls": { $size: current.length } } : { $or: [{ abilityRolls: null }, { abilityRolls: { $exists: false } }] }) },
        { $set: { abilityRolls: next } },
    )
    if (saved.modifiedCount === 0) throw new DomainError(409, "Outra rolagem foi gravada ao mesmo tempo. Confira as pontuações.", "ROLL_CONFLICT")
    const fresh = await MaddoxInterviewModel.findById(doc._id).lean<InterviewDoc>()
    await notifyInterviewChanged(campaignId, kind, userId)
    return { roll, interview: interviewDto(fresh!) }
}

/** "Reiniciar": só quando a sexta pontuação ficou fora de 3–18. */
export async function resetAbilityRolls(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<MaddoxInterviewDto> {
    const { doc } = await loadCardInterview(campaignId, kind, userId)
    if (!pendingCardOf(doc)) throw new DomainError(409, NO_CARD, "NO_PENDING_SCORES")
    const saved = await MaddoxInterviewModel.updateOne({ _id: doc._id, "abilityRolls.invalid": true }, { $set: { abilityRolls: null } })
    if (saved.modifiedCount === 0) throw new DomainError(409, "As rolagens só podem ser reiniciadas quando a sexta pontuação fica fora do intervalo 3-18.", "ROLLS_NOT_RESETTABLE")
    const fresh = await MaddoxInterviewModel.findById(doc._id).lean<InterviewDoc>()
    await notifyInterviewChanged(campaignId, kind, userId)
    return interviewDto(fresh!)
}

const rollsOf = (doc: InterviewDoc) => (doc.abilityRolls ? { scores: doc.abilityRolls.rolls.map((roll) => roll.score), sixth: doc.abilityRolls.sixth, invalid: doc.abilityRolls.invalid } : null)

/**
 * Envia o card: valida o método, pega a trava e prepara o turno do Maddox ANTES de gravar (falha de preparação deixa
 * o card e a conversa intactos); grava o card como `submitted` e a fala interna com os valores.
 */
export async function submitAbilityScores(campaignId: string, kind: MaddoxScriptKind, input: MaddoxAbilityScoresSubmitInput, userId: string): Promise<PreparedTurn> {
    const { subject, doc } = await loadCardInterview(campaignId, kind, userId)
    if (!pendingCardOf(doc)) throw new DomainError(409, NO_CARD, "NO_PENDING_SCORES")
    const invalid = validateSubmission(input.method, input.scores, rollsOf(doc))
    if (invalid) throw new DomainError(400, invalid, "INVALID_SCORES")
    if (doc.messages.length >= MADDOX_INTERVIEW_MESSAGES_MAX) throw new DomainError(409, "A entrevista chegou ao limite de mensagens. Peça ao Maddox a síntese e conclua.", "INTERVIEW_TOO_LONG")
    const { doc: locked, token } = await acquireInterviewLock(doc._id)
    const pending = pendingCardOf(locked)
    // Revalida com a trava: outra aba pode ter enviado entre a leitura e a trava.
    const recheck = pending ? validateSubmission(input.method, input.scores, rollsOf(locked)) : NO_CARD
    if (!pending || recheck) {
        await releaseInterviewLock(locked._id, token)
        throw new DomainError(409, recheck ?? NO_CARD, "NO_PENDING_SCORES")
    }
    const base = input.scores as AbilityScores
    const submittedAt = new Date()
    const internal: IMaddoxInterviewMessage = {
        id: randomUUID(),
        role: "user",
        content: `[Sistema] O jogador enviou os atributos pelo card (${abilityMethodLabel(input.method)}): ${scoresLine(base, pending.card.bonus?.parts)}. Comente em poucas linhas e siga a entrevista.`,
        proposal: false,
        error: null,
        internal: true,
        createdAt: submittedAt,
    }
    // Proposta anterior deixa de valer: os atributos mudaram.
    const messages = [
        ...locked.messages
            .filter((message) => !message.error)
            .map((message) => ({
                ...message,
                proposal: false,
                ...(message.id === pending.message.id ? { abilityScores: { ...pending.card, status: "submitted" as const, method: input.method, base, submittedAt } } : {}),
            })),
        internal,
    ]
    const turn = await prepareTurn(subject, kind, userId, { ...locked, messages, status: "in-progress" }, token, null)
    try {
        await MaddoxInterviewModel.updateOne({ _id: locked._id, "generating.token": token }, { $set: { messages, status: "in-progress" } })
    } catch (error) {
        await releaseInterviewLock(locked._id, token).catch(() => undefined)
        throw error
    }
    await recordAudit({
        userId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(subject.campaign._id),
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { interview: `atributos enviados: ${subject.character?.name ?? ""}`, method: input.method, base },
    })
    log.info({ campaignId, method: input.method }, "[maddox] atributos enviados pelo card")
    return turn
}
