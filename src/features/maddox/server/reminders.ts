import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, type MaddoxCampaignMemoryKind } from "../constants"
import type { MaddoxReminderInput } from "../game-schemas"
import type { MaddoxGameStateDto } from "../game-types"
import { MaddoxCampaignMessageModel, type IMaddoxCampaignMessage } from "../models"
import { assertMemberCanPlay } from "./campaigns"
import { assertActive, characterOf, getGameState, loadAsMember, publishGameChanged } from "./game"
import { isActiveMaddoxJob, jobReminders, setJobReminders, type MaddoxDraftReminder } from "./game-live"

/**
 * Injetar Lembrança (DND-25) — SOMENTE servidor. Um membro pronto envia um texto curto que a PRÓXIMA narração do Maddox
 * considera (em todos os graus). A narração reivindica as lembranças pendentes no começo (`jobId`): quem envia durante a
 * geração fica para a seguinte. A decisão do Maddox (guardar como memória da campanha ou usar só naquela narração) fica
 * no job (`resolve_reminder`) e só é aplicada depois de a narração ser gravada; se a geração falhar, as lembranças voltam
 * a esperar. Enviar não conta como declaração e não muda o turno.
 */

const log = loggerFor({ module: "maddox", feature: "reminders" })

/** Lembranças por narração (proteção do prompt; as demais ficam para a próxima). */
const REMINDERS_PER_NARRATION = 20

export async function submitReminder(campaignId: string, input: MaddoxReminderInput, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    await assertMemberCanPlay(campaignId, userId)
    const character = await characterOf(member)
    const message = await MaddoxCampaignMessageModel.create({
        campaignId: campaign._id,
        turnNumber: campaign.turn?.number ?? 0,
        phase: campaign.turn?.phase ?? "master",
        kind: "reminder",
        memberId: member._id,
        userId,
        characterId: character?._id ?? null,
        characterName: character?.name ?? null,
        content: input.texto,
        reminder: { status: "pending", jobId: null, claimedAt: null, resolvedAt: null, memoryKind: null, memoryTitle: null, visibility: null },
    })
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.CRIAR, depois: { reminder: String(message._id), turn: campaign.turn?.number ?? 0, chars: input.texto.length } })
    log.info({ campaignId, reminderId: String(message._id), memberId: String(member._id), chars: input.texto.length }, "[maddox] lembrança injetada")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/**
 * Começo de uma narração: reivindica as lembranças pendentes (as soltas e as de uma geração que já não roda, ex.: o
 * processo caiu) para o job e as guarda nele. Devolve as que a narração deve considerar.
 */
export async function claimReminders(campaignId: Types.ObjectId, jobId: string): Promise<MaddoxDraftReminder[]> {
    const pending = await MaddoxCampaignMessageModel.find({ campaignId, kind: "reminder", "reminder.status": "pending" })
        .sort({ _id: 1 })
        .limit(REMINDERS_PER_NARRATION * 2)
        .select("_id characterName content reminder")
        .lean<Pick<IMaddoxCampaignMessage, "_id" | "characterName" | "content" | "reminder">[]>()
    const free = pending.filter((item) => !item.reminder?.jobId || (item.reminder.jobId !== jobId && !isActiveMaddoxJob(String(campaignId), item.reminder.jobId))).slice(0, REMINDERS_PER_NARRATION)
    const claimed: MaddoxDraftReminder[] = []
    for (const item of free) {
        const won = await MaddoxCampaignMessageModel.updateOne(
            { _id: item._id, "reminder.status": "pending", "reminder.jobId": item.reminder?.jobId ?? null },
            { $set: { "reminder.jobId": jobId, "reminder.claimedAt": new Date() } },
        )
        if (won.modifiedCount === 0) continue
        claimed.push({ id: String(item._id), characterName: item.characterName ?? "Personagem", text: item.content, memory: null, decided: false })
    }
    const already = pending.filter((item) => item.reminder?.jobId === jobId).map((item) => ({ id: String(item._id), characterName: item.characterName ?? "Personagem", text: item.content, memory: null, decided: false }))
    const all = [...already, ...claimed]
    setJobReminders(String(campaignId), jobId, all)
    if (all.length) log.info({ campaignId: String(campaignId), jobId, reminders: all.length }, "[maddox] lembranças consideradas nesta narração")
    return all
}

/** Geração que falhou: as lembranças dela voltam a esperar a próxima narração. Nunca lança. */
export async function releaseReminders(campaignId: Types.ObjectId, jobId: string): Promise<void> {
    try {
        await MaddoxCampaignMessageModel.updateMany({ campaignId, kind: "reminder", "reminder.status": "pending", "reminder.jobId": jobId }, { $set: { "reminder.jobId": null, "reminder.claimedAt": null } })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), jobId }, "[maddox] falha ao devolver as lembranças da geração")
    }
    setJobReminders(String(campaignId), jobId, [])
}

/** Ids curtos (do fim do `_id`) que o prompt usa para cada lembrança. */
export const reminderRef = (id: string) => id.slice(-6)

export interface ReminderDecision {
    lembranca: string
    guardar: boolean
    tipo?: MaddoxCampaignMemoryKind
    titulo?: string
    texto?: string
    visibility?: "players" | "master"
}

/** Decisão do Maddox sobre uma lembrança (rascunho do job; aplicado depois da narração). Erro em pt-BR para o modelo. */
export function decideReminder(campaignId: Types.ObjectId, jobId: string | undefined, input: ReminderDecision): { lembranca: string; decisao: string; nota: string } | string {
    const reminders = jobId ? jobReminders(String(campaignId), jobId) : []
    if (!reminders.length) return "Não há lembranças dos jogadores nesta narração."
    const wanted = input.lembranca.trim().toLowerCase()
    const reminder = reminders.find((item) => reminderRef(item.id) === wanted || item.id === wanted)
    if (!reminder) return `Lembrança "${input.lembranca}" não encontrada. Lembranças desta narração: ${reminders.map((item) => reminderRef(item.id)).join(", ")}.`
    if (input.guardar) {
        const title = input.titulo?.trim()
        const text = input.texto?.trim()
        if (!title || !text) return "Para guardar a lembrança como memória, informe `titulo` e `texto` (o conteúdo consolidado)."
        reminder.memory = { kind: input.tipo ?? "fato", title, text, visibility: input.visibility ?? "players" }
    } else reminder.memory = null
    reminder.decided = true
    return {
        lembranca: reminderRef(reminder.id),
        decisao: input.guardar ? "guardar" : "usar só nesta narração",
        nota: input.guardar ? "A memória é gravada depois que a narração for gravada." : "A lembrança vale só para esta narração.",
    }
}

/**
 * Depois de a narração ser gravada: grava as memórias pedidas (com a fila temporária quando a rede de memórias está fora)
 * e marca cada lembrança como guardada ou usada só nesta narração. Falha na gravação da memória vira "usada só neste
 * turno" com aviso no log (a narração já foi feita com ela).
 */
export async function commitReminders(campaignId: Types.ObjectId, jobId: string, turnNumber: number): Promise<void> {
    const reminders = jobReminders(String(campaignId), jobId)
    if (!reminders.length) return
    setJobReminders(String(campaignId), jobId, [])
    for (const reminder of reminders) {
        let saved = false
        if (reminder.memory) {
            try {
                const { saveCampaignMemory } = await import("@/features/engramind/server/campaign-memories")
                await saveCampaignMemory(String(campaignId), { kind: reminder.memory.kind as MaddoxCampaignMemoryKind, title: reminder.memory.title, text: reminder.memory.text, visibility: reminder.memory.visibility, turnNumber, tags: ["lembranca"] })
                saved = true
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), reminderId: reminder.id }, "[maddox] não foi possível guardar a lembrança como memória")
            }
        }
        await MaddoxCampaignMessageModel.updateOne(
            { _id: new Types.ObjectId(reminder.id), "reminder.status": "pending" },
            {
                $set: {
                    "reminder.status": saved ? "saved" : "discarded",
                    "reminder.resolvedAt": new Date(),
                    "reminder.memoryKind": saved ? reminder.memory!.kind : null,
                    "reminder.memoryTitle": saved ? reminder.memory!.title : null,
                    "reminder.visibility": saved ? reminder.memory!.visibility : null,
                },
            },
        )
    }
    log.info({ campaignId: String(campaignId), jobId, saved: reminders.filter((item) => item.memory).length, total: reminders.length }, "[maddox] lembranças avaliadas pelo Maddox")
}

/** Seção da tarefa com as lembranças desta narração (vazia = nenhuma). */
export function remindersTaskSection(reminders: readonly MaddoxDraftReminder[], rigorWithSheet: boolean): string {
    if (!reminders.length) return ""
    return [
        "## Lembranças dos jogadores (considere nesta narração)",
        ...reminders.map((item) => `- [${reminderRef(item.id)}] **${item.characterName}**: ${item.text.replace(/\s+/g, " ").trim()}`),
        "",
        `Cada lembrança é contexto que o jogador quer que você considere AGORA; ela não muda as regras do grau${rigorWithSheet ? " e, se contradisser a ficha, a ficha prevalece" : ""}. Para CADA uma, chame \`resolve_reminder\` com o id entre colchetes: \`guardar: true\` (com \`tipo\`, \`titulo\`, \`texto\` e \`visibility\`: players = os jogadores sabem; master = só o mestre) quando ela for um fato durável da campanha que você deve lembrar sempre; \`guardar: false\` quando valer só para este momento. Não cite a lembrança nem a ferramenta na narração.`,
    ].join("\n")
}
