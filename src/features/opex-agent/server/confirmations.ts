import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { loggerFor } from "@/lib/logger"
import { OPEX_AUDIT_ENTITY } from "../constants"
import type { OpexConfirmationDto, OpexConfirmationStatus, OpexPart } from "../types"
import { OpexMessage, OpexPendingAction, type IOpexPendingAction } from "@/lib/db/models/Opex"
import { loadSession, opexDb, publishSessionUpdated } from "./sessions"
import { loadActor, roleOf, userOpexScope, type OpexServerScope } from "./scope"
import { compactToolOutput, stringifyForDisplay } from "./tool-runtime"
import { toolErrorMessage, type OpexTool } from "./tools/define"
import { findOpexTool, toolAllowedFor } from "./tools/registry"

/** Ação pendente expira depois disso (o card some como "Expirada"). */
export const OPEX_ACTION_TTL_MS = 24 * 60 * 60 * 1000

const log = loggerFor({ module: "opex-agent" })

type ActionDoc = IOpexPendingAction & { _id: Types.ObjectId }

/** A entrada pode carregar segredos (ex.: credencial de integração): fica cifrada no banco. */
function sealInput(input: unknown): unknown {
    const json = JSON.stringify(input ?? null)
    return isSecretBoxConfigured() ? { sealed: encryptSecret(json) } : { plain: json }
}

function openInput(stored: unknown): unknown {
    const value = stored as { sealed?: unknown; plain?: string } | null
    if (value && isEncryptedSecret(value.sealed)) return JSON.parse(decryptSecret(value.sealed))
    if (value && typeof value.plain === "string") return JSON.parse(value.plain)
    return null
}

export function toConfirmationDto(doc: Pick<ActionDoc, "_id" | "summary" | "status" | "error" | "expiresAt">, now = Date.now()): OpexConfirmationDto {
    const status: OpexConfirmationStatus = doc.status === "pending" && doc.expiresAt.getTime() <= now ? "expired" : doc.status
    return { actionId: doc._id.toString(), summary: doc.summary, status, error: doc.error ?? null }
}

export async function requestConfirmation(sessionId: string, messageId: string, tool: OpexTool, input: unknown, toolCallId: string): Promise<OpexConfirmationDto> {
    await opexDb()
    const parsed = tool.input.parse(input)
    const summary = tool.summarize?.(parsed) ?? tool.label
    const doc = await OpexPendingAction.create({
        sessionId: new Types.ObjectId(sessionId),
        messageId: new Types.ObjectId(messageId),
        toolCallId,
        toolName: tool.name,
        input: sealInput(parsed),
        summary,
        status: "pending",
        expiresAt: new Date(Date.now() + OPEX_ACTION_TTL_MS),
    })
    return toConfirmationDto(doc)
}

/** Estado atual das confirmações de uma lista de partes (gravação tardia ou decisão no meio do turno). */
export async function refreshConfirmations(parts: OpexPart[]): Promise<OpexPart[]> {
    const ids = parts.flatMap((part) => (part.type === "tool" && part.confirmation ? [part.confirmation.actionId] : []))
    if (!ids.length) return parts
    const docs = await OpexPendingAction.find({ _id: { $in: ids } }).lean<ActionDoc[]>()
    const byId = new Map(docs.map((doc) => [doc._id.toString(), toConfirmationDto(doc)]))
    return parts.map((part) => (part.type === "tool" && part.confirmation && byId.has(part.confirmation.actionId) ? { ...part, confirmation: byId.get(part.confirmation.actionId)! } : part))
}

async function syncMessagePart(action: ActionDoc, output: unknown): Promise<void> {
    if (!action.messageId) return
    const message = await OpexMessage.findById(action.messageId).select({ parts: 1 }).lean<{ parts: OpexPart[] }>()
    if (!message) return
    const confirmation = toConfirmationDto(action)
    const parts = message.parts.map((part) =>
        part.type === "tool" && part.confirmation?.actionId === confirmation.actionId
            ? { ...part, confirmation, state: confirmation.status === "failed" ? ("error" as const) : part.state, output: output === undefined ? part.output : stringifyForDisplay(output) }
            : part,
    )
    await OpexMessage.updateOne({ _id: action.messageId }, { $set: { parts } })
}

/**
 * Confirma (executa a ferramenta de verdade) ou cancela a ação pendente. A decisão e o resultado
 * voltam ao agente como uma nova mensagem da sessão, e o turno seguinte começa sozinho.
 */
export async function decideAction(actionId: string, decision: "confirm" | "cancel", actorId: string, scope: OpexServerScope): Promise<OpexConfirmationDto> {
    if (!Types.ObjectId.isValid(actionId)) throw new DomainError(404, "Ação não encontrada", "OPEX_ACTION_NOT_FOUND")
    await opexDb()
    const current = await OpexPendingAction.findById(actionId).lean<ActionDoc>()
    if (!current) throw new DomainError(404, "Ação não encontrada", "OPEX_ACTION_NOT_FOUND")
    // A ação só existe para quem enxerga a sessão dona (404 nos demais escopos).
    await loadSession(current.sessionId.toString(), scope)
    const dto = toConfirmationDto(current)
    if (dto.status === "expired") throw new DomainError(409, "A confirmação expirou: peça ao agente para repetir a ação", "OPEX_ACTION_EXPIRED")
    // Trava: só uma decisão vence.
    const claimed = await OpexPendingAction.findOneAndUpdate(
        { _id: current._id, status: "pending" },
        { $set: { status: decision === "confirm" ? "confirmed" : "cancelled", decidedAt: new Date() } },
        { new: true },
    ).lean<ActionDoc>()
    if (!claimed) throw new DomainError(409, "Esta ação já foi decidida", "OPEX_ACTION_DECIDED")

    const sessionId = claimed.sessionId.toString()
    const tool = findOpexTool(claimed.toolName)
    let followUp: string
    let output: unknown
    let final: ActionDoc = claimed
    if (decision === "cancel") {
        followUp = `O usuário CANCELOU a ação "${claimed.summary}" (actionId ${actionId}). Ela não foi executada.`
    } else if (!tool) {
        final = (await OpexPendingAction.findByIdAndUpdate(claimed._id, { $set: { status: "failed", error: "Ferramenta não existe mais" } }, { new: true }).lean<ActionDoc>())!
        followUp = `O usuário confirmou a ação "${claimed.summary}", mas a ferramenta ${claimed.toolName} não existe mais.`
    } else {
        try {
            // Revalida o usuário (ativo, papel atual) e a ferramenta para o papel na hora de executar —
            // o papel pode ter mudado depois do card.
            const executionScope = scope.kind === "user" ? userOpexScope(await loadActor(scope.actor.id)) : scope
            if (!toolAllowedFor(tool, roleOf(executionScope))) throw new Error("Esta ação não está disponível para o seu perfil.")
            output = compactToolOutput(await tool.execute(tool.input.parse(openInput(claimed.input)), { sessionId, actorId, scope: executionScope }))
            final = (await OpexPendingAction.findByIdAndUpdate(claimed._id, { $set: { result: JSON.stringify(output ?? null), input: null } }, { new: true }).lean<ActionDoc>())!
            followUp = `O usuário CONFIRMOU a ação "${claimed.summary}" (actionId ${actionId}) e ela foi executada. Resultado: ${JSON.stringify(output)}`
        } catch (error) {
            const message = toolErrorMessage(error)
            final = (await OpexPendingAction.findByIdAndUpdate(claimed._id, { $set: { status: "failed", error: message, input: null } }, { new: true }).lean<ActionDoc>())!
            followUp = `O usuário confirmou a ação "${claimed.summary}" (actionId ${actionId}), mas ela falhou: ${message}`
            log.info({ actionId, tool: claimed.toolName, err: message }, "[opex] ação confirmada falhou")
        }
    }
    if (decision === "cancel") await OpexPendingAction.updateOne({ _id: claimed._id }, { $set: { input: null } })

    await syncMessagePart(final, output)
    await recordAudit({
        userId: actorId,
        entidade: OPEX_AUDIT_ENTITY,
        entidadeId: sessionId,
        acao: decision === "confirm" ? AcaoAuditoria.EXECUTAR : AcaoAuditoria.ABORTAR,
        depois: { acao: claimed.summary, ferramenta: claimed.toolName, situacao: final.status, erro: final.error ?? undefined },
    })
    const { queueFollowUp } = await import("./runner")
    const display = decision === "cancel" ? `Cancelado: ${claimed.summary}` : final.status === "failed" ? `Confirmado (falhou): ${claimed.summary}` : `Confirmado: ${claimed.summary}`
    await queueFollowUp(sessionId, { kind: "confirmation", text: followUp, display })
    await publishSessionUpdated(sessionId)
    return toConfirmationDto(final)
}
