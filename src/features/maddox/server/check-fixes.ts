import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_CHECK_FIX_TOOL_NAMES, type MaddoxCheckMode } from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMessage, type IMaddoxCharacter } from "../models"
import { questionRun, type QuestionRun } from "./question-runs"

/**
 * Correção de um teste de perícia/atributo pelo "Conversar com o Mestre" (DND-74; corrige a DND-72) — SOMENTE servidor.
 * Só dentro do job da resposta (`questionRun`) e só para o teste AINDA PENDENTE da rodada que espera as rolagens: alterar
 * quem rola, CD, vantagem/desvantagem e motivo, ou cancelar (o card perde o Rolar e, sem outro teste pendente, a
 * continuação do Maddox entra na fila). Teste rolado nunca é reescrito. Quem pediu corrige só o teste do próprio
 * personagem; o dono da campanha, qualquer um (trocar quem rola é só do dono). Cada correção grava a linha compacta
 * `master-fix`, a auditoria e avisa a mesa.
 */

const log = loggerFor({ module: "maddox", feature: "check-fixes" })

export class CheckFixError extends Error {}

const NOT_IN_TALK = 'Esta ferramenta só funciona na resposta do "Conversar com o Mestre".'

type CampaignDoc = Pick<IMaddoxCampaign, "_id" | "status" | "turn">
type CheckMessage = IMaddoxCampaignMessage & { check: NonNullable<IMaddoxCampaignMessage["check"]> }

/** Id curto do teste (fim do `_id`), o mesmo que a tarefa da conversa mostra. */
export const checkRef = (id: Types.ObjectId | string) => String(id).slice(-6)

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

const MODE_TEXT: Record<MaddoxCheckMode, string> = { normal: "normal", advantage: "vantagem", disadvantage: "desvantagem" }

/** Nome curto do teste para a linha ("Furtividade", "Força", "Resistência de Destreza"). */
export function checkShortName(check: Pick<CheckMessage["check"], "kind" | "skill" | "ability">): string {
    if (check.kind === "skill" && check.skill) return check.skill
    if (check.kind === "save") return `Resistência de ${MADDOX_ABILITY_LABELS[check.ability]}`
    return MADDOX_ABILITY_LABELS[check.ability]
}

/** O teste ainda espera a rolagem: pendente e da rodada que o turno do mestre aguarda agora. */
const isLive = (campaign: CampaignDoc, message: CheckMessage) =>
    message.check.status === "pending" && campaign.status === "active" && campaign.turn?.phase === "master" && Boolean(campaign.turn.awaitingChecks) && campaign.turn.number === message.turnNumber && (campaign.turn.checkRound ?? 0) === message.check.round

interface TalkCheckLine {
    ref: string
    characterName: string
    title: string
    dc: number
    mode: MaddoxCheckMode
    reason: string
    status: "pending" | "rolled" | "cancelled"
    total: number | null
}

/** Testes do turno atual da campanha, para a tarefa da conversa (pendentes podem ser corrigidos; rolados, não). */
export async function talkChecks(campaignId: Types.ObjectId): Promise<TalkCheckLine[]> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("status turn").lean<CampaignDoc>()
    if (!campaign?.turn) return []
    const messages = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: campaign.turn.number, kind: "check" }).sort({ _id: -1 }).limit(12).lean<CheckMessage[]>()
    return messages
        .filter((message) => message.check && (message.check.status !== "pending" || isLive(campaign, message)))
        .reverse()
        .map((message) => ({
            ref: checkRef(message._id),
            characterName: message.characterName ?? "Personagem",
            title: checkShortName(message.check),
            dc: message.check.dc,
            mode: message.check.mode,
            reason: message.check.reason,
            status: message.check.status,
            total: message.check.roll?.total ?? null,
        }))
}

interface Located {
    run: QuestionRun
    campaign: CampaignDoc
    message: CheckMessage
}

/** O teste pelo id curto (ou pelo personagem, quando ele tem um só pendente), se quem pediu pode corrigi-lo. */
async function locate(jobId: string | undefined, input: { teste?: string; personagem?: string }): Promise<Located> {
    const run = questionRun(jobId)
    if (!run) throw new CheckFixError(NOT_IN_TALK)
    const campaignId = new Types.ObjectId(run.campaignId)
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("status turn").lean<CampaignDoc>()
    if (!campaign?.turn) throw new CheckFixError("A campanha não está em andamento.")
    const messages = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: campaign.turn.number, kind: "check" }).sort({ _id: 1 }).lean<CheckMessage[]>()
    const checks = messages.filter((message) => message.check)
    const pending = checks.filter((message) => isLive(campaign, message))
    const listing = pending.length ? `Testes pendentes: ${pending.map((item) => `${checkRef(item._id)} (${checkShortName(item.check)} de ${item.characterName ?? "Personagem"}, CD ${item.check.dc})`).join("; ")}.` : "Não há teste pendente agora."
    const wanted = input.teste?.trim().toLowerCase()
    let message: CheckMessage | undefined
    if (wanted) message = checks.find((item) => checkRef(item._id) === wanted || String(item._id) === wanted)
    else if (input.personagem) {
        const mine = pending.filter((item) => fold(item.characterName ?? "") === fold(input.personagem!))
        if (mine.length > 1) throw new CheckFixError(`${input.personagem} tem mais de um teste pendente: informe \`teste\` (o id). ${listing}`)
        message = mine[0]
    }
    if (!message) throw new CheckFixError(`Teste não encontrado. ${listing}`)
    if (message.check.status === "rolled") throw new CheckFixError(`O teste de ${checkShortName(message.check)} de ${message.characterName} já foi rolado (total ${message.check.roll?.total ?? "?"}): o resultado fica. Se precisar, explique ao jogador ou peça um teste novo na próxima narração.`)
    if (message.check.status === "cancelled") throw new CheckFixError(`O teste de ${checkShortName(message.check)} de ${message.characterName} já está cancelado.`)
    if (!isLive(campaign, message)) throw new CheckFixError(`Este teste não está mais aguardando a rolagem. ${listing}`)
    if (!run.askerIsOwner && String(message.characterId) !== run.askerCharacterId) throw new CheckFixError(`Quem pediu só corrige o teste do próprio personagem; o teste é de ${message.characterName}.`)
    return { run, campaign, message }
}

/** Grava a linha compacta, a auditoria, o log e avisa a mesa. */
async function commit(located: Located, tool: string, kind: "check-update" | "check-cancel", line: string, details: Record<string, unknown>): Promise<void> {
    const { run, campaign, message } = located
    await MaddoxCampaignMessageModel.create({
        campaignId: campaign._id,
        turnNumber: campaign.turn?.number ?? run.turnNumber,
        phase: campaign.turn?.phase ?? "master",
        kind: "master-fix",
        characterName: message.characterName,
        content: line,
        masterFix: { kind, checkId: message._id },
    })
    if (run.askerUserId) {
        await recordAudit({ userId: run.askerUserId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: run.campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { checkFix: tool, check: String(message._id), talkId: run.questionId, ...details } }).catch((error: unknown) =>
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: run.campaignId }, "[maddox] auditoria da correção do teste falhou"),
        )
    }
    log.info({ campaignId: run.campaignId, jobId: run.jobId, tool, check: String(message._id), line, ...details }, "[maddox] teste corrigido pelo mestre")
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaign._id)
}

export interface UpdateCheckInput {
    teste?: string
    personagem?: string
    novoPersonagem?: string
    cd?: number
    modo?: "normal" | "vantagem" | "desvantagem"
    motivo?: string
}

const modeOf = (value: NonNullable<UpdateCheckInput["modo"]>): MaddoxCheckMode => (value === "vantagem" ? "advantage" : value === "desvantagem" ? "disadvantage" : "normal")

/** Altera um teste pendente (quem rola, CD, modo, motivo). A linha mostra antes → depois. */
export async function updatePendingCheck(jobId: string | undefined, input: UpdateCheckInput): Promise<Record<string, unknown>> {
    if (input.novoPersonagem === undefined && input.cd === undefined && input.modo === undefined && input.motivo === undefined) throw new CheckFixError("Informe o que muda: `novoPersonagem`, `cd`, `modo` ou `motivo`.")
    const located = await locate(jobId, input)
    const { run, campaign, message } = located
    const check = message.check
    const set: Record<string, unknown> = {}
    const changes: string[] = []
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    if (input.novoPersonagem !== undefined && fold(input.novoPersonagem) !== fold(message.characterName ?? "")) {
        if (!run.askerIsOwner) throw new CheckFixError("Só o dono da campanha troca quem rola um teste.")
        const characters = await MaddoxCharacterModel.find({ campaignId: campaign._id, status: "active" }).select("name memberId sheetId interview").lean<Pick<IMaddoxCharacter, "_id" | "name" | "memberId" | "sheetId" | "interview">[]>()
        const target = characters.find((item) => fold(item.name) === fold(input.novoPersonagem!))
        if (!target) throw new CheckFixError(`Nenhum personagem jogador chamado "${input.novoPersonagem}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
        const member = await MaddoxCampaignMemberModel.findOne({ _id: target.memberId, campaignId: campaign._id, status: "joined" }).select("_id userId").lean<{ _id: Types.ObjectId; userId: string }>()
        if (!member || target.interview?.status !== "done") throw new CheckFixError(`${target.name} não está jogando agora: o teste não pode passar para ele.`)
        if (!target.sheetId) throw new CheckFixError(`${target.name} não tem ficha D&D: o teste não pode passar para ele.`)
        const taken = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber: message.turnNumber, kind: "check", "check.round": check.round, "check.status": "pending", memberId: member._id, _id: { $ne: message._id } })
        if (taken) throw new CheckFixError(`${target.name} já tem um teste pendente nesta rodada: um teste por personagem.`)
        const { previewCheckEffects } = await import("./check-effects")
        Object.assign(set, {
            memberId: member._id,
            userId: member.userId,
            characterId: target._id,
            characterName: target.name,
            "check.sheetId": target.sheetId,
            "check.effects": await previewCheckEffects(String(target.sheetId), { kind: check.kind, skill: check.skill ?? null }),
        })
        changes.push(`quem rola: ${message.characterName} → ${target.name}`)
        before.character = message.characterName
        after.character = target.name
    }
    if (input.cd !== undefined && input.cd !== check.dc) {
        set["check.dc"] = input.cd
        changes.push(`CD ${check.dc} → ${input.cd}`)
        before.dc = check.dc
        after.dc = input.cd
    }
    if (input.modo !== undefined && modeOf(input.modo) !== check.mode) {
        const mode = modeOf(input.modo)
        set["check.mode"] = mode
        changes.push(`${MODE_TEXT[check.mode]} → ${MODE_TEXT[mode]}`)
        before.mode = check.mode
        after.mode = mode
    }
    const reason = input.motivo?.replace(/\s+/g, " ").trim()
    if (reason && reason !== check.reason) {
        set["check.reason"] = reason
        changes.push(`motivo: “${reason}”`)
        before.reason = check.reason
        after.reason = reason
    }
    if (!changes.length) throw new CheckFixError("Nada muda: o teste já está assim.")
    const updated = await MaddoxCampaignMessageModel.updateOne({ _id: message._id, kind: "check", "check.status": "pending" }, { $set: set })
    if (updated.modifiedCount === 0) throw new CheckFixError("O teste mudou (foi rolado ou cancelado) enquanto você corrigia.")
    const line = `Teste de ${checkShortName(check)} de ${message.characterName ?? "Personagem"} atualizado: ${changes.join("; ")}`
    await commit(located, MADDOX_CHECK_FIX_TOOL_NAMES.update, "check-update", line, { antes: before, depois: after })
    return { aplicado: true, resultado: line, nota: "O card na mesa já mostra o teste corrigido; a rolagem sai assim." }
}

export interface CancelCheckInput {
    teste?: string
    personagem?: string
    motivo: string
}

/** Cancela um teste pendente: o card perde o Rolar e, sem outro teste pendente, a narração do Maddox continua. */
export async function cancelPendingCheck(jobId: string | undefined, input: CancelCheckInput): Promise<Record<string, unknown>> {
    const located = await locate(jobId, input)
    const { campaign, message } = located
    const reason = input.motivo.replace(/\s+/g, " ").trim()
    const updated = await MaddoxCampaignMessageModel.updateOne({ _id: message._id, kind: "check", "check.status": "pending" }, { $set: { "check.status": "cancelled", "check.cancelReason": reason } })
    if (updated.modifiedCount === 0) throw new CheckFixError("O teste mudou (foi rolado ou cancelado) enquanto você corrigia.")
    const line = `Teste de ${checkShortName(message.check)} de ${message.characterName ?? "Personagem"} cancelado`
    await commit(located, MADDOX_CHECK_FIX_TOOL_NAMES.cancel, "check-cancel", line, { reason })
    // Sem outro teste pendente na rodada, a continuação entra na fila (sem esperar: este job roda na mesma fila).
    const { advanceAfterChecks } = await import("./game-checks")
    const advanced = await advanceAfterChecks(campaign._id, message.turnNumber, message.check.round)
    return { aplicado: true, resultado: line, nota: advanced ? "O teste saiu da mesa; a narração continua depois desta resposta, sem ele." : "O teste saiu da mesa; a narração continua quando os outros testes forem rolados." }
}
