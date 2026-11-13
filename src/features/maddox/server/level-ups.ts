import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { experienceValue, levelForXp, xpForLevel } from "@/features/character-sheets/utils/sheet-rules"
import type { LevelUpGains } from "@/features/character-sheets/level-up/level-up-types"
import {
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_LEVEL_UP_FAILED_MESSAGE,
    MADDOX_MILESTONE_TRIGGERS,
    MADDOX_PROGRESSION_DEFAULT,
    MADDOX_SHEET_RIGORS,
    type MaddoxMilestoneTrigger,
    type MaddoxProgressionMode,
    type MaddoxRigorLevel,
} from "../constants"
import type { MaddoxExperienceCardDto, MaddoxLevelUpCardDto, MaddoxLevelUpStepDto } from "../game-types"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, type IMaddoxCampaign, type IMaddoxLevelUp } from "../models"
import { takeDraftProgression } from "./game-live"

/**
 * Progressão de nível das Campanhas Maddox (DND-56) — SOMENTE servidor. Só nos graus com ficha.
 *
 * - **Marco**: o Maddox declara a subida do grupo inteiro para (maior nível + 1); cada personagem abaixo ganha um degrau
 *   por nível até lá (`campaign.levelUps`), concluídos em ordem.
 * - **Experiência**: a XP da ficha (número) só muda pelo Maddox; atingir o limiar abre os degraus só do personagem.
 *
 * Os degraus de humanos esperam o jogador no wizard; os de Personagens Opex são decididos pelo agente (`level-up-opex.ts`).
 * O que o narrador pede numa geração fica no job e só é gravado depois da fala (`commitProgression`).
 */

const log = loggerFor({ module: "maddox", feature: "level-ups" })

type CampaignDoc = IMaddoxCampaign

export class ProgressionRefusal extends Error {}

export const hasLevels = (rigor: MaddoxRigorLevel) => MADDOX_SHEET_RIGORS.includes(rigor)

/** Modo de progressão (`null` nos graus sem ficha). Campanhas sem o campo ficam em "marco". */
export function progressionModeOf(campaign: Pick<IMaddoxCampaign, "rigor" | "progression">): MaddoxProgressionMode | null {
    if (!hasLevels(campaign.rigor)) return null
    return campaign.progression?.mode ?? MADDOX_PROGRESSION_DEFAULT
}

export const isMilestoneTrigger = (value: string): value is MaddoxMilestoneTrigger => (MADDOX_MILESTONE_TRIGGERS as readonly string[]).includes(value)

// ── Grupo ──────────────────────────────────────────────────────────────────────

export interface PartyMember {
    memberId: Types.ObjectId
    userId: string
    kind: "human" | "opex"
    characterId: Types.ObjectId
    characterName: string
    sheetId: Types.ObjectId | null
    level: number | null
    experience: number
    className: string
    /** Ficha concluída (entrevista feita). */
    ready: boolean
}

const plainText = (html: string | undefined) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

/** Personagens ativos dos membros da campanha, com o nível e a XP das fichas. */
export async function partyOf(campaignId: Types.ObjectId): Promise<PartyMember[]> {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("_id userId kind characterId").lean<{ _id: Types.ObjectId; userId: string; kind?: "human" | "opex"; characterId?: Types.ObjectId | null }[]>()
    const characters = await MaddoxCharacterModel.find({ campaignId, memberId: { $in: members.map((member) => member._id) }, status: "active" })
        .select("_id memberId name sheetId interview")
        .lean<{ _id: Types.ObjectId; memberId: Types.ObjectId; name: string; sheetId: Types.ObjectId | null; interview?: { status?: string } }[]>()
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheetIds = characters.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    const sheets = sheetIds.length ? await CharacterSheet.find({ _id: { $in: sheetIds } }).select("_id level experience class").lean<{ _id: Types.ObjectId; level?: number; experience?: unknown; class?: string }[]>() : []
    const sheetOf = new Map(sheets.map((sheet) => [String(sheet._id), sheet]))
    const out: PartyMember[] = []
    for (const character of characters) {
        const member = members.find((item) => String(item._id) === String(character.memberId))
        if (!member) continue
        const sheet = character.sheetId ? sheetOf.get(String(character.sheetId)) : undefined
        out.push({
            memberId: member._id,
            userId: member.userId,
            kind: member.kind === "opex" ? "opex" : "human",
            characterId: character._id,
            characterName: character.name || "Personagem",
            sheetId: character.sheetId,
            level: sheet ? (sheet.level ?? 1) : null,
            experience: experienceValue(sheet?.experience),
            className: plainText(sheet?.class),
            ready: Boolean(sheet && character.interview?.status === "done"),
        })
    }
    return out
}

/** Maior nível entre as fichas concluídas (sem nenhuma, o nível inicial da mesa). */
export function groupLevel(party: readonly PartyMember[], campaign: Pick<IMaddoxCampaign, "startingLevel">): number {
    const levels = party.filter((member) => member.ready && member.level).map((member) => member.level!)
    return levels.length ? Math.max(...levels) : (campaign.startingLevel ?? 1)
}

const declaredLevels = (campaign: Pick<IMaddoxCampaign, "progression">) => (campaign.progression?.declared ?? []).map((item) => item.level)

/** Nível do grupo para a próxima declaração: o maior entre as fichas e os níveis já declarados (as pendências contam). */
export function partyTopLevel(party: readonly PartyMember[], campaign: Pick<IMaddoxCampaign, "startingLevel" | "progression">): number {
    return Math.max(groupLevel(party, campaign), ...declaredLevels(campaign), 1)
}

/** Nível em que o personagem fica depois de todos os degraus já abertos (concluídos ou não). */
const stepsOf = (campaign: Pick<IMaddoxCampaign, "levelUps">, characterId: Types.ObjectId | string) => (campaign.levelUps ?? []).filter((step) => String(step.characterId) === String(characterId))
const topStep = (campaign: Pick<IMaddoxCampaign, "levelUps">, characterId: Types.ObjectId | string) => Math.max(0, ...stepsOf(campaign, characterId).map((step) => step.toLevel))

export async function tacticalCombatActive(campaignId: Types.ObjectId): Promise<boolean> {
    return Boolean(await MaddoxCombatModel.exists({ campaignId, status: "active", mode: "tactical" }))
}

async function ensureProgression(campaignId: Types.ObjectId) {
    await MaddoxCampaignModel.updateOne({ _id: campaignId, progression: { $in: [null] } }, { $set: { progression: { mode: MADDOX_PROGRESSION_DEFAULT, declared: [], pendingMilestone: null } } })
}

// ── Declaração (Marco) ─────────────────────────────────────────────────────────

export interface DeclarationCheck {
    target: number
    party: PartyMember[]
}

/**
 * Pode declarar a subida do grupo? `inCombatAllowed` = o fim do combate tático já foi pedido nesta mesma geração.
 * Recusa com o motivo (pt-BR, para o Maddox).
 */
export async function checkDeclaration(campaign: CampaignDoc, options: { inCombatAllowed?: boolean } = {}): Promise<DeclarationCheck> {
    const mode = progressionModeOf(campaign)
    if (!mode) throw new ProgressionRefusal("Este grau de rigor não tem nível de personagem: não há subida de nível.")
    if (mode !== "marco") throw new ProgressionRefusal("Esta campanha usa o modo Experiência: os personagens sobem pela XP (use grant_experience).")
    if (!options.inCombatAllowed && (await tacticalCombatActive(campaign._id))) throw new ProgressionRefusal("A subida de nível só é declarada depois do combate tático.")
    const party = await partyOf(campaign._id)
    if (!party.some((member) => member.ready)) throw new ProgressionRefusal("Nenhum personagem tem a ficha concluída ainda.")
    const current = partyTopLevel(party, campaign)
    const target = current + 1
    if (target > 20) throw new ProgressionRefusal("O grupo já está no nível 20: não há mais subida de nível.")
    if (target <= current) throw new ProgressionRefusal(`O nível ${target} não é maior que o nível atual do grupo (${current}).`)
    if (declaredLevels(campaign).includes(target)) throw new ProgressionRefusal(`A subida para o nível ${target} já foi declarada.`)
    return { target, party }
}

const newStep = (member: PartyMember, fromLevel: number, source: MaddoxProgressionMode, declarationId: string | null, status: IMaddoxLevelUp["status"]) => ({
    _id: new Types.ObjectId(),
    characterId: member.characterId,
    memberId: member.memberId,
    characterName: member.characterName,
    kind: member.kind,
    fromLevel,
    toLevel: fromLevel + 1,
    source,
    declarationId,
    status,
    gains: null,
    error: null,
    messageId: null,
    narrated: false,
    createdAt: new Date(),
    doneAt: null,
    doneBy: null,
})

/** Degraus de um personagem até `target`, a partir do nível dele (ou do último degrau já aberto). */
function stepsUpTo(campaign: CampaignDoc, member: PartyMember, target: number, source: MaddoxProgressionMode, declarationId: string | null, status: IMaddoxLevelUp["status"]) {
    const from = Math.max(member.level ?? 1, topStep(campaign, member.characterId))
    const steps: ReturnType<typeof newStep>[] = []
    for (let level = from; level < Math.min(20, target); level++) steps.push(newStep(member, level, source, declarationId, status))
    return steps
}

export interface DeclareInput {
    reason: string
    trigger: MaddoxMilestoneTrigger | "manual"
    offMilestone: boolean
    turnNumber: number
}

/** Declara a subida do grupo (grava os degraus, o card e o nível declarado). Recusa com `ProgressionRefusal`. */
export async function declareGroupLevelUp(campaignId: Types.ObjectId, input: DeclareInput): Promise<{ level: number; steps: number }> {
    await ensureProgression(campaignId)
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign) throw new ProgressionRefusal("Campanha não encontrada.")
    const { target, party } = await checkDeclaration(campaign)
    const declarationId = randomUUID()
    const steps = party.filter((member) => member.ready).flatMap((member) => stepsUpTo(campaign, member, target, "marco", declarationId, "pending"))
    const message = await MaddoxCampaignMessageModel.create({
        campaignId,
        turnNumber: input.turnNumber,
        phase: "master",
        kind: "level-up",
        content: "",
        levelUp: { declarationId, source: "marco", toLevel: target, reason: input.reason, levelUpIds: steps.map((step) => step._id) },
    })
    const updated = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, "progression.declared.level": { $ne: target } },
        {
            $push: {
                levelUps: { $each: steps.map((step) => ({ ...step, messageId: message._id })) },
                "progression.declared": { id: declarationId, level: target, reason: input.reason, trigger: input.trigger, offMilestone: input.offMilestone, turnNumber: input.turnNumber, messageId: message._id, at: new Date() },
            },
            $set: { "progression.pendingMilestone": null },
        },
    )
    if (!updated.modifiedCount) {
        await MaddoxCampaignMessageModel.deleteOne({ _id: message._id })
        throw new ProgressionRefusal(`A subida para o nível ${target} já foi declarada.`)
    }
    await recordAudit({
        userId: "maddox",
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { level: target - 1 },
        depois: { event: "level-up-declared", level: target, reason: input.reason, trigger: input.trigger, offMilestone: input.offMilestone, steps: steps.length },
    }).catch(() => undefined)
    log.info({ campaignId: String(campaignId), level: target, steps: steps.length, trigger: input.trigger, offMilestone: input.offMilestone }, "[maddox] Maddox declarou a subida de nível do grupo")
    return { level: target, steps: steps.length }
}

/** Personagem que concluiu a ficha depois de declarações (Marco): degraus até o maior nível declarado. */
export async function catchUpLevelUps(campaignId: Types.ObjectId, characterId: Types.ObjectId): Promise<number> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || progressionModeOf(campaign) !== "marco") return 0
    const declared = campaign.progression?.declared ?? []
    if (!declared.length) return 0
    const member = (await partyOf(campaignId)).find((item) => String(item.characterId) === String(characterId))
    if (!member?.ready) return 0
    const top = Math.max(...declared.map((item) => item.level))
    const last = declared.reduce((latest, item) => (item.level > latest.level ? item : latest))
    const steps = stepsUpTo(campaign, member, top, "marco", last.id, "pending").map((step) => ({ ...step, messageId: last.messageId ?? null }))
    if (!steps.length) return 0
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $push: { levelUps: { $each: steps } } })
    if (last.messageId) await MaddoxCampaignMessageModel.updateOne({ _id: last.messageId }, { $push: { "levelUp.levelUpIds": { $each: steps.map((step) => step._id) } } })
    return steps.length
}

// ── Experiência ────────────────────────────────────────────────────────────────

export interface ExperienceEntry {
    characterId: Types.ObjectId | string
    amount: number
}

/**
 * Soma XP às fichas (modo Experiência), grava o card e abre os degraus de quem atingiu o limiar. Durante combate
 * tático, os degraus ficam "depois do combate".
 */
export async function grantExperience(campaignId: Types.ObjectId, entries: readonly ExperienceEntry[], reason: string, source: "combat" | "grant", turnNumber: number): Promise<{ total: number; levelUps: number }> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || progressionModeOf(campaign) !== "experiencia") throw new ProgressionRefusal("Esta campanha não usa o modo Experiência.")
    const party = await partyOf(campaignId)
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const lines: { characterId: Types.ObjectId; characterName: string; amount: number; total: number }[] = []
    const reached: { member: PartyMember; level: number }[] = []
    for (const entry of entries) {
        const member = party.find((item) => String(item.characterId) === String(entry.characterId))
        if (!member?.sheetId || !member.ready || entry.amount <= 0) continue
        const amount = Math.trunc(entry.amount)
        // $inc no driver: fichas antigas ainda podem guardar a XP como texto (a migração converte no boot).
        const incremented = await CharacterSheet.collection.findOneAndUpdate({ _id: member.sheetId, experience: { $type: "number" } }, { $inc: { experience: amount } }, { returnDocument: "after" })
        const total = incremented ? experienceValue(incremented.experience) : member.experience + amount
        if (!incremented) await CharacterSheet.collection.updateOne({ _id: member.sheetId }, { $set: { experience: total } })
        lines.push({ characterId: member.characterId, characterName: member.characterName, amount, total })
        const level = levelForXp(total)
        if (level > Math.max(member.level ?? 1, topStep(campaign, member.characterId))) reached.push({ member, level })
        await publishSheet(String(member.sheetId))
    }
    if (!lines.length) return { total: 0, levelUps: 0 }
    const total = lines.reduce((sum, line) => sum + line.amount, 0)
    await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "experience", content: "", experience: { source, reason, total, entries: lines } })
    const inCombat = await tacticalCombatActive(campaignId)
    let opened = 0
    for (const { member, level } of reached) {
        const steps = stepsUpTo(campaign, member, level, "experiencia", null, inCombat ? "waiting-combat" : "pending")
        if (!steps.length) continue
        const message = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "level-up", content: "", levelUp: { declarationId: null, source: "experiencia", toLevel: level, reason: `${member.characterName} atingiu ${xpForLevel(level).toLocaleString("pt-BR")} XP.`, levelUpIds: steps.map((step) => step._id) } })
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $push: { levelUps: { $each: steps.map((step) => ({ ...step, messageId: message._id })) } } })
        opened += steps.length
    }
    await recordAudit({
        userId: "maddox",
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: {},
        depois: { event: "experience-granted", source, reason, entries: lines.map((line) => ({ character: line.characterName, amount: line.amount, total: line.total })) },
    }).catch(() => undefined)
    log.info({ campaignId: String(campaignId), source, total, levelUps: opened }, "[maddox] XP concedida")
    return { total, levelUps: opened }
}

/** Fim do combate tático: os degraus que esperavam o combate abrem. */
export async function releaseCombatLevelUps(campaignId: Types.ObjectId): Promise<number> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("levelUps").lean<Pick<CampaignDoc, "levelUps">>()
    const waiting = (campaign?.levelUps ?? []).filter((step) => step.status === "waiting-combat")
    if (!waiting.length) return 0
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "levelUps.$[step].status": "pending" } }, { arrayFilters: [{ "step.status": "waiting-combat" }] })
    return waiting.length
}

async function publishSheet(sheetId: string) {
    try {
        const [{ CharacterSheetPusherService }, { CharacterSheet }] = await Promise.all([import("@/features/character-sheets/realtime/character-sheet-pusher-service"), import("@/features/character-sheets/models/character-sheet")])
        const sheet = await CharacterSheet.findById(sheetId).lean()
        if (sheet) await CharacterSheetPusherService.getInstance().publishSheetPatched({ sheet: JSON.parse(JSON.stringify({ ...sheet, _id: String(sheet._id) })) })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[maddox] falha ao avisar a ficha em tempo real")
    }
}

// ── Capítulos ──────────────────────────────────────────────────────────────────

export async function recordChapter(campaignId: Types.ObjectId, title: string, summary: string, turnNumber: number): Promise<Types.ObjectId> {
    const chapterId = new Types.ObjectId()
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $push: { chapters: { _id: chapterId, title, summary, turnNumber, createdAt: new Date() } } })
    await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "chapter", content: "", chapter: { chapterId, title, summary } })
    log.info({ campaignId: String(campaignId), title }, "[maddox] capítulo encerrado")
    return chapterId
}

// ── Gravação depois da fala ────────────────────────────────────────────────────

/**
 * Grava o que a geração pediu (capítulo, XP, declaração) e cuida da orientação do marco: o marco positivo não declarado
 * vira `pendingMilestone` (vai para a próxima narração); o entregue a esta narração sai. Nunca lança.
 */
export async function commitProgression(campaignId: Types.ObjectId, jobId: string, turnNumber: number): Promise<void> {
    const draft = takeDraftProgression(String(campaignId), jobId)
    try {
        // O fim de combate avaliado nesta geração não é avaliado de novo nos efeitos do fim.
        const combats = draft.evaluatedCombats.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
        if (combats.length) await MaddoxCombatModel.updateMany({ _id: { $in: combats } }, { $set: { milestoneEvaluated: true } })
        if (draft.chapter) await recordChapter(campaignId, draft.chapter.title, draft.chapter.summary, turnNumber)
        for (const grant of draft.grants) {
            try {
                await grantExperience(campaignId, grant.entries, grant.reason, "grant", turnNumber)
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] XP concedida pelo Maddox não gravada")
            }
        }
        let declared = false
        if (draft.declare) {
            try {
                await declareGroupLevelUp(campaignId, { reason: draft.declare.reason, trigger: isMilestoneTrigger(draft.declare.trigger) ? draft.declare.trigger : "manual", offMilestone: draft.declare.offMilestone, turnNumber })
                declared = true
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] declaração de subida de nível não gravada")
            }
        }
        if (draft.claimedLevelUps.length) {
            const ids = draft.claimedLevelUps.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
            await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "levelUps.$[step].narrated": true } }, { arrayFilters: [{ "step._id": { $in: ids } }] })
        }
        if (declared) return
        if (draft.milestone && isMilestoneTrigger(draft.milestone.trigger)) {
            await ensureProgression(campaignId)
            await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "progression.pendingMilestone": { trigger: draft.milestone.trigger, reason: draft.milestone.reason, turnNumber, at: new Date() } } })
        } else if (draft.claimedMilestoneAt) {
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "progression.pendingMilestone.at": draft.claimedMilestoneAt }, { $set: { "progression.pendingMilestone": null } })
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] falha ao gravar a progressão de nível da geração")
    }
}

/** Guarda o marco positivo decidido fora de uma geração (fim forçado do combate tático): orientação da próxima narração. */
export async function setPendingMilestone(campaignId: Types.ObjectId, trigger: MaddoxMilestoneTrigger, reason: string, turnNumber: number): Promise<void> {
    await ensureProgression(campaignId)
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "progression.pendingMilestone": { trigger, reason, turnNumber, at: new Date() } } })
}

// ── Leitura (wizard, mesa e cards) ─────────────────────────────────────────────

/** Primeiro degrau ainda não concluído de cada personagem (só ele pode ser concluído agora). */
export function currentSteps(campaign: Pick<IMaddoxCampaign, "levelUps">): IMaddoxLevelUp[] {
    const byCharacter = new Map<string, IMaddoxLevelUp>()
    for (const step of [...(campaign.levelUps ?? [])].sort((a, b) => a.toLevel - b.toLevel)) {
        if (step.status === "done") continue
        const key = String(step.characterId)
        if (!byCharacter.has(key)) byCharacter.set(key, step)
    }
    return [...byCharacter.values()]
}

export interface LevelUpViewer {
    memberId: string | null
    isOwner: boolean
}

export function levelUpStepDto(step: IMaddoxLevelUp, viewer: LevelUpViewer, actionable: ReadonlySet<string>, sheetIds: ReadonlyMap<string, string>): MaddoxLevelUpStepDto {
    const mine = Boolean(viewer.memberId) && String(step.memberId) === viewer.memberId
    const canComplete = actionable.has(String(step._id)) && (step.kind === "opex" ? viewer.isOwner && step.status === "failed" : mine && (step.status === "pending" || step.status === "failed"))
    return {
        id: String(step._id),
        characterId: String(step.characterId),
        characterName: step.characterName,
        kind: step.kind,
        fromLevel: step.fromLevel,
        toLevel: step.toLevel,
        status: step.status,
        gains: (step.gains as LevelUpGains | null) ?? null,
        error: step.status === "failed" && step.kind === "opex" ? (viewer.isOwner ? (step.error ?? MADDOX_LEVEL_UP_FAILED_MESSAGE) : MADDOX_LEVEL_UP_FAILED_MESSAGE) : null,
        mine,
        canComplete,
        canRetry: viewer.isOwner && step.kind === "opex" && step.status === "failed" && actionable.has(String(step._id)),
        sheetId: sheetIds.get(String(step.characterId)) ?? null,
    }
}

/** Mapas de apoio dos DTOs: fichas por personagem e os degraus que podem ser concluídos agora. */
export async function levelUpLookups(campaign: Pick<IMaddoxCampaign, "_id" | "levelUps">): Promise<{ sheetIds: Map<string, string>; actionable: Set<string> }> {
    const steps = campaign.levelUps ?? []
    if (!steps.length) return { sheetIds: new Map(), actionable: new Set() }
    const characterIds = [...new Set(steps.map((step) => String(step.characterId)))].map((id) => new Types.ObjectId(id))
    const characters = await MaddoxCharacterModel.find({ _id: { $in: characterIds } }).select("_id sheetId").lean<{ _id: Types.ObjectId; sheetId: Types.ObjectId | null }[]>()
    return {
        sheetIds: new Map(characters.filter((item) => item.sheetId).map((item) => [String(item._id), String(item.sheetId)])),
        actionable: new Set(currentSteps(campaign).map((step) => String(step._id))),
    }
}

export function levelUpCardDto(card: { toLevel: number; reason: string; source: MaddoxProgressionMode; levelUpIds: readonly (Types.ObjectId | string)[] }, campaign: Pick<IMaddoxCampaign, "levelUps">, viewer: LevelUpViewer, lookups: Awaited<ReturnType<typeof levelUpLookups>>): MaddoxLevelUpCardDto {
    const ids = new Set(card.levelUpIds.map(String))
    const steps = (campaign.levelUps ?? []).filter((step) => ids.has(String(step._id))).sort((a, b) => a.characterName.localeCompare(b.characterName, "pt-BR") || a.toLevel - b.toLevel)
    return { toLevel: card.toLevel, reason: card.reason, source: card.source, entries: steps.map((step) => levelUpStepDto(step, viewer, lookups.actionable, lookups.sheetIds)) }
}

export function experienceCardDto(card: { source: "combat" | "grant"; reason: string; total: number; entries: { characterId: Types.ObjectId | string; characterName: string; amount: number; total: number }[] }): MaddoxExperienceCardDto {
    return { source: card.source, reason: card.reason, total: card.total, entries: card.entries.map((entry) => ({ characterId: String(entry.characterId), characterName: entry.characterName, amount: entry.amount, total: entry.total })) }
}

/** Degraus que o espectador pode concluir agora (o próprio personagem; o dono, os Opex com falha). */
export async function viewerLevelUps(campaign: Pick<IMaddoxCampaign, "_id" | "levelUps" | "rigor">, viewer: LevelUpViewer): Promise<MaddoxLevelUpStepDto[]> {
    if (!hasLevels(campaign.rigor) || !(campaign.levelUps ?? []).length) return []
    const lookups = await levelUpLookups(campaign)
    return currentSteps(campaign)
        .map((step) => levelUpStepDto(step, viewer, lookups.actionable, lookups.sheetIds))
        .filter((step) => step.canComplete)
}

// ── Ficha (wizard) ─────────────────────────────────────────────────────────────

export interface CampaignSheetGate {
    campaignId: Types.ObjectId
    ownerId: string
    characterId: Types.ObjectId
    /** Degrau que esta subida conclui (`null` = ficha de campanha sem subida pendente). */
    step: IMaddoxLevelUp | null
    mode: MaddoxProgressionMode
}

/** A ficha é de uma campanha com nível? Devolve o degrau atual dela (ou `null` fora de campanha). */
export async function campaignLevelUpGate(sheetId: string): Promise<CampaignSheetGate | null> {
    if (!Types.ObjectId.isValid(sheetId)) return null
    const character = await MaddoxCharacterModel.findOne({ sheetId: new Types.ObjectId(sheetId) }).select("_id campaignId").lean<{ _id: Types.ObjectId; campaignId: Types.ObjectId }>()
    if (!character) return null
    const campaign = await MaddoxCampaignModel.findById(character.campaignId).select("_id ownerId rigor progression levelUps").lean<CampaignDoc>()
    if (!campaign) return null
    const mode = progressionModeOf(campaign)
    if (!mode) return null
    const step = currentSteps(campaign).find((item) => String(item.characterId) === String(character._id)) ?? null
    return { campaignId: campaign._id, ownerId: campaign.ownerId, characterId: character._id, step, mode }
}

/** Degrau concluído (wizard ou Opex): grava os ganhos e avisa a mesa. */
export async function completeLevelUpStep(campaignId: Types.ObjectId, stepId: Types.ObjectId, gains: LevelUpGains, doneBy: string): Promise<boolean> {
    const updated = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, levelUps: { $elemMatch: { _id: stepId, status: { $in: ["pending", "failed", "deciding"] } } } },
        { $set: { "levelUps.$.status": "done", "levelUps.$.gains": gains, "levelUps.$.error": null, "levelUps.$.doneAt": new Date(), "levelUps.$.doneBy": doneBy } },
    )
    if (updated.modifiedCount) {
        const { publishGameChanged } = await import("./game")
        await publishGameChanged(campaignId)
    }
    return updated.modifiedCount > 0
}

/** Linhas da tarefa do narrador sobre subidas por XP ainda não narradas. */
export function unnarratedLevelUps(campaign: Pick<IMaddoxCampaign, "levelUps">): IMaddoxLevelUp[] {
    return (campaign.levelUps ?? []).filter((step) => step.source === "experiencia" && !step.narrated && step.status !== "waiting-combat")
}
