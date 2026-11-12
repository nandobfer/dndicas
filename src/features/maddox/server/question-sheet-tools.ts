import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { normalizeCatalogName } from "../catalog-markup"
import { plainText } from "../combat-options"
import { combatSheetChangeSchema, requiresCatalogSource, type CombatSheetChange } from "../combat-prep-schemas"
import { freshEconomy, type CombatFlags } from "../combat-rules"
import type { CombatPrepChange, TacticalCharacterState } from "../combat-types"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxInterview } from "../models"
import { checkCatalogSource } from "./catalog-reads"
import { questionRun, type QuestionRun } from "./question-runs"

/**
 * Leitura e correção da ficha pelo "Pergunte ao mestre" (DND-51) — SOMENTE servidor. Só dentro do job da resposta a uma
 * pergunta (`questionRun`): quem perguntou corrige o próprio personagem; o dono da campanha, qualquer um. As correções
 * passam pela lista fechada da ficha (`applySheetChanges`, auditada e com a ficha aberta atualizada), pela fonte do
 * catálogo lida nesta resposta e pela escolha do jogador (`choice.quote`). O que muda aparece na mesa para todos.
 */

const log = loggerFor({ module: "maddox", feature: "question-sheet" })

export class QuestionSheetError extends Error {}

type CharacterRow = { _id: Types.ObjectId; name: string; status: string; sheetId: Types.ObjectId | null; memberId: Types.ObjectId }

const NOT_IN_QUESTION = 'Esta ferramenta só funciona na resposta a uma pergunta do "Pergunte ao mestre".'

function requireRun(jobId: string | undefined): QuestionRun {
    const run = questionRun(jobId)
    if (!run) throw new QuestionSheetError(NOT_IN_QUESTION)
    return run
}

/** O personagem pelo nome, se quem perguntou pode corrigi-lo (o dele; o dono da campanha corrige qualquer um). */
async function targetOf(run: QuestionRun, name: string): Promise<CharacterRow> {
    const characters = await MaddoxCharacterModel.find({ campaignId: new Types.ObjectId(run.campaignId), status: { $in: ["active", "dead"] } })
        .select("name status sheetId memberId")
        .lean<CharacterRow[]>()
    const wanted = normalizeCatalogName(name)
    const character = characters.find((item) => normalizeCatalogName(item.name) === wanted)
    if (!character) throw new QuestionSheetError(`Nenhum personagem jogador chamado "${name}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (!run.askerIsOwner && String(character._id) !== run.askerCharacterId) throw new QuestionSheetError(`Quem perguntou só pode corrigir o próprio personagem; ${character.name} é de outro jogador.`)
    if (!character.sheetId) throw new QuestionSheetError(`${character.name} não tem ficha.`)
    return character
}

const pseudoState = (character: CharacterRow): TacticalCharacterState => ({
    actorKey: `character:${String(character._id)}`,
    characterId: String(character._id),
    memberId: String(character.memberId),
    userId: "",
    name: character.name,
    sheetId: String(character.sheetId),
    conditions: [],
    flags: {} as CombatFlags,
    economy: freshEconomy(),
    concentration: null,
    stable: false,
    dead: character.status === "dead",
    hpZero: false,
    left: false,
    ready: null,
})

/** Ficha inteira (com os ids que as correções citam) e as opções de combate que ela gera. */
export async function readCharacterSheet(jobId: string | undefined, name: string) {
    const run = requireRun(jobId)
    const character = await targetOf(run, name)
    const { loadPrepSheet } = await import("./combat-prep")
    const context = await loadPrepSheet(pseudoState(character), new Types.ObjectId(run.campaignId))
    if (!context) throw new QuestionSheetError(`A ficha de ${character.name} não foi encontrada.`)
    return { personagem: character.name, ficha: context.sheetText, opcoesDeCombate: context.optionsText, observacao: "Os PV mudam com `update_character_hit_points`; o resto da ficha, com `update_character_sheet`." }
}

const clipText = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

/** O que a entrevista registrou: as escolhas gravadas e as falas do jogador (onde ele disse o que escolheu). */
export async function readCharacterInterview(jobId: string | undefined, name: string) {
    const run = requireRun(jobId)
    const character = await targetOf(run, name)
    const campaignId = new Types.ObjectId(run.campaignId)
    const [interview, campaign] = await Promise.all([
        MaddoxInterviewModel.findOne({ campaignId, kind: "character", characterId: character._id }).lean<IMaddoxInterview>(),
        MaddoxCampaignModel.findById(campaignId).select("rigor startingLevel worldCatalog").lean<Pick<IMaddoxCampaign, "rigor" | "startingLevel" | "worldCatalog">>(),
    ])
    if (!interview || !campaign) return { personagem: character.name, entrevista: null, aviso: "A entrevista deste personagem não foi encontrada." }
    const { buildSummary, loadBuildCatalog, emptyBuild, buildContextOfCampaign } = await import("./character-build")
    const build = interview.build ?? emptyBuild()
    const summary = buildSummary(interview, await loadBuildCatalog(build), buildContextOfCampaign(campaign))
    const messages = interview.messages.filter((message) => message.content?.trim())
    const proposal = [...messages].reverse().find((message) => message.role === "maddox" && message.proposal)
    return {
        personagem: character.name,
        escolhasGravadas: summary,
        falasDoJogador: messages.filter((message) => message.role === "user").map((message) => clipText(message.content, 2_000)),
        sinteseFinal: proposal ? clipText(proposal.content, 6_000) : null,
    }
}

export interface QuestionSheetUpdate {
    personagem: string
    alteracoes: readonly unknown[]
}

/** Aplica as correções pedidas (lista fechada), conferindo a fonte do catálogo e a escolha do jogador. */
export async function updateCharacterSheetFromQuestion(jobId: string | undefined, input: QuestionSheetUpdate) {
    const run = requireRun(jobId)
    const character = await targetOf(run, input.personagem)
    const refused: { alteracao: number; motivo: string }[] = []
    const parsed: CombatSheetChange[] = []
    const indexOf = new Map<CombatSheetChange, number>()
    input.alteracoes.forEach((raw, index) => {
        const result = combatSheetChangeSchema.safeParse(raw)
        if (!result.success) {
            refused.push({ alteracao: index + 1, motivo: `fora do formato: ${result.error.issues.map((issue) => `${issue.path.join(".") || "alteração"}: ${issue.message}`).join("; ")}` })
            return
        }
        const change = result.data
        if (requiresCatalogSource("sheet", change)) {
            const problem = checkCatalogSource(change.source, run.reads)
            if (problem) {
                refused.push({ alteracao: index + 1, motivo: `${problem} (leia a regra com get_catalog_entity nesta resposta e cite o trecho)` })
                return
            }
        }
        parsed.push(change)
        indexOf.set(change, index + 1)
    })
    const limited = await withPlayerLimits(run, character, parsed, (change, motivo) => refused.push({ alteracao: indexOf.get(change) ?? 0, motivo }))
    const { screenPlayerChoices, choiceSheetOf } = await import("./sheet-choice-rules")
    const screen = await screenPlayerChoices(limited, run.reads, run.playerTexts, await choiceSheetOf(character.sheetId))
    for (const item of screen.refused) refused.push({ alteracao: indexOf.get(item.change) ?? 0, motivo: item.refused ?? "recusada" })
    const campaign = await MaddoxCampaignModel.findById(run.campaignId).select("ownerId").lean<Pick<IMaddoxCampaign, "_id" | "ownerId">>()
    const { applySheetChanges } = await import("./combat-sheet-writes")
    const written = await applySheetChanges(screen.allowed, {
        sheetId: String(character.sheetId),
        campaignId: run.campaignId,
        auditUserId: run.askerUserId ?? campaign?.ownerId ?? "",
        requestedBy: run.askerUserId,
        characterName: character.name,
        origin: "question",
    })
    const applied = written.changes.filter((change) => change.applied)
    if (applied.length) await postSheetChangeLine(run, character, applied)
    log.info({ campaignId: run.campaignId, character: character.name, applied: applied.length, refused: refused.length }, "[maddox] ficha corrigida pelo Pergunte ao mestre")
    return {
        personagem: character.name,
        aplicadas: applied.map(changeText),
        naoAplicadas: written.changes.filter((change) => !change.applied).map((change) => `${changeText(change)} (a ficha mudou ou o registro não existe)`),
        recusadas: refused,
        ...(screen.refused.length ? { faltaEscolhaDoJogador: screen.refused.map((item) => item.refused), orientacao: "Pergunte ao jogador e grave depois com o trecho da resposta dele em `choice.quote`." } : {}),
    }
}

export const PLAYER_ITEM_LIMIT = "item ganho na história entra pela narração; pelo Pergunte ao mestre, o jogador só repõe o equipamento escolhido na entrevista (o dono da campanha corrige qualquer item)"
export const PLAYER_REMOVE_SOURCE = "para tirar uma característica ou um talento da ficha, cite a regra do catálogo que mostra que o personagem não o tem (`source`)"

/**
 * Revisão DND-51 (F5): o que o jogador comum NÃO faz sozinho pelo "Pergunte ao mestre" (o dono da campanha faz tudo):
 * - acrescentar item ou aumentar a quantidade além do equipamento da entrevista (itens ganhos entram pela narração);
 * - tirar característica ou talento sem a fonte do catálogo lida nesta resposta.
 * Diminuir quantidade, remover item, equipar e as demais correções seguem livres (com as travas de fonte e de escolha).
 */
async function withPlayerLimits(run: QuestionRun, character: CharacterRow, changes: readonly CombatSheetChange[], refuse: (change: CombatSheetChange, motivo: string) => void): Promise<CombatSheetChange[]> {
    if (run.askerIsOwner) return [...changes]
    const needsEquipment = changes.some((change) => change.type === "item-add" || change.type === "item-quantity")
    const equipment = needsEquipment ? await interviewEquipment(new Types.ObjectId(run.campaignId), character._id) : []
    const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
    const out: CombatSheetChange[] = []
    for (const change of changes) {
        if (change.type === "item-add" || change.type === "item-quantity") {
            let catalogId: string | null = null
            let name = ""
            let current = 0
            if (change.type === "item-add") {
                catalogId = change.catalogItemId ?? null
                name = change.name ?? ""
                const existing = catalogId && Types.ObjectId.isValid(catalogId) ? await CharacterItem.findOne({ sheetId: character.sheetId, catalogItemId: new Types.ObjectId(catalogId) }).select("quantity").lean<{ quantity?: number }>() : null
                current = existing ? (existing.quantity ?? 1) : 0
            } else {
                const item = Types.ObjectId.isValid(change.itemId) ? await CharacterItem.findOne({ _id: new Types.ObjectId(change.itemId), sheetId: character.sheetId }).select("catalogItemId name quantity").lean<{ catalogItemId?: Types.ObjectId | null; name: string; quantity?: number }>() : null
                catalogId = item?.catalogItemId ? String(item.catalogItemId) : null
                name = item?.name ?? ""
                current = item?.quantity ?? 1
                if (change.quantity <= current) {
                    out.push(change)
                    continue
                }
            }
            const wanted = normalizeCatalogName(plainText(name))
            const entry = equipment.find((item) => (catalogId && item.id === catalogId) || (wanted && normalizeCatalogName(item.name) === wanted))
            const total = change.type === "item-add" ? current + change.quantity : change.quantity
            if (!entry || total > entry.quantity) {
                refuse(change, PLAYER_ITEM_LIMIT)
                continue
            }
        }
        if ((change.type === "trait-remove" || change.type === "feat-remove") && checkCatalogSource(change.source, run.reads)) {
            refuse(change, PLAYER_REMOVE_SOURCE)
            continue
        }
        out.push(change)
    }
    return out
}

async function interviewEquipment(campaignId: Types.ObjectId, characterId: Types.ObjectId): Promise<{ id: string | null; name: string; quantity: number }[]> {
    const interview = await MaddoxInterviewModel.findOne({ campaignId, kind: "character", characterId }).select("build").lean<Pick<IMaddoxInterview, "build">>()
    return interview?.build?.equipment ?? []
}

const changeText = (change: CombatPrepChange) => `${change.label}: ${change.before} → ${change.after}`

/** Linha pública na mesa: "Ficha de X corrigida: … (motivo)". */
async function postSheetChangeLine(run: QuestionRun, character: CharacterRow, changes: readonly CombatPrepChange[]) {
    const lines = changes.map((change) => `${change.label}: ${change.before} → ${change.after}${change.reason ? ` (${change.reason})` : ""}`)
    await MaddoxCampaignMessageModel.create({
        campaignId: new Types.ObjectId(run.campaignId),
        turnNumber: run.turnNumber,
        phase: "players",
        kind: "sheet-change",
        characterId: character._id,
        characterName: character.name,
        content: `Ficha de ${character.name} corrigida:\n${lines.map((line) => `- ${line}`).join("\n")}`,
        replyToId: new Types.ObjectId(run.questionId),
    })
}
