import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INTERVIEW_CONSUMPTION_ORIGIN, MADDOX_CATALOG_ORIGIN_RIGORS, MADDOX_PROFILE_SECTIONS, MADDOX_SHEET_RIGORS, type MaddoxScriptKind } from "../constants"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxInterview } from "../models"
import { characterConsolidationSchema, scenarioConsolidationSchema, type CharacterConsolidation, type ScenarioConsolidation } from "../interview-schemas"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { changed, getCampaignDetail } from "./campaigns"
import { notifyInterviewChanged } from "./campaign-realtime"
import { linkCatalogMentions } from "./catalog-mentions"
import { buildConsolidationInstructions, parseJsonObject, settingMarkdown, transcriptText } from "./interview-prompt"
import { abilityCardAwaitingFirstSubmit, findBackground, submittedAbilityCard } from "./interview-tools"
import { buildFinalScores, effectiveLevel, emptyBuild, hitPointsSettled, loadBuildCatalog, missingItems, type BuildContext } from "./character-build"
import { writeCharacterSheet } from "./sheet-builder"

const buildContextOf = (subject: InterviewSubject): BuildContext => ({ rigor: subject.campaign.rigor, startingLevel: subject.campaign.startingLevel ?? null })
import { acquireInterviewLock, campaignReservedNames, loadInterviewer, loadSubject, promptContext, releaseInterviewLock, type InterviewSubject } from "./interviews"

/**
 * Conclusão das entrevistas (Maddox 2) — SOMENTE servidor. Depois da confirmação, uma geração
 * estruturada (efêmera, com a conversa gravada) consolida o cenário ou o personagem em JSON validado;
 * nada é gravado se o JSON vier inválido duas vezes.
 */

const log = loggerFor({ module: "maddox", feature: "interview-consolidation" })
const ATTEMPTS = 2

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

/** Ficha do personagem: reaproveita a ligada ao personagem ou cria uma em branco (ligada já, para não ficar órfã). */
async function ensureSheet(subject: InterviewSubject, name: string): Promise<{ sheetId: Types.ObjectId; created: boolean }> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const current = subject.character?.sheetId ?? null
    if (current && (await CharacterSheet.exists({ _id: current }))) return { sheetId: current, created: false }
    const { createBlankSheet } = await import("@/features/character-sheets/api/character-sheets-service")
    const user = await User.findById(subject.member.userId).select("username").lean<{ username?: string }>()
    const sheet = await createBlankSheet(subject.member.userId, user?.username ?? "", name)
    const sheetId = new Types.ObjectId(String((sheet as { _id: unknown })._id))
    // Liga já: uma falha adiante não deixa uma ficha órfã (a nova tentativa reaproveita esta).
    await MaddoxCharacterModel.updateOne({ _id: subject.character!._id }, { $set: { sheetId } })
    return { sheetId, created: true }
}

async function finishInterview(doc: InterviewDoc, token: string, result: unknown) {
    const done = await MaddoxInterviewModel.updateOne({ _id: doc._id, "generating.token": token }, { $set: { status: "done", result, completedAt: new Date(), generating: null } })
    if (done.modifiedCount === 0) throw new DomainError(409, "A entrevista mudou durante a conclusão. Recarregue e tente de novo.", "INTERVIEW_CONFLICT")
}

async function completeScenario(subject: InterviewSubject, doc: InterviewDoc, token: string, data: ScenarioConsolidation, userId: string) {
    const rename = data.campaignName && data.campaignName !== subject.campaign.name ? data.campaignName : null
    const reserved = [...(await campaignReservedNames(subject.campaign)), ...(rename ? [rename] : [])]
    const [setting, openingSituation] = await Promise.all([linkCatalogMentions(settingMarkdown(data.setting), { reserved }), linkCatalogMentions(data.openingSituation, { reserved })])
    // Grava o cenário antes de marcar a entrevista como concluída: uma falha no meio deixa a entrevista em
    // `proposed`, e confirmar de novo reaplica (idempotente).
    await MaddoxCampaignModel.updateOne(
        { _id: subject.campaign._id },
        {
            $set: {
                setting,
                openingSituation,
                "scenarioInterview.status": "done",
                "scenarioInterview.completedAt": new Date(),
                ...(subject.campaign.status === "interview" ? { status: "lobby" } : {}),
                ...(rename ? { name: rename } : {}),
                // Nível (graus com ficha) ou estágio (narrativos) da mesa; sem valor combinado, cada personagem informa.
                ...(MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor) ? { startingLevel: data.startingLevel ?? null } : { startingStage: data.startingStage ?? "" }),
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
    const card = withSheet ? submittedAbilityCard(doc.messages) : null
    const final = withSheet ? buildFinalScores(doc) : null
    const reserved = [...(await campaignReservedNames(subject.campaign)), name]
    let sheet: { sheetId: Types.ObjectId; created: boolean } | null = null
    if (withSheet) {
        sheet = await ensureSheet(subject, name)
        await writeCharacterSheet({ sheetId: sheet.sheetId, name, portraitUrl: character.portraitUrl ?? null, doc, seed: data.sheet, ctx: buildContextOf(subject), reserved })
    }
    const profile = Object.fromEntries(
        await Promise.all(MADDOX_PROFILE_SECTIONS.map(async (item) => [item.key, data.profile[item.key] ? await linkCatalogMentions(data.profile[item.key]!, { reserved }) : "a definir durante a história"] as const)),
    )
    await MaddoxCharacterModel.updateOne(
        { _id: character._id },
        { $set: { name, profile, "interview.status": "done", "interview.scriptVersion": doc.scriptVersion, ...(sheet ? { sheetId: sheet.sheetId } : {}) } },
    )
    // Por último: falha antes daqui mantém a entrevista em `proposed` e confirmar de novo reaplica.
    await finishInterview(doc, token, card?.base && final ? { ...data, abilityScores: { method: card.method, base: card.base, bonus: card.bonus ?? null, final }, build: doc.build ?? null } : data)
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
    // Card de atributos aberto e nunca enviado: a ficha não sai de atributos extraídos da conversa.
    if (kind === "character" && MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor) && abilityCardAwaitingFirstSubmit(doc.messages)) {
        throw new DomainError(409, "Envie os atributos pelo card antes de concluir a entrevista.", "ABILITY_SCORES_PENDING")
    }
    // Rigoroso e Fiel: um bônus de origem fora do catálogo não vira ficha (o Maddox reaplica com uma origem do catálogo).
    const bonusOrigin = kind === "character" && MADDOX_CATALOG_ORIGIN_RIGORS.includes(subject.campaign.rigor) ? submittedAbilityCard(doc.messages)?.bonus?.background : null
    if (bonusOrigin && !(await findBackground(bonusOrigin))) {
        throw new DomainError(409, `O antecedente do bônus (${bonusOrigin}) não está no catálogo. Peça ao Maddox para escolher uma origem do catálogo e reaplicar o bônus.`, "BACKGROUND_NOT_IN_CATALOG")
    }
    // Graus com ficha: a ficha só sai completa (escolhas e, acima do nível 1, o card de PV).
    if (kind === "character" && MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor)) {
        const ctx = buildContextOf(subject)
        const build = doc.build ?? emptyBuild()
        const catalog = await loadBuildCatalog(build)
        const missing = missingItems(doc, catalog, ctx)
        const level = effectiveLevel(build, ctx)
        const hpPending = Boolean(level && level > 1 && catalog.cls && !hitPointsSettled(doc, level, catalog.cls.hitDice))
        const rest = missing.filter((item) => !item.startsWith("pontos de vida") && !item.startsWith("atributos"))
        if (rest.length) throw new DomainError(409, `Faltam escolhas na ficha: ${rest.join("; ")}. Peça ao Maddox para concluir antes de confirmar.`, "CHARACTER_BUILD_INCOMPLETE")
        if (hpPending) throw new DomainError(409, `Defina os pontos de vida dos níveis 2 a ${level} no card de PV antes de concluir. Peça ao Maddox para abrir o card.`, "HIT_POINTS_PENDING")
        if (!submittedAbilityCard(doc.messages)) throw new DomainError(409, "Envie os atributos pelo card antes de concluir a entrevista.", "ABILITY_SCORES_PENDING")
    }
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
        const withSheet = kind === "character" && MADDOX_SHEET_RIGORS.includes(subject.campaign.rigor)
        const instructions = buildConsolidationInstructions(context, withSheet, withSheet && Boolean(submittedAbilityCard(locked.messages)))
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
