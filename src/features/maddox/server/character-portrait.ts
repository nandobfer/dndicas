import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_CHARACTER_PORTRAIT_CONSUMPTION_ORIGIN,
    MADDOX_CHARACTER_PORTRAIT_FAILED_MESSAGE,
    MADDOX_CHARACTER_PORTRAIT_STALE_MS,
    MADDOX_CHARACTER_PORTRAIT_TIMEOUT_MS,
    MADDOX_INVITE_CLOSED_STATUSES,
    MADDOX_PROFILE_SECTIONS,
} from "../constants"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxCharacter } from "../models"
import type { CharacterSheetSeed } from "../interview-schemas"
import type { MaddoxCampaignDetailDto } from "../campaign-types"

/**
 * Retrato do personagem (DND-31) — SOMENTE servidor. Gerado uma única vez, em segundo plano, logo depois de
 * confirmar a síntese da entrevista de personagem; vira o `portraitUrl` (avatar no lobby, na mesa, nas falas e
 * no diário) e a foto da ficha D&D ligada. Falha (ou Gerador indisponível) = `failed`, com nova tentativa pelo
 * dono do personagem; `pending`/`generating` sem processo vivo há mais de 5 min vira `failed` na leitura.
 */

const log = loggerFor({ module: "maddox", feature: "character-portrait" })

type CharacterDoc = IMaddoxCharacter

/** Gerações vivas neste processo (as presas são as que não estão aqui) e as promessas, para os testes esperarem. */
type PortraitRuntime = { running: Map<string, Promise<void>> }
const globalForPortraits = globalThis as typeof globalThis & { __maddoxPortraits?: PortraitRuntime }
const runtime: PortraitRuntime = (globalForPortraits.__maddoxPortraits ??= { running: new Map() })

const APPEARANCE_FIELDS: readonly [keyof CharacterSheetSeed, string][] = [
    ["race", "Raça"],
    ["class", "Classe"],
    ["subclass", "Subclasse"],
    ["appearance", "Aparência"],
    ["age", "Idade"],
    ["height", "Altura"],
    ["weight", "Peso"],
    ["eyes", "Olhos"],
    ["skin", "Pele"],
    ["hair", "Cabelo"],
]

/** Menções do catálogo (`[Nome](#mention:Tipo:id)`) viram só o nome no pedido ao gerador. */
const plainText = (value: string) => value.replace(/\[([^\]]+)\]\(#mention:[^)]*\)/g, "$1").trim()

export interface CharacterPortraitPromptInput {
    campaignName: string
    style: string
    name: string
    profile: Record<string, string>
    sheet: Partial<CharacterSheetSeed> | null
}

/** Pedido ao Gerador de imagens: retrato 1:1 do peito para cima, com o perfil e a aparência combinados. Módulo puro. */
export function buildCharacterPortraitPrompt(input: CharacterPortraitPromptInput): string {
    const parts = [`Retrato do personagem jogador "${input.name}" da campanha de RPG "${input.campaignName}", do peito para cima, como um avatar.`]
    if (input.style.trim()) parts.push(`Estilo visual desta mesa: ${input.style.trim()}`)
    const appearance = APPEARANCE_FIELDS.flatMap(([key, label]) => {
        const value = input.sheet?.[key]
        return typeof value === "string" && value.trim() ? [`- ${label}: ${plainText(value)}`] : []
    })
    if (appearance.length) parts.push(`Aparência (respeite-a):\n${appearance.join("\n")}`)
    const profile = MADDOX_PROFILE_SECTIONS.filter((section) => ["identidade", "origem", "capacidades", "equipamentos"].includes(section.key)).flatMap((section) => {
        const value = input.profile[section.key]
        return value && value.trim() && value.trim() !== "a definir durante a história" ? [`### ${section.label}\n${plainText(value)}`] : []
    })
    if (profile.length) parts.push(`Perfil do personagem:\n\n${profile.join("\n\n")}`)
    parts.push("Sem texto, letras, legendas, balões ou molduras na imagem.")
    return parts.join("\n\n")
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`a geração do retrato passou de ${Math.round(ms / 1000)} s`))
        }, ms)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/** Avisa o lobby e, com a campanha já em jogo, a mesa (o avatar aparece nas falas e no painel). */
async function notify(campaignId: Types.ObjectId) {
    try {
        const { changed } = await import("./campaigns")
        await changed(campaignId)
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("status").lean<Pick<IMaddoxCampaign, "status">>()
        if (campaign && campaign.status !== "lobby" && campaign.status !== "interview") {
            const { publishGameChanged } = await import("./game")
            await publishGameChanged(campaignId)
        }
    } catch (error) {
        log.warn({ err: error, campaignId: String(campaignId) }, "[maddox] falha ao avisar a mesa sobre o retrato")
    }
}

const profileOf = (character: Pick<CharacterDoc, "profile">): Record<string, string> =>
    character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) }

/** Aparência consolidada na entrevista; raça, classe e subclasse vêm das escolhas da ficha quando o grau tem ficha. */
async function sheetSeedOf(characterId: Types.ObjectId): Promise<Partial<CharacterSheetSeed> | null> {
    const interview = await MaddoxInterviewModel.findOne({ characterId, kind: "character" })
        .select("result build")
        .lean<{ result?: { sheet?: Partial<CharacterSheetSeed> | null } | null; build?: { race?: { name?: string } | null; class?: { name?: string } | null; subclass?: { name?: string } | null } | null }>()
    if (!interview) return null
    const seed: Partial<CharacterSheetSeed> = { ...(interview.result?.sheet ?? {}) }
    if (!seed.race && interview.build?.race?.name) seed.race = interview.build.race.name
    if (!seed.class && interview.build?.class?.name) seed.class = interview.build.class.name
    if (!seed.subclass && interview.build?.subclass?.name) seed.subclass = interview.build.subclass.name
    return Object.keys(seed).length ? seed : null
}

/** Gera o retrato reservado (`pending`): gerador, gravação no personagem e na ficha, auditoria e aviso à mesa. */
export async function runCharacterPortrait(characterId: string): Promise<void> {
    await dbConnect()
    const claimed = await MaddoxCharacterModel.findOneAndUpdate(
        { _id: characterId, "portrait.status": "pending" },
        { $set: { "portrait.status": "generating", "portrait.startedAt": new Date(), "portrait.error": null } },
        { returnDocument: "after" },
    ).lean<CharacterDoc>()
    if (!claimed) return
    const campaignId = claimed.campaignId
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("name").lean<Pick<IMaddoxCampaign, "_id" | "name">>()
        if (!campaign) throw new Error("campanha não encontrada")
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        const prompt = buildCharacterPortraitPrompt({
            campaignName: campaign.name,
            style: settings.sceneImages?.style ?? "",
            name: claimed.name,
            profile: profileOf(claimed),
            sheet: await sheetSeedOf(claimed._id),
        })
        const { generateAndStoreDndImage } = await import("@/features/ai/server/image-generator")
        const stored = await withTimeout(
            (signal) =>
                generateAndStoreDndImage({
                    prompt,
                    entityLabel: `Retrato de ${claimed.name} · ${campaign.name}`,
                    preferredAspectRatio: "1:1",
                    userId: claimed.userId,
                    storageKey: `maddox/campaigns/${String(campaignId)}/characters/${String(claimed._id)}-${Date.now()}`,
                    consumptionOrigin: MADDOX_CHARACTER_PORTRAIT_CONSUMPTION_ORIGIN,
                    consumptionSubject: String(campaignId),
                    signal,
                }),
            MADDOX_CHARACTER_PORTRAIT_TIMEOUT_MS,
        )
        const saved = await MaddoxCharacterModel.updateOne(
            { _id: claimed._id, "portrait.status": "generating" },
            { $set: { portraitUrl: stored.url, "portrait.status": "done", "portrait.error": null, "portrait.completedAt": new Date() } },
        )
        if (saved.modifiedCount === 0) {
            log.warn({ campaignId: String(campaignId), characterId }, "[maddox] o retrato terminou depois de ser marcado como falha; descartado")
            return
        }
        if (claimed.sheetId) {
            const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
            await CharacterSheet.updateOne({ _id: claimed.sheetId, userId: claimed.userId }, { $set: { photo: stored.url } })
        }
        log.info({ campaignId: String(campaignId), characterId, key: stored.key }, "[maddox] retrato do personagem gerado")
        await recordAudit({
            userId: claimed.userId,
            entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
            entidadeId: String(campaignId),
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { character: claimed.name, portrait: "gerado" },
        }).catch((error: unknown) => log.warn({ err: error, characterId }, "[maddox] falha ao auditar o retrato"))
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        await MaddoxCharacterModel.updateOne(
            { _id: claimed._id, "portrait.status": "generating" },
            { $set: { "portrait.status": "failed", "portrait.error": MADDOX_CHARACTER_PORTRAIT_FAILED_MESSAGE, "portrait.completedAt": new Date() } },
        )
        log.warn({ campaignId: String(campaignId), characterId, err: reason }, "[maddox] o retrato do personagem falhou")
        await recordAudit({
            userId: claimed.userId,
            entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
            entidadeId: String(campaignId),
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { character: claimed.name, portrait: "falhou" },
        }).catch((auditError: unknown) => log.warn({ err: auditError, characterId }, "[maddox] falha ao auditar o retrato"))
    }
    await notify(campaignId)
}

/** Dispara a geração em segundo plano (sem `await`); falhas são tratadas aqui mesmo. */
export function scheduleCharacterPortrait(characterId: string): void {
    if (runtime.running.has(characterId)) return
    const job = runCharacterPortrait(characterId)
        .catch((error: unknown) => log.error({ err: error, characterId }, "[maddox] erro inesperado ao gerar o retrato"))
        .finally(() => runtime.running.delete(characterId))
    runtime.running.set(characterId, job)
}

/** Testes: espera as gerações de retrato em andamento neste processo. */
export async function waitForCharacterPortraits(): Promise<void> {
    while (runtime.running.size) await Promise.all([...runtime.running.values()])
}

/**
 * Retratos presos (processo reiniciado no meio da geração) viram falha e liberam a nova tentativa. Ajusta os
 * documentos recebidos para a tela já sair com o estado novo.
 */
export async function expireStaleCharacterPortraits(characters: CharacterDoc[]): Promise<number> {
    const limit = Date.now() - MADDOX_CHARACTER_PORTRAIT_STALE_MS
    const stale = characters.filter((character) => {
        const status = character.portrait?.status
        if (status !== "pending" && status !== "generating") return false
        if (runtime.running.has(String(character._id))) return false
        const since = character.portrait?.startedAt ?? character.updatedAt
        return !since || new Date(since).getTime() < limit
    })
    if (!stale.length) return 0
    const now = new Date()
    const result = await MaddoxCharacterModel.updateMany(
        { _id: { $in: stale.map((character) => character._id) }, "portrait.status": { $in: ["pending", "generating"] } },
        { $set: { "portrait.status": "failed", "portrait.error": MADDOX_CHARACTER_PORTRAIT_FAILED_MESSAGE, "portrait.completedAt": now } },
    )
    for (const character of stale) character.portrait = { status: "failed", error: MADDOX_CHARACTER_PORTRAIT_FAILED_MESSAGE, startedAt: character.portrait?.startedAt ?? null, completedAt: now }
    if (result.modifiedCount) log.warn({ expired: result.modifiedCount }, "[maddox] retratos de personagem presos marcados como falha")
    return result.modifiedCount
}

/**
 * "Gerar retrato (de novo)": só o dono do personagem, com a entrevista concluída e sem retrato pronto (falha ou
 * personagem antigo sem imagem). A reserva é condicional: dois cliques geram uma vez só.
 */
export async function retryCharacterPortrait(campaignId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    await dbConnect()
    const { loadMembership, getCampaignDetail } = await import("./campaigns")
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) throw new DomainError(409, "A campanha foi encerrada: os personagens não podem mais ser alterados.", "CAMPAIGN_CLOSED")
    const character = member.characterId ? await MaddoxCharacterModel.findOne({ _id: member.characterId, userId }).lean<CharacterDoc>() : null
    if (!character) throw new DomainError(404, "Você ainda não tem personagem nesta campanha.", "CHARACTER_NOT_FOUND")
    if (character.interview?.status !== "done") throw new DomainError(409, "O retrato é gerado depois que a entrevista do personagem é concluída.", "INTERVIEW_REQUIRED")
    await expireStaleCharacterPortraits([character])
    const reserved = await MaddoxCharacterModel.updateOne(
        {
            _id: character._id,
            $or: [{ "portrait.status": "failed" }, { "portrait.status": null, portraitUrl: null }, { portrait: { $exists: false }, portraitUrl: null }],
        },
        { $set: { "portrait.status": "pending", "portrait.error": null, "portrait.startedAt": new Date(), "portrait.completedAt": null } },
    )
    if (reserved.modifiedCount === 0) throw new DomainError(409, "O retrato deste personagem já está pronto ou sendo gerado.", "PORTRAIT_NOT_RETRYABLE")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { character: character.name, portrait: "nova tentativa" } })
    scheduleCharacterPortrait(String(character._id))
    const { changed } = await import("./campaigns")
    await changed(campaign._id)
    return getCampaignDetail(campaignId, userId)
}
