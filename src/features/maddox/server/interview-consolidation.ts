import { Types, type Model } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INTERVIEW_CONSUMPTION_ORIGIN, MADDOX_PROFILE_SECTIONS, MADDOX_SHEET_RIGORS, type MaddoxScriptKind } from "../constants"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxInterview } from "../models"
import { characterConsolidationSchema, scenarioConsolidationSchema, type CharacterConsolidation, type CharacterSheetSeed, type ScenarioConsolidation } from "../interview-schemas"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { changed, getCampaignDetail } from "./campaigns"
import { notifyInterviewChanged } from "./campaign-realtime"
import { buildConsolidationInstructions, parseJsonObject, settingMarkdown, transcriptText } from "./interview-prompt"
import { acquireInterviewLock, loadInterviewer, loadSubject, promptContext, releaseInterviewLock, type InterviewSubject } from "./interviews"

/**
 * Conclusão das entrevistas (Maddox 2) — SOMENTE servidor. Depois da confirmação, uma geração
 * estruturada (efêmera, com a conversa gravada) consolida o cenário ou o personagem em JSON validado;
 * nada é gravado se o JSON vier inválido duas vezes.
 */

const log = loggerFor({ module: "maddox", feature: "interview-consolidation" })
const ATTEMPTS = 2
/** `maxlength` de raça/classe/subclasse/origem na `CharacterSheet`. */
const SHEET_NAME_FIELD_MAX = 2000

type InterviewDoc = IMaddoxInterview

async function consolidate<T>(instructions: string, transcript: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, interviewer: Awaited<ReturnType<typeof loadInterviewer>>["model"], subject: string): Promise<T> {
    const { generateAiText } = await import("@/lib/ai/stream")
    let lastError = ""
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
            const { text } = await generateAiText({
                provider: interviewer.provider,
                model: interviewer.model,
                agent: interviewer.agent,
                variant: interviewer.variant,
                instructions,
                prompt: `Conversa da entrevista:\n\n${transcript}\n\nResponda só com o JSON.`,
                title: "Maddox · consolidação da entrevista",
                consumption: { origin: MADDOX_INTERVIEW_CONSUMPTION_ORIGIN, subject },
            })
            const parsed = schema.safeParse(parseJsonObject(text))
            if (parsed.success) return parsed.data
            lastError = "JSON fora do formato"
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        log.warn({ attempt, err: lastError, subject }, "[maddox] consolidação da entrevista inválida")
    }
    throw new DomainError(502, `O Maddox não conseguiu consolidar a entrevista (${lastError}). Tente concluir de novo.`, "CONSOLIDATION_FAILED")
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Referência do catálogo do DnDicas por nome exato (sem acento e sem caixa); sem correspondência = `null`. */
async function catalogRef(modelName: "Race" | "CharacterClass" | "Background", name: string | null): Promise<Types.ObjectId | null> {
    if (!name) return null
    const model = await (async () => {
        if (modelName === "Race") return (await import("@/features/races/models/race")).RaceModel
        if (modelName === "CharacterClass") return (await import("@/features/classes/models/character-class")).CharacterClass
        return (await import("@/features/backgrounds/models/background")).BackgroundModel
    })()
    const pattern = new RegExp(`^${escapeRegex(name.trim())}$`, "i")
    const found = await (model as unknown as Model<{ _id: Types.ObjectId; name: string; originalName?: string }>)
        .findOne({ $or: [{ name: name.trim() }, { originalName: name.trim() }, { name: pattern }, { originalName: pattern }] })
        .collation({ locale: "pt", strength: 1 })
        .select("_id")
        .lean<{ _id: Types.ObjectId }>()
    return found?._id ?? null
}

/** Cria (ou atualiza) a ficha D&D básica do personagem a partir da consolidação. */
async function seedSheet(subject: InterviewSubject, name: string, portraitUrl: string | null, seed: CharacterSheetSeed | null): Promise<{ sheetId: Types.ObjectId; created: boolean }> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    let sheetId = subject.character?.sheetId ?? null
    let created = false
    if (!sheetId || !(await CharacterSheet.exists({ _id: sheetId }))) {
        const { createBlankSheet } = await import("@/features/character-sheets/api/character-sheets-service")
        const user = await User.findById(subject.member.userId).select("username").lean<{ username?: string }>()
        const sheet = await createBlankSheet(subject.member.userId, user?.username ?? "", name)
        sheetId = new Types.ObjectId(String((sheet as { _id: unknown })._id))
        created = true
        // Liga já: uma falha adiante não deixa uma ficha órfã (a nova tentativa reaproveita esta).
        await MaddoxCharacterModel.updateOne({ _id: subject.character!._id }, { $set: { sheetId } })
    }
    const [raceRef, classRef, originRef] = await Promise.all([catalogRef("Race", seed?.race ?? null), catalogRef("CharacterClass", seed?.class ?? null), catalogRef("Background", seed?.origin ?? null)])
    const set: Record<string, unknown> = { name, ...(portraitUrl ? { photo: portraitUrl } : {}), ...(created ? { level: 1 } : {}) }
    if (seed) {
        for (const key of ["appearance", "age", "height", "weight", "eyes", "skin", "hair"] as const) if (seed[key]) set[key] = seed[key]
        // Raça, classe, subclasse e origem têm 2.000 caracteres na ficha; o texto inteiro segue no resultado da entrevista.
        for (const key of ["race", "class", "subclass", "origin"] as const) if (seed[key]) set[key] = seed[key]!.slice(0, SHEET_NAME_FIELD_MAX)
        if (raceRef) set.raceRef = raceRef
        if (classRef) set.classRef = classRef
        if (originRef) set.originRef = originRef
        for (const [key, value] of Object.entries(seed.attributes ?? {})) if (typeof value === "number") set[key] = value
    }
    await CharacterSheet.updateOne({ _id: sheetId }, { $set: set })
    return { sheetId, created }
}

async function finishInterview(doc: InterviewDoc, token: string, result: unknown) {
    const done = await MaddoxInterviewModel.updateOne({ _id: doc._id, "generating.token": token }, { $set: { status: "done", result, completedAt: new Date(), generating: null } })
    if (done.modifiedCount === 0) throw new DomainError(409, "A entrevista mudou durante a conclusão. Recarregue e tente de novo.", "INTERVIEW_CONFLICT")
}

async function completeScenario(subject: InterviewSubject, doc: InterviewDoc, token: string, data: ScenarioConsolidation, userId: string) {
    const rename = data.campaignName && data.campaignName !== subject.campaign.name ? data.campaignName : null
    // Grava o cenário antes de marcar a entrevista como concluída: uma falha no meio deixa a entrevista em
    // `proposed`, e confirmar de novo reaplica (idempotente).
    await MaddoxCampaignModel.updateOne(
        { _id: subject.campaign._id },
        {
            $set: {
                setting: settingMarkdown(data.setting),
                openingSituation: data.openingSituation,
                "scenarioInterview.status": "done",
                "scenarioInterview.completedAt": new Date(),
                ...(subject.campaign.status === "interview" ? { status: "lobby" } : {}),
                ...(rename ? { name: rename } : {}),
            },
        },
    )
    await finishInterview(doc, token, data)
    await recordAudit({
        userId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(subject.campaign._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { status: subject.campaign.status, ...(rename ? { name: subject.campaign.name } : {}) },
        depois: { interview: "cenário concluído", scriptVersion: doc.scriptVersion, status: "lobby", ...(rename ? { name: rename } : {}) },
    })
}

async function completeCharacter(subject: InterviewSubject, doc: InterviewDoc, token: string, data: CharacterConsolidation, userId: string) {
    const character = subject.character!
    const name = data.name ?? character.name
    const withSheet = MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor)
    const sheet = withSheet ? await seedSheet(subject, name, character.portraitUrl ?? null, data.sheet) : null
    const profile = Object.fromEntries(MADDOX_PROFILE_SECTIONS.map((item) => [item.key, data.profile[item.key] || "a definir durante a história"]))
    await MaddoxCharacterModel.updateOne(
        { _id: character._id },
        { $set: { name, profile, "interview.status": "done", "interview.scriptVersion": doc.scriptVersion, ...(sheet ? { sheetId: sheet.sheetId } : {}) } },
    )
    // Por último: falha antes daqui mantém a entrevista em `proposed` e confirmar de novo reaplica.
    await finishInterview(doc, token, data)
    await recordAudit({
        userId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(subject.campaign._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { character: character.name, interview: character.interview?.status ?? "pending" },
        depois: { character: name, interview: "concluída", scriptVersion: doc.scriptVersion, ...(sheet ? { sheet: sheet.created ? "ficha criada" : "ficha atualizada", sheetId: String(sheet.sheetId) } : {}) },
    })
}

/**
 * "Confirmar e concluir": exige a síntese proposta pelo Maddox, consolida e grava o cenário (a campanha
 * volta ao lobby, pronta para as entrevistas de personagem) ou o perfil/ficha do personagem.
 */
export async function completeInterview(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<MaddoxCampaignDetailDto> {
    await dbConnect()
    const subject = await loadSubject(campaignId, kind, userId, "write")
    const doc = await MaddoxInterviewModel.findOne({ campaignId: subject.campaign._id, kind, memberId: kind === "character" ? subject.member._id : null }).lean<InterviewDoc>()
    if (!doc) throw new DomainError(404, "A entrevista ainda não começou.", "INTERVIEW_NOT_STARTED")
    if (doc.status === "done") throw new DomainError(409, "Esta entrevista já foi concluída.", "INTERVIEW_DONE")
    if (doc.status !== "proposed") throw new DomainError(409, "O Maddox ainda não apresentou a síntese para você confirmar.", "NO_PROPOSAL")
    const { settings, model } = await loadInterviewer()
    const { doc: locked, token } = await acquireInterviewLock(doc._id)
    // Outra aba pode ter enviado um ajuste entre a leitura e a trava: só consolida a síntese confirmada.
    if (locked.status !== "proposed") {
        await releaseInterviewLock(locked._id, token)
        throw new DomainError(409, "O Maddox ainda não apresentou a síntese para você confirmar.", "NO_PROPOSAL")
    }
    try {
        const context = await promptContext(subject, kind, locked.scriptVersion, settings)
        const transcript = transcriptText(locked.messages.filter((message) => !message.error))
        const instructions = buildConsolidationInstructions(context, kind === "character" && MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor))
        if (kind === "scenario") await completeScenario(subject, locked, token, await consolidate(instructions, transcript, scenarioConsolidationSchema, model, campaignId), userId)
        else await completeCharacter(subject, locked, token, await consolidate(instructions, transcript, characterConsolidationSchema, model, campaignId), userId)
    } catch (error) {
        await releaseInterviewLock(locked._id, token).catch(() => undefined)
        throw error
    }
    const { releaseInterviewSession } = await import("./opencode-sessions")
    await releaseInterviewSession(campaignId, kind === "scenario" ? "scenario-interview" : "character-interview", String(subject.member._id))
    await notifyInterviewChanged(campaignId, kind, userId)
    await changed(subject.campaign._id)
    return getCampaignDetail(campaignId, userId)
}
