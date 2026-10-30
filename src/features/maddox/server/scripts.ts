import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { User } from "@/features/users/models/user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_FEATURE_UPDATED_EVENT } from "@/features/ai/constants"
import {
    MADDOX_FEATURE,
    MADDOX_SCRIPT_AUDIT_ENTITY,
    MADDOX_SCRIPT_KINDS,
    type MaddoxScriptKind,
    type MaddoxScriptTopic,
} from "../constants"
import { MaddoxInterviewScriptModel } from "../models/maddox-interview-script"
import { defaultMaddoxScript } from "../script-draft"
import type { SaveMaddoxScriptInput } from "../schemas"
import type { MaddoxScriptStateDto, MaddoxScriptVersionDto } from "../types"

export { defaultMaddoxScript }

/**
 * Roteiros versionados das entrevistas do Maddox (cenário e personagem) — SOMENTE servidor. Cada
 * gravação cria uma versão imutável por tipo; a versão 0 é o padrão do código enquanto nada foi
 * gravado. Copiado do roteiro do Agente Entrevistador do Ciliar, com guia e tópicos livres.
 */

const CONFLICT_MESSAGE = "O roteiro foi alterado por outra pessoa. Recarregue e revise antes de salvar."
const HISTORY_LIMIT = 200

type ScriptDoc = { kind: MaddoxScriptKind; version: number; guide: string; topics: MaddoxScriptTopic[]; notes: string; createdBy: string; createdAt: Date }

const cleanTopics = (topics: readonly MaddoxScriptTopic[]): MaddoxScriptTopic[] => topics.map((topic) => ({ id: topic.id, text: topic.text, active: Boolean(topic.active) }))

async function names(ids: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id))
    if (!valid.length) return new Map()
    const users = await User.find({ _id: { $in: valid } }).select("name username").lean<Array<{ _id: unknown; name?: string; username: string }>>()
    return new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username]))
}

function toVersionDto(kind: MaddoxScriptKind, doc: ScriptDoc | null, byId: Map<string, string>): MaddoxScriptVersionDto {
    if (!doc) return defaultMaddoxScript(kind)
    return {
        kind,
        version: doc.version,
        notes: doc.notes ?? "",
        createdBy: doc.createdBy,
        createdByName: byId.get(doc.createdBy) ?? null,
        createdAt: new Date(doc.createdAt).toISOString(),
        guide: doc.guide,
        topics: cleanTopics(doc.topics ?? []),
    }
}

/** Versão vigente (a que uma entrevista nova usa). */
export async function currentMaddoxScript(kind: MaddoxScriptKind): Promise<MaddoxScriptVersionDto> {
    await dbConnect()
    const doc = await MaddoxInterviewScriptModel.findOne({ kind }).sort({ version: -1 }).lean<ScriptDoc>()
    return toVersionDto(kind, doc, new Map())
}

export async function getMaddoxScriptVersion(kind: MaddoxScriptKind, version: number): Promise<MaddoxScriptVersionDto | null> {
    if (version === 0) return defaultMaddoxScript(kind)
    await dbConnect()
    const doc = await MaddoxInterviewScriptModel.findOne({ kind, version }).lean<ScriptDoc>()
    if (!doc) return null
    return toVersionDto(kind, doc, await names([doc.createdBy]))
}

/** Vigente e histórico (do mais novo ao padrão) de um tipo. */
export async function getMaddoxScriptState(kind: MaddoxScriptKind): Promise<MaddoxScriptStateDto> {
    await dbConnect()
    const docs = await MaddoxInterviewScriptModel.find({ kind }).sort({ version: -1 }).limit(HISTORY_LIMIT).lean<ScriptDoc[]>()
    const byId = await names(docs.map((doc) => doc.createdBy))
    const history = [...docs.map((doc) => toVersionDto(kind, doc, byId)), defaultMaddoxScript(kind)].map((item) => ({ kind: item.kind, version: item.version, notes: item.notes, createdBy: item.createdBy, createdByName: item.createdByName, createdAt: item.createdAt }))
    return { current: toVersionDto(kind, docs[0] ?? null, byId), history }
}

export async function getAllMaddoxScripts(): Promise<Record<MaddoxScriptKind, MaddoxScriptStateDto>> {
    const states = await Promise.all(MADDOX_SCRIPT_KINDS.map((kind) => getMaddoxScriptState(kind)))
    return Object.fromEntries(MADDOX_SCRIPT_KINDS.map((kind, index) => [kind, states[index]])) as Record<MaddoxScriptKind, MaddoxScriptStateDto>
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000

/** Cada gravação cria uma versão nova (imutável). Conflito (409) se outra gravação aconteceu desde a abertura. */
export async function saveMaddoxScript(kind: MaddoxScriptKind, input: SaveMaddoxScriptInput, actorId: string): Promise<MaddoxScriptStateDto> {
    await dbConnect()
    const current = await currentMaddoxScript(kind)
    if (current.version !== input.version) throw new DomainError(409, CONFLICT_MESSAGE, "VERSION_CONFLICT")
    const next = input.version + 1
    const topics = cleanTopics(input.topics)
    try {
        await MaddoxInterviewScriptModel.create({ kind, version: next, guide: input.guide, topics, notes: input.notes, createdBy: actorId })
    } catch (error) {
        if (isDuplicateKey(error)) throw new DomainError(409, CONFLICT_MESSAGE, "VERSION_CONFLICT")
        throw error
    }
    await recordAudit({
        userId: actorId,
        entidade: MADDOX_SCRIPT_AUDIT_ENTITY,
        entidadeId: `${kind}:v${next}`,
        acao: AcaoAuditoria.CRIAR,
        antes: { kind, version: current.version },
        depois: { kind, version: next, notes: input.notes, topics: topics.map((topic) => `${topic.active ? "ativo" : "inativo"}: ${topic.text}`) },
    })
    await publishAppEvent(AI_FEATURE_UPDATED_EVENT, { feature: MADDOX_FEATURE }).catch(() => undefined)
    return getMaddoxScriptState(kind)
}
