import { randomUUID } from "node:crypto"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { getLevelOneHpMax } from "@/features/character-sheets/utils/sheet-rules"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INTERVIEW_MESSAGES_MAX, type MaddoxScriptKind } from "../constants"
import { MaddoxInterviewModel, type IMaddoxInterview, type IMaddoxInterviewMessage } from "../models"
import type { MaddoxHitPointRollResultDto } from "../interview-types"
import type { MaddoxHitPointsSubmitInput } from "../interview-schemas"
import { hitPointRows, hitPointsTotal } from "../character-build-rules"
import { constitutionModifier } from "./character-build"
import { latestHitPointsCard } from "./interview-cards"
import { notifyInterviewChanged } from "./campaign-realtime"
import { acquireInterviewLock, existingInterview, interviewDto, loadSubject, prepareTurn, releaseInterviewLock, usesAbilityCard, type InterviewSubject, type PreparedTurn } from "./interviews"

/**
 * Card de pontos de vida da entrevista (Maddox 5), como o assistente de subir de nível da ficha — SOMENTE servidor. O
 * dado de vida de cada nível é rolado AQUI, com o motor de dados do site (regras de dado do jogador), e fica gravado;
 * o envio só aceita "rolagem" num nível já rolado. O envio grava o card e uma fala interna e transmite a fala seguinte.
 */

const log = loggerFor({ module: "maddox", feature: "interview-hit-points" })

type InterviewDoc = IMaddoxInterview

const NO_CARD = "O Maddox ainda não abriu o card de pontos de vida."

async function loadCardInterview(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<{ subject: InterviewSubject; doc: InterviewDoc }> {
    await dbConnect()
    if (kind !== "character") throw new DomainError(404, "Entrevista não encontrada", "NOT_FOUND")
    const subject = await loadSubject(campaignId, kind, userId, "write")
    if (!usesAbilityCard(subject, kind)) throw new DomainError(409, "Este grau de rigor não usa ficha: o personagem é só narrativo.", "SHEET_DISABLED")
    const doc = await existingInterview(subject, kind)
    return { subject, doc }
}

const pendingCardOf = (doc: InterviewDoc) => {
    const latest = latestHitPointsCard(doc.messages)
    return latest?.card.status === "pending" ? latest : null
}

/** Rola o dado de vida de um nível (uma vez por nível) e grava na entrevista. */
export async function rollHitPoint(campaignId: string, kind: MaddoxScriptKind, level: number, userId: string): Promise<MaddoxHitPointRollResultDto> {
    const { subject, doc } = await loadCardInterview(campaignId, kind, userId)
    const pending = pendingCardOf(doc)
    if (!pending) throw new DomainError(409, NO_CARD, "NO_PENDING_HIT_POINTS")
    if (level < 2 || level > pending.card.level) throw new DomainError(400, `Escolha um nível entre 2 e ${pending.card.level}.`, "INVALID_LEVEL")
    const current = doc.hitPointRolls ?? []
    if (current.some((roll) => roll.level === level)) throw new DomainError(409, `O dado de vida do nível ${level} já foi rolado.`, "HIT_POINT_ROLLED")
    const [{ rollGeneralDice }, { resolveGeneralDiceTarget }] = await Promise.all([import("@/features/dice-roller/server/dice-roll-service"), import("@/features/dice-roller/server/dice-target")])
    const dice = pending.card.hitDie as "d6"
    // Como o "Rolar vida" da ficha: 1 dado de vida + CON (só o dado fica gravado; o CON final entra no total).
    const roll = await rollGeneralDice({ terms: [{ dice, quantity: 1 }], modifier: constitutionModifier(doc), mode: "normal", label: `PV do nível ${level}`, source: "sheet" }, resolveGeneralDiceTarget({ userId: subject.member.userId })!)
    const die = roll.terms.find((term) => term.dice === dice)?.results?.[0]
    if (typeof die !== "number") throw new DomainError(502, "A rolagem não voltou com o dado de vida. Tente de novo.", "ROLL_FAILED")
    // Troca condicional pelo tamanho atual: dois cliques ao mesmo tempo gravam uma rolagem só.
    const saved = await MaddoxInterviewModel.updateOne(
        { _id: doc._id, status: { $ne: "done" }, ...(current.length ? { hitPointRolls: { $size: current.length } } : { $or: [{ hitPointRolls: null }, { hitPointRolls: { $exists: false } }, { hitPointRolls: { $size: 0 } }] }) },
        { $set: { hitPointRolls: [...current, { level, die, rollId: roll.rollId }] } },
    )
    if (saved.modifiedCount === 0) throw new DomainError(409, "Outra rolagem foi gravada ao mesmo tempo. Confira os pontos de vida.", "ROLL_CONFLICT")
    const fresh = await MaddoxInterviewModel.findById(doc._id).lean<InterviewDoc>()
    await notifyInterviewChanged(campaignId, kind, userId)
    return { roll, interview: interviewDto(fresh!) }
}

function validateChoices(doc: InterviewDoc, input: MaddoxHitPointsSubmitInput, level: number): string | null {
    const rolled = new Set((doc.hitPointRolls ?? []).map((roll) => roll.level))
    for (let current = 2; current <= level; current++) {
        const choice = input.escolhas[String(current)]
        if (!choice) return `Escolha média ou rolagem no nível ${current}.`
        if (choice === "rolagem" && !rolled.has(current)) return `Role o dado de vida do nível ${current} antes de enviar.`
    }
    const extra = Object.keys(input.escolhas).find((key) => Number(key) < 2 || Number(key) > level)
    return extra ? `O card vai do nível 2 ao ${level}.` : null
}

/**
 * Envia o card: valida as escolhas, pega a trava e prepara o turno do Maddox ANTES de gravar (falha de preparação deixa
 * o card e a conversa intactos); grava o card como `submitted` e a fala interna com os valores.
 */
export async function submitHitPoints(campaignId: string, kind: MaddoxScriptKind, input: MaddoxHitPointsSubmitInput, userId: string): Promise<PreparedTurn> {
    const { subject, doc } = await loadCardInterview(campaignId, kind, userId)
    const pending = pendingCardOf(doc)
    if (!pending) throw new DomainError(409, NO_CARD, "NO_PENDING_HIT_POINTS")
    const invalid = validateChoices(doc, input, pending.card.level)
    if (invalid) throw new DomainError(400, invalid, "INVALID_HIT_POINTS")
    if (doc.messages.length >= MADDOX_INTERVIEW_MESSAGES_MAX) throw new DomainError(409, "A entrevista chegou ao limite de mensagens. Peça ao Maddox a síntese e conclua.", "INTERVIEW_TOO_LONG")
    const { doc: locked, token } = await acquireInterviewLock(doc._id)
    const lockedPending = pendingCardOf(locked)
    const recheck = lockedPending ? validateChoices(locked, input, lockedPending.card.level) : NO_CARD
    if (!lockedPending || recheck) {
        await releaseInterviewLock(locked._id, token)
        throw new DomainError(409, recheck ?? NO_CARD, "NO_PENDING_HIT_POINTS")
    }
    const card = lockedPending.card
    const choices = Object.fromEntries(Object.entries(input.escolhas).map(([key, value]) => [key, value === "rolagem" ? "roll" : "average"])) as Record<string, "average" | "roll">
    const con = constitutionModifier(locked)
    const rolls = locked.hitPointRolls ?? []
    const total = hitPointsTotal(card.level, card.hitDie, con, choices, rolls)
    const rows = hitPointRows(card.level, card.hitDie, con, rolls)
    const detail = rows.map((row) => (choices[String(row.level)] === "roll" ? `nível ${row.level}: rolagem ${card.hitDie} ${row.die} (+${row.rolled})` : `nível ${row.level}: média (+${row.average})`)).join("; ")
    const submittedAt = new Date()
    const internal: IMaddoxInterviewMessage = {
        id: randomUUID(),
        role: "user",
        content: `[Sistema] O jogador definiu os pontos de vida pelo card: nível 1 ${getLevelOneHpMax(card.hitDie, con)}; ${detail}. PV máximo ${total}. Comente em poucas linhas e siga a entrevista.`,
        proposal: false,
        error: null,
        internal: true,
        createdAt: submittedAt,
    }
    const messages = [
        ...locked.messages
            .filter((message) => !message.error)
            .map((message) => ({ ...message, proposal: false, ...(message.id === lockedPending.message.id ? { hitPoints: { ...card, status: "submitted" as const, choices, submittedAt } } : {}) })),
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
        depois: { interview: `pontos de vida enviados: ${subject.character?.name ?? ""}`, level: card.level, total },
    })
    log.info({ campaignId, level: card.level, total }, "[maddox] pontos de vida enviados pelo card")
    return turn
}
