import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { User } from "@/features/users/models/user"
import {
    MADDOX_ANSWER_FAILED_MESSAGE,
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_CHECK_RIGORS,
    MADDOX_COMBAT_RIGORS,
    MADDOX_DECLARATION_VALIDATION_RIGORS,
    MADDOX_GAME_CHANGED_EVENT,
    MADDOX_GAME_PAGE_SIZE,
    MADDOX_MASTER_GENERATION_TIMEOUT_MS,
    MADDOX_MASTER_HEARTBEAT_MS,
    MADDOX_MASTER_TIMEOUT_MESSAGE,
    MADDOX_MASTER_LOCK_STALE_MS,
    MADDOX_MASTER_RETRY_MS,
    MADDOX_COMBAT_FORCE_END_AFTER,
    MADDOX_TACTICAL_COMBAT_RIGORS,
    MADDOX_OPEX_FAILED_MESSAGE,
    MADDOX_OPEX_LABEL,
    type MaddoxTurnPhase,
} from "../constants"
import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxNpcModel,
    type IMaddoxCampaign,
    type IMaddoxCombat,
    type IMaddoxNpc,
    type IMaddoxCampaignMember,
    type IMaddoxCampaignMessage,
    type IMaddoxCharacter,
} from "../models"
import type { MaddoxGameActionInput, MaddoxSkipPlayerInput } from "../game-schemas"
import type { MaddoxGameCheckDto, MaddoxGameMessageDto, MaddoxGameMessagesPageDto, MaddoxGameParticipantDto, MaddoxGameStateDto } from "../game-types"
import { checkSucceeded, keptD20 } from "../check-modifier"
import { isHiddenPlayerAction, type PlayerActionsViewer } from "../player-actions-visibility"
import { assertMemberCanPlay, isMemberReadyToPlay, loadMembership } from "./campaigns"
import { getMaddoxMaster, type MaddoxMasterDeclaration } from "./game-master"
import { beginLive, enqueueMaddoxJob, isCampaignBusy, takeDraftActionOptions, takeDraftChecks, takeDraftCombat, takeDraftImages } from "./game-live"
import { onlineUserIds } from "./game-presence"
import { isOpexMember, isOpexUserId, realUserIds } from "./opex-members"

/**
 * Mesa e motor de turnos das Campanhas Maddox (Maddox 3). SOMENTE servidor; `userId` é o usuário EFETIVO.
 *
 * - O dono inicia a campanha (`lobby` → `active`) e o turno 1 do mestre abre a história.
 * - Ao terminar o turno do mestre, abre o turno dos jogadores com a lista de ELEGÍVEIS fixada (membros
 *   ativos que concluíram a entrevista): quem fica pronto depois entra no próximo turno.
 * - O turno dos jogadores fecha quando todos os elegíveis PRESENTES (canal de presença do Pusher) já
 *   declararam ou passaram, com ao menos uma declaração. Presença desconhecida = todos os elegíveis.
 * - Pergunta ao mestre é respondida na hora e não muda o turno.
 * - Toda ação de jogo chama `assertMemberCanPlay` (entrevista de personagem concluída).
 * - O mestre é o narrador com IA (Maddox 4). Narrações e respostas entram na FILA da campanha (`game-live`, uma
 *   geração por vez) e rodam em segundo plano: a requisição que fecha o turno ou pergunta responde logo, e o texto
 *   chega a todos pelo stream da mesa. Nos rigores Rigoroso e Fiel ao D&D a declaração é validada antes de gravar.
 */

const log = loggerFor({ module: "maddox", feature: "game" })

type CampaignDoc = IMaddoxCampaign
type MemberDoc = IMaddoxCampaignMember
type CharacterDoc = IMaddoxCharacter
type MessageDoc = IMaddoxCampaignMessage

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000
const idSet = (ids: readonly Types.ObjectId[] | undefined) => new Set((ids ?? []).map(String))

export function assertActive(campaign: CampaignDoc) {
    if (campaign.status !== "active") throw new DomainError(409, "A campanha não está em andamento.", "CAMPAIGN_NOT_ACTIVE")
}

export function assertPlayersTurn(campaign: CampaignDoc) {
    if (campaign.turn?.phase !== "players") throw new DomainError(409, "O Maddox está narrando. Aguarde o turno dos jogadores.", "MASTER_TURN")
}

export async function loadAsMember(campaignId: string, userId: string): Promise<{ campaign: CampaignDoc; member: MemberDoc }> {
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    return { campaign: campaign as CampaignDoc, member }
}

const reloadCampaign = async (id: Types.ObjectId) => {
    const campaign = await MaddoxCampaignModel.findById(id).lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    return campaign
}

/** Membros ativos com o personagem (para elegibilidade e DTO). */
async function joinedMembers(campaignId: Types.ObjectId) {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).sort({ joinedAt: 1, createdAt: 1 }).lean<MemberDoc[]>()
    const characterIds = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const characters = characterIds.length ? await MaddoxCharacterModel.find({ _id: { $in: characterIds } }).lean<CharacterDoc[]>() : []
    const byId = new Map(characters.map((character) => [String(character._id), character]))
    return members.map((member) => ({ member, character: member.characterId ? (byId.get(String(member.characterId)) ?? null) : null }))
}

const readyMemberIds = async (campaignId: Types.ObjectId) => (await joinedMembers(campaignId)).filter(({ character }) => isMemberReadyToPlay(character)).map(({ member }) => member._id)

/** Avisa todos os membros ativos (e quem mais for indicado) que a mesa mudou. Nunca lança. */
export async function publishGameChanged(campaignId: Types.ObjectId, extraUserIds: string[] = []) {
    try {
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { updatedAt: new Date() } }, { timestamps: false })
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("turn").lean<Pick<CampaignDoc, "turn">>()
        const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("userId").lean<{ userId: string }[]>()
        const channels = [...new Set(realUserIds([...members.map((member) => member.userId), ...extraUserIds]))].map(maddoxUserChannel)
        await publishToChannels(channels, MADDOX_GAME_CHANGED_EVENT, { campaignId: String(campaignId), turnNumber: campaign?.turn?.number ?? 0, phase: campaign?.turn?.phase ?? "master" })
    } catch (error) {
        log.warn({ err: error, campaignId: String(campaignId) }, "[maddox] Falha ao avisar a mesa")
    }
    // Personagens Opex (DND-26): cada mudança da mesa pode ser a vez deles (rolar, reagir, agir). Fora da requisição atual.
    setTimeout(() => {
        void import("./opex-table").then(({ driveOpex }) => driveOpex(campaignId)).catch(() => undefined)
    }, 0)
}

// ── Turno do mestre ────────────────────────────────────────────────────────────

/**
 * Narra o turno `turnNumber` do mestre (com a trava `token`) e abre o turno dos jogadores com a nova
 * lista de elegíveis. Retomada segura: a narração já gravada deste turno é reaproveitada.
 */
async function runMasterTurn(campaignId: Types.ObjectId, token: string, turnNumber: number, jobId: string): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.turn?.generating?.token !== token || campaign.turn.number !== turnNumber) return
    // Rodada de testes (Maddox 5): 0 narra as declarações; cada continuação narra o resultado dos testes da rodada anterior.
    const round = campaign.turn.checkRound ?? 0
    // Pulso da trava: uma narração longa (com ferramentas) não é tomada como trava velha por outra chamada.
    const heartbeat = setInterval(() => {
        void MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.generating.startedAt": new Date() } }, { timestamps: false }).catch(() => undefined)
    }, MADDOX_MASTER_HEARTBEAT_MS)
    heartbeat.unref?.()
    let live: ReturnType<typeof beginLive> | null = null
    try {
        const existing = await MaddoxCampaignMessageModel.findOne({ campaignId, turnNumber, kind: "narration", ...segmentFilter(round) }).select("_id").lean()
        if (!existing) {
            const actions = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: turnNumber - 1, turnAction: true }).sort({ _id: 1 }).lean<MessageDoc[]>()
            let declarations: MaddoxMasterDeclaration[] = actions.map((action) => ({
                characterName: action.characterName ?? "Personagem",
                kind: action.kind === "pass" ? "pass" : "declaration",
                content: action.content,
                skipped: Boolean(action.skippedBy),
            }))
            if (round === 0 && declarations.length > 0 && MADDOX_CHECK_RIGORS.includes(campaign.rigor)) {
                const { withCheckHints } = await import("./check-hints")
                declarations = await withCheckHints(campaign, declarations)
            }
            // Combate (Maddox 6 e 7): o combate ativo antes da narração e a orientação do JEV "Início ou fim de combate".
            const tacticalRigor = MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)
            let blockBefore: import("../combat-types").TacticalBlock | null = null
            const combatModule = MADDOX_COMBAT_RIGORS.includes(campaign.rigor) || tacticalRigor ? await import("./combat") : null
            if (tacticalRigor) {
                // Combate tático: a iniciativa que acabou de fechar vira a ordem; a fila dos adversários deste turno é preparada.
                const tactical = await import("./tactical-combat")
                if (round > 0) await tactical.finishInitiativeIfReady(campaignId, turnNumber, round)
                // DND-25: a narração do que já aconteceu vem primeiro (sem adversários); depois, um bloco por adversário.
                const prepared = await tactical.prepareMonsterQueue(campaignId, turnNumber, { lead: declarations.length > 0 || round > 0, round })
                blockBefore = prepared?.tactical.phase === "running" ? (prepared.tactical.block ?? null) : null
            }
            const combatBefore = combatModule ? await combatModule.findActiveCombat(campaignId) : null
            let combatHint: "start" | "end" | null = null
            if (combatModule && round === 0 && declarations.length > 0) {
                const { combatBoundaryHint } = await import("./combat-hints")
                combatHint = await combatBoundaryHint(campaign, declarations, combatBefore ? { title: combatBefore.title } : null)
            }
            live = beginLive(String(campaignId), { kind: "narration", turnNumber, replyToId: null }, jobId)
            const master = await getMaddoxMaster()
            const sink = live
            const content = await withGenerationTimeout((signal) => master.narrate({ campaignId: String(campaignId), jobId, turnNumber, round, declarations, combatHint, signal }, sink))
            // Os testes pedidos nesta geração só viram mensagens agora, logo abaixo da narração (ordem dos `_id`).
            const { draftCheckMessage } = await import("./game-checks")
            const drafts = takeDraftChecks(String(campaignId), jobId)
            // Sugestões de ação (DND-30): só valem quando a narração abre o turno dos jogadores; com testes pedidos, o turno do
            // mestre continua e elas são descartadas.
            const draftOptions = takeDraftActionOptions(String(campaignId), jobId)
            if (draftOptions.length && drafts.length) log.info({ campaignId: String(campaignId), turnNumber, round, characters: draftOptions.length }, "[maddox] sugestões de ação descartadas: a narração pediu testes")
            const actionOptions = draftOptions.length && !drafts.length ? draftOptions.map((item) => ({ memberId: new Types.ObjectId(item.memberId), characterId: new Types.ObjectId(item.characterId), characterName: item.characterName, options: item.options })) : null
            // O combate pedido nesta geração é aplicado ANTES de gravar a narração (o card precisa do id): o card de início vem acima
            // dela, o de fim abaixo. Os efeitos do fim só rodam depois (`finishCombatTurn`), que também grava o card que faltar.
            const combatEvents = takeDraftCombat(String(campaignId), jobId)
            // Combate tático: a vez dos adversários (cópia de trabalho do job) é gravada antes do fim do combate.
            const tacticalMessages = tacticalRigor ? await (await import("./tactical-master")).commitTacticalWorkspace(campaignId, jobId) : []
            const combat = combatModule && combatEvents.length ? await combatModule.applyCombatDrafts(campaign, turnNumber, combatEvents, round) : { messages: [], touched: [], extraMessages: [] }
            const combatCard = (plan: { event: "start" | "end"; combatId: Types.ObjectId }) => ({ campaignId, turnNumber, phase: "master" as const, kind: "combat" as const, content: "", segment: round, combat: plan })
            const inserted = await MaddoxCampaignMessageModel.insertMany(
                [
                    ...combat.messages.filter((plan) => plan.event === "start").map(combatCard),
                    // Bloco de um adversário (DND-25): os dados (cards das ações) vêm antes da narração dele.
                    ...(blockBefore?.kind === "npc" ? tacticalMessages : []),
                    { campaignId, turnNumber, phase: "master", kind: "narration", content, segment: round, actionOptions },
                    ...drafts.map((draft) => draftCheckMessage(campaignId, turnNumber, round, draft)),
                    ...(blockBefore?.kind === "npc" ? [] : tacticalMessages),
                    ...combat.extraMessages,
                    ...combat.messages.filter((plan) => plan.event === "end").map(combatCard),
                ],
                { ordered: true },
            )
            const message = inserted.find((item) => item.kind === "narration")
            if (combatModule && round === 0) await combatModule.countCombatNarration(campaignId, [...(combatBefore ? [combatBefore._id] : []), ...combat.touched])
            live.end({ messageId: String(message!._id), error: null })
            // Lembranças desta narração (DND-25): guardadas como memória ou usadas só agora, depois da narração gravada.
            await (await import("./reminders")).commitReminders(campaignId, jobId, turnNumber)
            // Imagens nas cenas (Maddox 10): a pedida nesta narração fica ligada a ela; os retratos marcados, aos NPCs.
            await scheduleDraftImages(campaignId, jobId, turnNumber, round, message!._id)
            if (drafts.length) log.info({ campaignId: String(campaignId), turnNumber, round, checks: drafts.length }, "[maddox] Maddox pediu testes")
        }
        // Combate (Maddox 6 e 7): card que faltar (gravação interrompida) e os efeitos do fim, depois das mensagens.
        const tacticalCampaign = MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)
        if (MADDOX_COMBAT_RIGORS.includes(campaign.rigor) || tacticalCampaign) {
            const { finishCombatTurn } = await import("./combat")
            await finishCombatTurn(campaign, turnNumber, round)
        }
        if (tacticalCampaign) {
            const { armReactionWindows } = await import("./combat-reactions")
            await armReactionWindows(campaignId)
        }
        // Quem saiu da campanha durante a geração não recebe o teste: ele já entra cancelado (o Maddox resolve sem ele).
        const { cancelOrphanChecks } = await import("./game-checks")
        await cancelOrphanChecks(campaignId, turnNumber, round)

        const { hasRoundWaits } = await import("./game-checks")
        const roundChecks = await hasRoundWaits(campaignId, turnNumber, round)
        if (roundChecks && tacticalCampaign) await (await import("./tactical-combat")).countBlockWait(campaignId, round)
        const opened = roundChecks ? null : tacticalCampaign ? await nextCombatStep(campaign, token, turnNumber, round) : null
        if (opened === "done") {
            // A vez seguinte do combate tático já foi aberta (ou outro turno do mestre agendado).
        } else if (roundChecks) {
            // Os testes fazem parte do turno do mestre: a mesa espera as rolagens (sem trava de geração).
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.awaitingChecks": true, "turn.checkRound": round, "turn.generating": null, "turn.failedAt": null, "turn.pauseUntil": null } })
            // Nenhum pendente (todos cancelados porque o jogador saiu): a continuação entra na fila logo.
            const { advanceAfterChecks } = await import("./game-checks")
            await advanceAfterChecks(campaignId, turnNumber, round)
        } else {
            const eligible = await readyMemberIds(campaignId)
            const reopened = await MaddoxCampaignModel.updateOne(
                { _id: campaignId, "turn.generating.token": token },
                {
                    $set: {
                        "turn.phase": "players",
                        "turn.startedAt": new Date(),
                        "turn.eligibleMemberIds": eligible,
                        "turn.declaredMemberIds": [],
                        "turn.generating": null,
                        "turn.failedAt": null,
                        "turn.awaitingChecks": false,
                        "turn.checkRound": 0,
                        "turn.combatActor": null,
                    },
                },
            )
            if (reopened.modifiedCount === 0) log.info({ campaignId: String(campaignId), turnNumber }, "[maddox] Turno do mestre já retomado por outra chamada")
        }
    } catch (error) {
        // Libera a trava e marca a falha: a retomada só acontece depois de `MADDOX_MASTER_RETRY_MS` (no `GET`/`check`).
        // Sem aviso aos clientes: o estado não mudou, e recarregar já faria a próxima tentativa sem espera.
        log.error({ err: error instanceof Error ? error.message : error, campaignId: String(campaignId), turnNumber, round, retryInMs: MADDOX_MASTER_RETRY_MS }, "[maddox] Falha no turno do mestre")
        // Encerra a geração ao vivo antes de gravar: se a gravação falhar, os clientes não ficam com uma bolha fantasma.
        live?.end({ messageId: null, error: "O Maddox teve um problema ao narrar. Uma nova tentativa acontece em instantes." })
        // As lembranças que ela considerava voltam a esperar a próxima tentativa.
        await (await import("./reminders")).releaseReminders(campaignId, jobId)
        try {
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.generating": null, "turn.failedAt": new Date() } })
        } catch (writeError) {
            // A trava velha (`MADDOX_MASTER_LOCK_STALE_MS`) ainda permite retomar quando o banco voltar.
            log.error({ err: writeError instanceof Error ? writeError.message : writeError, campaignId: String(campaignId), turnNumber }, "[maddox] Falha ao gravar a falha do turno do mestre")
        }
        return
    } finally {
        clearInterval(heartbeat)
    }
    await publishGameChanged(campaignId)
}

/** Pede a imagem e os retratos que o narrador deixou no job. Falha não derruba o turno (aviso no log). */
async function scheduleDraftImages(campaignId: Types.ObjectId, jobId: string, turnNumber: number, round: number, narrationId: Types.ObjectId): Promise<void> {
    const { sceneImage, npcPortraits } = takeDraftImages(String(campaignId), jobId)
    if (!sceneImage && !npcPortraits.length) return
    try {
        const images = await import("./scene-images")
        const env = await images.loadSceneImageEnvironment()
        if (sceneImage) {
            await images.scheduleSceneImage(
                {
                    campaignId,
                    source: "tool",
                    turnNumber,
                    segment: round,
                    messageId: narrationId,
                    situation: sceneImage.situation,
                    description: sceneImage.description,
                    caption: sceneImage.caption,
                    characters: sceneImage.characters,
                    npcs: sceneImage.npcs,
                    catalog: sceneImage.catalog,
                },
                env,
            )
        }
        await images.scheduleNpcPortraits(campaignId, npcPortraits, env)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), turnNumber }, "[maddox] falha ao pedir a imagem da cena")
    }
}

/**
 * Combate tático, depois de uma narração sem esperas (DND-25): o bloco que acabou fecha e, se ainda houver adversário na
 * fila, o turno do mestre faz a pausa de leitura (`turn.pauseUntil`) e o bloco seguinte entra na fila depois dela; senão,
 * segue para `openCombatTurn` (vez do próximo personagem ou fim do combate).
 */
async function nextCombatStep(campaign: CampaignDoc, token: string, turnNumber: number, round: number): Promise<"done" | null> {
    const tactical = await import("./tactical-combat")
    const step = await tactical.advanceBlock(campaign._id, round)
    if (step.kind !== "npc") return openCombatTurn(campaign, token, turnNumber)
    const pauseUntil = new Date(Date.now() + tactical.combatTiming.npcBlockPauseMs)
    const paused = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, "turn.generating.token": token },
        { $set: { "turn.awaitingChecks": true, "turn.checkRound": round, "turn.generating": null, "turn.failedAt": null, "turn.pauseUntil": pauseUntil } },
    )
    if (paused.modifiedCount > 0) {
        log.info({ campaignId: String(campaign._id), turnNumber, round, next: step.actorKey }, "[maddox] bloco do combate concluído; pausa antes do próximo adversário")
        tactical.scheduleTimer(`npc-block:${String(campaign._id)}`, tactical.combatTiming.npcBlockPauseMs + 50, async () => {
            const { advanceAfterChecks } = await import("./game-checks")
            await advanceAfterChecks(campaign._id, turnNumber, round)
        })
    }
    return "done"
}

/**
 * Combate tático (Maddox 7), depois da narração sem esperas: abre a vez do próximo personagem (só o membro dele é
 * elegível), põe outro turno do mestre na fila quando os adversários seguem agindo, ou encerra o combate pelo servidor
 * quando o Maddox deixou passar o fim (todos os inimigos ou todos os personagens fora de combate). `null` = sem combate
 * tático (o turno dos jogadores abre como antes).
 */
async function openCombatTurn(campaign: CampaignDoc, token: string, turnNumber: number): Promise<"done" | null> {
    const tactical = await import("./tactical-combat")
    let combat = await tactical.findActiveTactical(campaign._id)
    if (!combat || combat.tactical.phase !== "running") return null
    const enemies = tactical.livingEnemies(combat).length
    // DND-25: nenhum personagem consciente (todos com 0 PV, mesmo que alguém ainda esteja morrendo) = derrota na hora.
    const standing = tactical.consciousCharacters(combat).length > 0
    if (enemies === 0 || !standing) {
        const stale = (combat.tactical.staleEndNarrations ?? 0) + 1
        if (stale >= MADDOX_COMBAT_FORCE_END_AFTER || !standing) {
            const { applyCombatDrafts, finishCombatTurn } = await import("./combat")
            const outcome = enemies === 0 ? "vitoria" : "derrota"
            const applied = await applyCombatDrafts(campaign, turnNumber, [
                {
                    type: "end",
                    outcome,
                    summary: enemies === 0 ? "Todos os inimigos caíram." : "Nenhum personagem ficou de pé.",
                    masterNotes: "Encerrado pelo servidor: o Maddox não chamou end_combat.",
                    combatants: combat.combatants.map((item) => ({ name: item.name, outcome: item.tactical?.defeated ? ("derrotado" as const) : ("ileso" as const) })),
                    rewards: [],
                    characterStates: [],
                    finalScene: "",
                },
            ])
            for (const plan of applied.messages) await MaddoxCampaignMessageModel.create({ campaignId: campaign._id, turnNumber, phase: "master", kind: "combat", content: "", segment: 0, combat: plan })
            await finishCombatTurn(campaign, turnNumber, 0)
            log.warn({ campaignId: String(campaign._id), combatId: String(combat._id), outcome }, "[maddox] combate tático encerrado pelo servidor")
            return null
        }
        await tactical.mutateTactical(campaign._id, (live) => {
            live.tactical.staleEndNarrations = stale
        })
        combat = await tactical.findActiveTactical(campaign._id)
        if (!combat) return null
    }
    const next = await tactical.advanceToNextCharacter(campaign._id, turnNumber)
    if (next.kind === "none") return null
    if (next.kind === "monsters") {
        // O personagem da vez caiu: os adversários seguintes agem num novo turno do mestre (sem declarações).
        const nextToken = randomUUID()
        const moved = await MaddoxCampaignModel.updateOne(
            { _id: campaign._id, "turn.generating.token": token },
            { $set: { "turn.number": turnNumber + 1, "turn.phase": "master", "turn.startedAt": new Date(), "turn.eligibleMemberIds": [], "turn.declaredMemberIds": [], "turn.generating": { token: nextToken, startedAt: new Date() }, "turn.failedAt": null, "turn.awaitingChecks": false, "turn.checkRound": 0, "turn.combatActor": null } },
        )
        if (moved.modifiedCount > 0) void scheduleMasterTurn(campaign._id, nextToken, turnNumber + 1)
        return "done"
    }
    const opened = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, "turn.generating.token": token },
        {
            $set: {
                "turn.phase": "players",
                "turn.startedAt": new Date(),
                "turn.eligibleMemberIds": [next.memberId],
                "turn.declaredMemberIds": [],
                "turn.generating": null,
                "turn.failedAt": null,
                "turn.awaitingChecks": false,
                "turn.checkRound": 0,
                ...tactical.combatActorSet(combat!._id, next.actorKey, next.memberId, next.offline),
            },
        },
    )
    if (opened.modifiedCount > 0 && next.offline) tactical.scheduleAbsenceCheck(String(campaign._id))
    return "done"
}

/** Fecha a vez do personagem sem declaração (o jogador da vez saiu da campanha): o turno do mestre segue. */
export async function forceCloseCombatTurn(campaignId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active" || campaign.turn?.phase !== "players" || !campaign.turn.combatActor) return
    const token = randomUUID()
    const number = campaign.turn.number
    const closed = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, status: "active", "turn.number": number, "turn.phase": "players" },
        { $set: { "turn.number": number + 1, "turn.phase": "master" as MaddoxTurnPhase, "turn.startedAt": new Date(), "turn.eligibleMemberIds": [], "turn.declaredMemberIds": [], "turn.generating": { token, startedAt: new Date() }, "turn.failedAt": null, "turn.checkRound": 0, "turn.awaitingChecks": false, "turn.combatActor": null, "turn.opexActor": null } },
    )
    if (closed.modifiedCount === 0) return
    await publishGameChanged(campaignId)
    void scheduleMasterTurn(campaignId, token, number + 1)
}

/** Narração da rodada `round` (as gravadas antes do Maddox 5 não têm `segment` e contam como a rodada 0). */
const segmentFilter = (round: number) => (round === 0 ? { segment: { $in: [0, null] } } : { segment: round })

/**
 * Teto de duração de uma geração do mestre: passado `MADDOX_MASTER_GENERATION_TIMEOUT_MS`, aborta o provedor (sinal) e
 * rejeita mesmo que a geração não respeite o sinal — o job termina, a fila anda e o pulso da trava para.
 */
async function withGenerationTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(MADDOX_MASTER_TIMEOUT_MESSAGE))
        }, MADDOX_MASTER_GENERATION_TIMEOUT_MS)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/** Põe o turno do mestre (rodada de testes `round`) na fila da campanha (roda em segundo plano; a promessa nunca rejeita). */
export function scheduleMasterTurn(campaignId: Types.ObjectId, token: string, turnNumber: number, round = 0): Promise<void> {
    return enqueueMaddoxJob(String(campaignId), `narração do turno ${turnNumber}${round ? ` (testes ${round})` : ""}`, ({ jobId }) => runMasterTurn(campaignId, token, turnNumber, jobId), { kind: "narration", turnNumber, round })
}

/** Fase do mestre sem geração em andamento (falha ou trava velha): pega a trava e narra. */
async function resumeMasterTurn(campaign: CampaignDoc): Promise<boolean> {
    if (campaign.status !== "active" || campaign.turn?.phase !== "master") return false
    // Esperando as rolagens dos testes: nada a gerar até o último teste da rodada ser rolado. Sem teste pendente (a rolagem
    // foi gravada, mas a continuação não chegou a ser agendada: queda do banco ou do processo), retoma pela mesma troca
    // condicional da rolagem — só uma chamada vence.
    if (campaign.turn.awaitingChecks) {
        if (isCampaignBusy(String(campaign._id))) return false
        const { advanceAfterChecks } = await import("./game-checks")
        const advanced = await advanceAfterChecks(campaign._id, campaign.turn.number, campaign.turn.checkRound ?? 0)
        if (advanced) log.info({ campaignId: String(campaign._id), turnNumber: campaign.turn.number }, "[maddox] Testes da rodada já rolados: retomando a continuação")
        return advanced
    }
    // Geração na fila ou rodando neste processo: a trava é dela (o pulso a mantém), nada a retomar.
    if (isCampaignBusy(String(campaign._id))) return false
    const generating = campaign.turn.generating
    if (generating && Date.now() - new Date(generating.startedAt).getTime() < MADDOX_MASTER_LOCK_STALE_MS) return false
    const failedAt = campaign.turn.failedAt
    if (!generating && failedAt && Date.now() - new Date(failedAt).getTime() < MADDOX_MASTER_RETRY_MS) return false
    const token = randomUUID()
    const stale = new Date(Date.now() - MADDOX_MASTER_LOCK_STALE_MS)
    const retryAfter = new Date(Date.now() - MADDOX_MASTER_RETRY_MS)
    const won = await MaddoxCampaignModel.updateOne(
        {
            _id: campaign._id,
            status: "active",
            "turn.phase": "master",
            "turn.number": campaign.turn.number,
            "turn.awaitingChecks": { $ne: true },
            $or: [{ "turn.generating": null, $or: [{ "turn.failedAt": null }, { "turn.failedAt": { $lt: retryAfter } }] }, { "turn.generating.startedAt": { $lt: stale } }],
        },
        { $set: { "turn.generating": { token, startedAt: new Date() } } },
    )
    if (won.modifiedCount === 0) return false
    log.info({ campaignId: String(campaign._id), turnNumber: campaign.turn.number }, "[maddox] Retomando o turno do mestre")
    void scheduleMasterTurn(campaign._id, token, campaign.turn.number, campaign.turn.checkRound ?? 0)
    return true
}

// ── Turno dos jogadores ────────────────────────────────────────────────────────

/** Turno sem nenhum elegível (todos saíram): quem estiver pronto entra no turno atual — não há ninguém esperando. */
async function fillEmptyTurn(campaign: CampaignDoc): Promise<CampaignDoc> {
    if (campaign.status !== "active" || campaign.turn?.phase !== "players" || (campaign.turn.eligibleMemberIds ?? []).length > 0 || campaign.turn.combatActor) return campaign
    const ready = await readyMemberIds(campaign._id)
    if (ready.length === 0) return campaign
    await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, "turn.number": campaign.turn.number, "turn.phase": "players", "turn.eligibleMemberIds": { $size: 0 } },
        { $set: { "turn.eligibleMemberIds": ready } },
    )
    return reloadCampaign(campaign._id)
}

/**
 * Fecha o turno dos jogadores se todos os elegíveis presentes já declararam (ao menos uma declaração).
 * A transição é condicional: só uma chamada vence e roda o turno do mestre.
 */
export async function evaluateTurn(campaignId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active") return
    if (campaign.turn?.phase === "master") {
        await resumeMasterTurn(campaign)
        return
    }
    const declared = idSet(campaign.turn?.declaredMemberIds)
    const eligibleIds = (campaign.turn?.eligibleMemberIds ?? []).map(String)
    if (eligibleIds.length === 0 || declared.size === 0) return

    const eligibleMembers = await MaddoxCampaignMemberModel.find({ _id: { $in: eligibleIds }, campaignId, status: "joined" }).select("userId kind opex.addedAt createdAt").lean<Pick<MemberDoc, "_id" | "userId" | "kind" | "opex" | "createdAt">[]>()
    // Personagens Opex (DND-26) ficam fora da regra dos humanos: agem depois, um de cada vez.
    const humans = eligibleMembers.filter((member) => member.kind !== "opex")
    const online = await onlineUserIds(String(campaignId))
    const required = online ? humans.filter((member) => online.has(member.userId)) : humans
    const pending = required.filter((member) => !declared.has(String(member._id)))
    if (pending.length > 0) return
    if (campaign.turn.opexActor) return
    const opex = eligibleMembers.filter((member) => member.kind === "opex" && !declared.has(String(member._id)))
    if (opex.length > 0) {
        // Mesa sem nenhuma ação humana (todos offline) não avança sozinha, nem com Opex.
        if (!humans.some((member) => declared.has(String(member._id)))) return
        const next = [...opex].sort((a, b) => new Date(a.opex?.addedAt ?? a.createdAt).getTime() - new Date(b.opex?.addedAt ?? b.createdAt).getTime())[0]!
        const started = await MaddoxCampaignModel.updateOne(
            { _id: campaignId, status: "active", "turn.number": campaign.turn.number, "turn.phase": "players", $or: [{ "turn.opexActor": null }, { "turn.opexActor": { $exists: false } }] },
            { $set: { "turn.opexActor": { memberId: next._id, startedAt: new Date(), questions: 0, failedAt: null, error: null } } },
        )
        if (started.modifiedCount === 0) return
        log.info({ campaignId: String(campaignId), turnNumber: campaign.turn.number, memberId: String(next._id) }, "[maddox] Vez do Personagem Opex")
        await publishGameChanged(campaignId)
        return
    }

    const token = randomUUID()
    const number = campaign.turn.number
    const closed = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, status: "active", "turn.number": number, "turn.phase": "players" },
        { $set: { "turn.number": number + 1, "turn.phase": "master" as MaddoxTurnPhase, "turn.startedAt": new Date(), "turn.eligibleMemberIds": [], "turn.declaredMemberIds": [], "turn.generating": { token, startedAt: new Date() }, "turn.failedAt": null, "turn.checkRound": 0, "turn.awaitingChecks": false, "turn.combatActor": null, "turn.opexActor": null } },
    )
    if (closed.modifiedCount === 0) return
    log.info({ campaignId: String(campaignId), turnNumber: number, required: required.length, presence: online ? "pusher" : "unknown" }, "[maddox] Turno dos jogadores fechado")
    await publishGameChanged(campaignId)
    void scheduleMasterTurn(campaignId, token, number + 1)
}

/** 409 `ALREADY_DECLARED` se o membro já declarou ou passou neste turno (lista do turno ou mensagem gravada). */
async function assertNotDeclared(campaign: CampaignDoc, target: MemberDoc): Promise<void> {
    const turnNumber = campaign.turn.number
    const declared = idSet(campaign.turn.declaredMemberIds).has(String(target._id)) || Boolean(await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber, memberId: target._id, turnAction: true }))
    if (declared) throw new DomainError(409, "Este jogador já declarou neste turno.", "ALREADY_DECLARED")
}

/** Grava a declaração/"não fazer nada" de um membro e a conta no turno (409 se o turno fechou no meio). */
export async function recordTurnAction(campaign: CampaignDoc, target: MemberDoc, character: CharacterDoc | null, kind: "declaration" | "pass", content: string, skippedBy: string | null, extra: { offlineSkip?: boolean; combatTurn?: boolean } = {}) {
    const turnNumber = campaign.turn.number
    if (idSet(campaign.turn.declaredMemberIds).has(String(target._id))) throw new DomainError(409, "Este jogador já declarou neste turno.", "ALREADY_DECLARED")
    let message
    try {
        message = await MaddoxCampaignMessageModel.create({
            campaignId: campaign._id,
            turnNumber,
            phase: "players",
            kind,
            memberId: target._id,
            userId: target.userId,
            characterId: character?._id ?? null,
            characterName: character?.name ?? null,
            content,
            skippedBy,
            turnAction: true,
            ...(extra.offlineSkip ? { offlineSkip: true } : {}),
            ...(extra.combatTurn ? { combatTurn: true } : {}),
        })
    } catch (error) {
        if (isDuplicateKey(error)) throw new DomainError(409, "Este jogador já declarou neste turno.", "ALREADY_DECLARED")
        throw error
    }
    const counted = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "active", "turn.number": turnNumber, "turn.phase": "players", "turn.eligibleMemberIds": target._id },
        { $addToSet: { "turn.declaredMemberIds": target._id } },
    )
    if (counted.matchedCount === 0) {
        await MaddoxCampaignMessageModel.deleteOne({ _id: message._id })
        throw new DomainError(409, "O turno dos jogadores já foi encerrado.", "TURN_CLOSED")
    }
}

export const characterOf = async (member: MemberDoc) => (member.characterId ? MaddoxCharacterModel.findById(member.characterId).lean<CharacterDoc>() : null)

// ── API do serviço ─────────────────────────────────────────────────────────────

/** Dono inicia a campanha: exige o cenário concluído e a própria entrevista de personagem. */
export async function startCampaign(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode iniciá-la.", "FORBIDDEN")
    if (campaign.status === "lobby" || campaign.status === "interview") {
        if (campaign.scenarioInterview?.status !== "done" || campaign.status === "interview") throw new DomainError(409, "Conclua a entrevista de cenário com o Maddox antes de iniciar a campanha.", "SCENARIO_PENDING")
    } else {
        throw new DomainError(409, "Esta campanha já foi iniciada.", "CAMPAIGN_ALREADY_STARTED")
    }
    await assertMemberCanPlay(campaignId, userId)

    const token = randomUUID()
    const now = new Date()
    const started = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "lobby", "scenarioInterview.status": "done" },
        { $set: { status: "active", startedAt: now, turn: { number: 1, phase: "master", startedAt: now, eligibleMemberIds: [], declaredMemberIds: [], generating: { token, startedAt: now }, failedAt: null, checkRound: 0, awaitingChecks: false } } },
    )
    if (started.modifiedCount === 0) throw new DomainError(409, "Esta campanha já foi iniciada.", "CAMPAIGN_ALREADY_STARTED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, antes: { status: campaign.status }, depois: { status: "active", turn: 1 } })
    await publishGameChanged(campaign._id)
    void scheduleMasterTurn(campaign._id, token, 1)
    return getGameState(campaignId, userId)
}

/** Declaração, "Não fazer nada" ou pergunta ao mestre (esta não encerra o turno). */
export async function submitGameAction(campaignId: string, input: MaddoxGameActionInput, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    assertActive(loaded.campaign)
    await assertMemberCanPlay(campaignId, userId)
    assertPlayersTurn(loaded.campaign)
    const campaign = await fillEmptyTurn(loaded.campaign)
    const member = loaded.member
    // Combate tático (Maddox 7): a vez é de um personagem só; perguntas ao mestre continuam livres para quem está pronto.
    const inCombatTurn = Boolean(campaign.turn.combatActor)
    if (inCombatTurn && input.kind !== "question") {
        if (String(campaign.turn.combatActor!.memberId) !== String(member._id)) throw new DomainError(409, "Não é a vez do seu personagem no combate.", "NOT_YOUR_COMBAT_TURN")
        if (input.kind === "declaration") throw new DomainError(409, "No combate, use os botões de Ação e Ação bônus (ou \"Outra ação\" para texto livre).", "COMBAT_USE_ACTIONS")
        const { endCombatTurn } = await import("./tactical-actions")
        return endCombatTurn(campaignId, {}, userId)
    }
    if (!inCombatTurn && !idSet(campaign.turn.eligibleMemberIds).has(String(member._id))) throw new DomainError(409, "Você entra no jogo a partir do próximo turno.", "NEXT_TURN")
    // Personagens Opex agindo (DND-26): os humanos já fecharam a vez deles; só perguntas continuam livres.
    if (!inCombatTurn && input.kind !== "question" && campaign.turn.opexActor && String(campaign.turn.opexActor.memberId) !== String(member._id)) {
        throw new DomainError(409, "Os Personagens Opex estão agindo. Aguarde a narração do Maddox.", "OPEX_TURN")
    }
    const character = await characterOf(member)

    if (input.kind === "question") {
        const turnNumber = campaign.turn.number
        const question = await MaddoxCampaignMessageModel.create({
            campaignId: campaign._id,
            turnNumber,
            phase: "players",
            kind: "question",
            memberId: member._id,
            userId,
            characterId: character?._id ?? null,
            characterName: character?.name ?? null,
            content: input.content,
        })
        await publishGameChanged(campaign._id)
        void scheduleAnswer(campaign._id, turnNumber, question._id, character?.name ?? "Personagem", input.content)
        return getGameState(campaignId, userId)
    }

    if (input.kind === "declaration" && MADDOX_DECLARATION_VALIDATION_RIGORS.includes(campaign.rigor)) {
        // Já declarou (ou clique duplo): responde ALREADY_DECLARED sem pagar uma validação por IA que seria descartada.
        await assertNotDeclared(campaign, member)
        const { validateDeclaration } = await import("./action-validation")
        const verdict = await validateDeclaration({ campaign, character, content: input.content })
        if (!verdict.valid) throw new DomainError(409, verdict.reason, "ACTION_INVALID")
    }

    await recordTurnAction(campaign, member, character, input.kind, input.kind === "declaration" ? input.content : "", null)
    await publishGameChanged(campaign._id)
    await evaluateTurn(campaign._id)
    return getGameState(campaignId, userId)
}

/**
 * Gera e grava a resposta do mestre a uma pergunta, transmitindo a todos; falha grava a resposta com `error`. Roda DENTRO
 * de um job da fila da campanha (a resposta de uma pergunta do Personagem Opex, DND-26, roda no job do próprio Opex).
 */
export async function answerQuestion(campaignId: Types.ObjectId, jobId: string, turnNumber: number, questionId: Types.ObjectId, characterName: string, question: string): Promise<{ content: string; error: string | null }> {
    const live = beginLive(String(campaignId), { kind: "answer", turnNumber, replyToId: String(questionId) })
    let content = ""
    let error: string | null = null
    try {
        const master = await getMaddoxMaster()
        content = await withGenerationTimeout((signal) => master.answer({ campaignId: String(campaignId), jobId, turnNumber, questionId: String(questionId), characterName, question, signal }, live))
    } catch (failure) {
        log.warn({ err: failure instanceof Error ? failure.message : String(failure), campaignId: String(campaignId), turnNumber }, "[maddox] Falha ao responder a pergunta")
        error = MADDOX_ANSWER_FAILED_MESSAGE
    }
    let stored = content
    try {
        const message = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "players", kind: "answer", content: error ? "" : content, error, replyToId: questionId })
        stored = message.content
        live.end({ messageId: String(message._id), error })
    } catch (failure) {
        live.end({ messageId: null, error: MADDOX_ANSWER_FAILED_MESSAGE })
        throw failure
    }
    await publishGameChanged(campaignId)
    return { content: error ? "" : stored, error }
}

/** Responde a pergunta na fila da campanha, transmitindo a todos; falha grava a resposta com `error`. */
function scheduleAnswer(campaignId: Types.ObjectId, turnNumber: number, questionId: Types.ObjectId, characterName: string, question: string): Promise<void> {
    return enqueueMaddoxJob(
        String(campaignId),
        `resposta do turno ${turnNumber}`,
        async ({ jobId }) => {
            await answerQuestion(campaignId, jobId, turnNumber, questionId, characterName, question)
        },
        { kind: "answer", turnNumber, round: 0 },
    )
}

/** Membro da campanha (404 para quem não participa): acesso ao stream da mesa. */
export async function assertGameMember(campaignId: string, userId: string): Promise<void> {
    await loadAsMember(campaignId, userId)
}

/** Dono registra "não fez nada" no lugar de um jogador ausente (só neste turno). */
export async function skipPlayer(campaignId: string, input: MaddoxSkipPlayerInput, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    if (loaded.campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode pular a vez de um jogador.", "FORBIDDEN")
    assertActive(loaded.campaign)
    await assertMemberCanPlay(campaignId, userId)
    assertPlayersTurn(loaded.campaign)
    const campaign = await fillEmptyTurn(loaded.campaign)
    if (!Types.ObjectId.isValid(input.memberId)) throw new DomainError(404, "Jogador não encontrado", "NOT_FOUND")
    const target = await MaddoxCampaignMemberModel.findOne({ _id: new Types.ObjectId(input.memberId), campaignId: campaign._id, status: "joined" }).lean<MemberDoc>()
    if (!target) throw new DomainError(404, "Jogador não encontrado", "NOT_FOUND")
    if (!idSet(campaign.turn.eligibleMemberIds).has(String(target._id))) throw new DomainError(409, "Este jogador entra no jogo a partir do próximo turno.", "NEXT_TURN")
    if (campaign.turn.combatActor) {
        // Combate tático: pula a vez do personagem ativo (ações e rolagens pendentes são canceladas).
        const { skipCombatTurn } = await import("./tactical-actions")
        await skipCombatTurn(campaign, target, userId, false)
        await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: campaign.turn.number, skipped: target.userId, combat: true } })
        return getGameState(campaignId, userId)
    }
    const character = await characterOf(target)
    await recordTurnAction(campaign, target, character, "pass", "", userId)
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: campaign.turn.number, skipped: target.userId } })
    await publishGameChanged(campaign._id)
    await evaluateTurn(campaign._id)
    return getGameState(campaignId, userId)
}

/**
 * Reavalia o turno (um jogador saiu da mesa, trava do mestre presa). Qualquer membro chama — inclusive quem
 * ainda não pode jogar e só assiste — porque não grava nada em nome de ninguém: o servidor consulta a
 * presença por conta própria e só aplica as regras do turno.
 */
export async function checkTurn(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.status === "active") {
        await fillEmptyTurn(campaign)
        if (campaign.turn?.combatActor) {
            const { evaluateCombatAbsence } = await import("./tactical-actions")
            await evaluateCombatAbsence(campaign._id)
        }
        await evaluateTurn(campaign._id)
    }
    return getGameState(campaignId, userId)
}

/** Membro saiu ou foi removido: deixa de contar no turno atual, que pode fechar. */
export async function onMemberLeftGame(campaignId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    // Testes pendentes dele são cancelados (Maddox 5): a rodada pode terminar e o Maddox continuar sem eles.
    const { cancelMemberChecks } = await import("./game-checks")
    await cancelMemberChecks(campaignId, memberId)
    // Combate tático (Maddox 7): o personagem sai da ordem; se era a vez dele, ela fecha e o turno do mestre segue.
    const { onMemberLeftCombat } = await import("./tactical-actions")
    await onMemberLeftCombat(campaignId, memberId)
    const before = await MaddoxCampaignModel.findById(campaignId).select("turn").lean<Pick<CampaignDoc, "turn">>()
    if (before?.turn?.combatActor && String(before.turn.combatActor.memberId) === String(memberId)) {
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $pull: { "turn.eligibleMemberIds": memberId } })
        await forceCloseCombatTurn(campaignId)
        return
    }
    // Personagem Opex removido na vez dele (DND-26): a vez é liberada e o turno segue para o próximo.
    await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.opexActor.memberId": memberId }, { $set: { "turn.opexActor": null } })
    const pulled = await MaddoxCampaignModel.updateOne({ _id: campaignId, status: "active" }, { $pull: { "turn.eligibleMemberIds": memberId } })
    if (pulled.modifiedCount === 0) return
    await publishGameChanged(campaignId)
    await evaluateTurn(campaignId)
}

// ── Leitura ────────────────────────────────────────────────────────────────────

/** Quem lê as mensagens: o teste pendente só chega ao jogador indicado; a declaração dos outros pode chegar oculta (DND-36). */
interface MessagesViewer extends PlayerActionsViewer {
    memberId: string | null
    showCheckDc: boolean
}

const viewerOf = (campaign: CampaignDoc, member: MemberDoc): MessagesViewer => ({ memberId: String(member._id), showCheckDc: Boolean(campaign.showCheckDc), hidePlayerActions: Boolean(campaign.hidePlayerActions) })

/** Sugestões de ação da narração só para o personagem de quem vê (DND-30): as dos outros nunca saem do servidor. */
const actionOptionsFor = (message: MessageDoc, viewer: MessagesViewer): string[] | null => {
    if (!viewer.memberId || !message.actionOptions?.length) return null
    const mine = message.actionOptions.find((entry) => String(entry.memberId) === viewer.memberId)
    return mine?.options.length ? [...mine.options] : null
}

const visibleTo = (viewer: MessagesViewer) => (message: MessageDoc) =>
    !(message.kind === "check" && message.check?.status === "pending" && String(message.memberId) !== viewer.memberId) &&
    !(message.kind === "combat-roll" && message.combatRoll?.status === "pending" && message.combatRoll.kind !== "enemy-initiative" && String(message.memberId) !== viewer.memberId)

async function messagesDto(all: MessageDoc[], viewer: MessagesViewer): Promise<MaddoxGameMessageDto[]> {
    const messages = all.filter(visibleTo(viewer))
    const characterIds = [...new Set(messages.map((message) => message.characterId).filter((id): id is Types.ObjectId => Boolean(id)).map(String))]
    const skippers = [
        ...new Set(
            messages
                .flatMap((message) => [
                    message.skippedBy,
                    message.check?.rolledBy && message.check.rolledBy !== message.userId ? message.check.rolledBy : null,
                    message.combatRoll?.rolledBy && message.combatRoll.rolledBy !== message.userId ? message.combatRoll.rolledBy : null,
                ])
                .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id!)),
        ),
    ]
    const combatIds = messages.map((message) => message.combat?.combatId).filter((id): id is Types.ObjectId => Boolean(id))
    const [characters, users, combats] = await Promise.all([
        characterIds.length ? MaddoxCharacterModel.find({ _id: { $in: characterIds } }).select("name portraitUrl userId").lean<Pick<CharacterDoc, "_id" | "name" | "portraitUrl" | "userId">[]>() : Promise.resolve([]),
        skippers.length ? User.find({ _id: { $in: skippers } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : Promise.resolve([]),
        combatIds.length ? import("./combat").then(({ loadCombats }) => loadCombats(combatIds)) : Promise.resolve(null),
    ])
    const { combatEventDto } = combats ? await import("./combat") : { combatEventDto: null }
    const tacticalDto = messages.some((message) => message.combatAction || message.combatRoll || message.combatReaction) ? await import("./tactical-dto") : null
    const characterById = new Map(characters.map((character) => [String(character._id), character]))
    const userById = new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username || "Dono"]))
    return messages.map((message) => {
        const character = message.characterId ? characterById.get(String(message.characterId)) : undefined
        const hiddenAction = isHiddenPlayerAction(message, viewer)
        return {
            id: String(message._id),
            turnNumber: message.turnNumber,
            phase: message.phase,
            kind: message.kind,
            memberId: message.memberId ? String(message.memberId) : null,
            characterName: character?.name ?? message.characterName ?? null,
            portraitUrl: character?.portraitUrl ?? null,
            content: hiddenAction ? "" : message.content,
            ...(hiddenAction ? { hiddenAction: true } : {}),
            ...(isOpexUserId(message.userId) || isOpexUserId(character?.userId) ? { opex: true } : {}),
            replyToId: message.replyToId ? String(message.replyToId) : null,
            skippedByName: message.skippedBy ? (userById.get(message.skippedBy) ?? "Dono") : message.offlineSkip ? "ausência (offline)" : null,
            error: message.error ?? null,
            check: message.check ? checkDto(message, viewer, userById) : null,
            combat: (() => {
                const found = message.combat && combats ? combats.get(String(message.combat.combatId)) : undefined
                return found && combatEventDto ? combatEventDto(found, message.combat!.event) : null
            })(),
            combatAction: message.combatAction && tacticalDto ? tacticalDto.combatActionDto(message.combatAction) : null,
            combatRoll:
                message.combatRoll && tacticalDto
                    ? tacticalDto.combatRollDto(message.combatRoll, message.combatRoll.rolledBy && message.combatRoll.rolledBy !== message.userId ? (message.combatRoll.rolledBy === "server" ? "o servidor" : (userById.get(message.combatRoll.rolledBy) ?? "Dono")) : null)
                    : null,
            combatReaction: message.combatReaction && tacticalDto ? tacticalDto.combatReactionDto(message.combatReaction, String(message.memberId) === viewer.memberId) : null,
            offlineSkip: Boolean(message.offlineSkip),
            ...(message.kind === "reminder" ? { reminder: { status: message.reminder?.status ?? "pending" } } : {}),
            ...(message.kind === "narration" ? { actionOptions: actionOptionsFor(message, viewer) } : {}),
            createdAt: new Date(message.createdAt).toISOString(),
        }
    })
}

function checkDto(message: MessageDoc, viewer: MessagesViewer, userById: Map<string, string>): MaddoxGameCheckDto {
    const check = message.check!
    const byOwner = Boolean(check.rolledBy && check.rolledBy !== message.userId)
    return {
        status: check.status,
        round: check.round,
        kind: check.kind,
        ability: check.ability,
        skill: check.skill ?? null,
        mode: check.mode,
        reason: check.reason,
        dc: viewer.showCheckDc ? check.dc : null,
        sheetId: check.sheetId ? String(check.sheetId) : null,
        roll: check.roll ?? null,
        modifierParts: check.modifierParts ?? [],
        rolledByName: byOwner ? (userById.get(check.rolledBy!) ?? "Dono") : null,
        success: viewer.showCheckDc && check.roll ? checkSucceeded(check.roll.total, check.dc, keptD20(check.roll)) : null,
        cancelReason: check.cancelReason ?? null,
    }
}

async function messagesPage(campaignId: Types.ObjectId, before: Types.ObjectId | null, viewer: MessagesViewer): Promise<MaddoxGameMessagesPageDto> {
    const docs = await MaddoxCampaignMessageModel.find({ campaignId, ...(before ? { _id: { $lt: before } } : {}) })
        .sort({ _id: -1 })
        .limit(MADDOX_GAME_PAGE_SIZE + 1)
        .lean<MessageDoc[]>()
    const hasMore = docs.length > MADDOX_GAME_PAGE_SIZE
    const page = docs.slice(0, MADDOX_GAME_PAGE_SIZE).reverse()
    const [messages, images] = await Promise.all([messagesDto(page, viewer), sceneImagesOf(page)])
    return { messages: images.size ? messages.map((message) => (images.has(message.id) ? { ...message, sceneImages: images.get(message.id)! } : message)) : messages, hasMore }
}

/** Imagens das cenas (Maddox 10) das narrações e cards de fim de combate da página. Falha = sem imagens (aviso no log). */
async function sceneImagesOf(page: readonly MessageDoc[]) {
    const ids = page.filter((message) => message.kind === "narration" || (message.kind === "combat" && message.combat?.event === "end")).map((message) => message._id)
    try {
        const { sceneImagesByMessage } = await import("./scene-images")
        return await sceneImagesByMessage(ids)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] imagens das cenas indisponíveis")
        return new Map<string, import("../game-types").MaddoxGameSceneImageDto[]>()
    }
}

async function maddoxAvatarUrl(): Promise<string | null> {
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        return settings.avatar?.url ?? null
    } catch (error) {
        log.warn({ err: error }, "[maddox] Falha ao carregar o avatar do Maddox")
        return null
    }
}

/** Estado da mesa (o mesmo para todos os membros; `me` é o do usuário). Retoma turno do mestre interrompido. */
export async function getGameState(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    let campaign = loaded.campaign
    if (campaign.status === "active") {
        if (await resumeMasterTurn(campaign)) campaign = await reloadCampaign(campaign._id)
        campaign = await fillEmptyTurn(campaign)
        // Personagem Opex na vez (DND-26): depois de um reinício, a leitura da mesa retoma a execução (idempotente).
        if (campaign.turn?.phase === "players" && (campaign.turn.opexActor || campaign.turn.combatActor)) void import("./opex-table").then(({ driveOpex }) => driveOpex(campaign._id)).catch(() => undefined)
    }
    const viewer = viewerOf(campaign, loaded.member)
    // Imagens nas cenas (Maddox 10): as presas (processo reiniciado) viram falha antes da leitura.
    const sceneImages = await import("./scene-images")
    await sceneImages.expireStaleSceneImages(campaign._id).catch((error) => log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao expirar imagens presas"))
    const [members, page, avatarUrl, npcs, pendingChecks, activeCombat, sceneImageControl, portraitsGenerating] = await Promise.all([
        joinedMembers(campaign._id),
        messagesPage(campaign._id, null, viewer),
        maddoxAvatarUrl(),
        MaddoxNpcModel.find({ campaignId: campaign._id, visibility: "players" }).sort({ name: 1 }).select("name portraitUrl status").lean<{ _id: Types.ObjectId; name: string; portraitUrl: string | null; status?: IMaddoxNpc["status"] }[]>(),
        campaign.status === "active" && campaign.turn?.phase === "master" && campaign.turn.awaitingChecks
            ? MaddoxCampaignMessageModel.find({ campaignId: campaign._id, turnNumber: campaign.turn.number, kind: "check", "check.round": campaign.turn.checkRound ?? 0, "check.status": "pending" })
                  .sort({ _id: 1 })
                  .select("memberId characterName")
                  .lean<{ _id: Types.ObjectId; memberId: Types.ObjectId; characterName: string | null }[]>()
            : Promise.resolve([]),
        MaddoxCombatModel.findOne({ campaignId: campaign._id, status: "active" }).lean<IMaddoxCombat>(),
        sceneImages.sceneImageControl(campaign, userId),
        sceneImages.generatingPortraitNpcIds(campaign._id).catch(() => new Set<string>()),
    ])
    // Combate tático (Maddox 7): ordem com os PV do grupo, a minha vez e o que o turno do mestre espera.
    const tacticalCombat = activeCombat && activeCombat.mode === "tactical" && activeCombat.tactical ? (activeCombat as import("./tactical-combat").TacticalCombat) : null
    const tacticalModule = tacticalCombat ? await import("./tactical-dto") : null
    const combatActor = campaign.status === "active" && campaign.turn?.phase === "players" ? (campaign.turn.combatActor ?? null) : null
    const pendingCombat =
        tacticalCombat && campaign.turn?.phase === "master"
            ? await MaddoxCampaignMessageModel.find({ campaignId: campaign._id, turnNumber: campaign.turn.number, $or: [{ kind: "combat-roll", "combatRoll.status": "pending", "combatRoll.kind": { $ne: "enemy-initiative" } }, { kind: "combat-reaction", "combatReaction.status": "pending" }] })
                  .sort({ _id: 1 })
                  .select("kind memberId characterName combatRoll.reason combatReaction.description")
                  .lean<{ _id: Types.ObjectId; kind: string; memberId: Types.ObjectId; characterName: string | null; combatRoll?: { reason: string }; combatReaction?: { description: string } }[]>()
            : []
    const userIds = members.map(({ member }) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const found = userIds.length ? await User.find({ _id: { $in: userIds } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : []
    const users = new Map(found.map((user) => [String(user._id), user.name?.trim() || user.username || "Usuário"]))
    const eligible = idSet(campaign.turn?.eligibleMemberIds)
    const declared = idSet(campaign.turn?.declaredMemberIds)
    const playersTurn = campaign.status === "active" && campaign.turn?.phase === "players"
    const participants: MaddoxGameParticipantDto[] = members
        .map(({ member, character }) => ({
            memberId: String(member._id),
            userId: member.userId,
            name: isOpexMember(member) ? MADDOX_OPEX_LABEL : (users.get(member.userId) ?? "Usuário"),
            ...(isOpexMember(member) ? { opex: true } : {}),
            characterName: character?.name ?? null,
            portraitUrl: character?.portraitUrl ?? null,
            role: member.role,
            ready: isMemberReadyToPlay(character),
            eligible: playersTurn && eligible.has(String(member._id)),
            declared: playersTurn && declared.has(String(member._id)),
        }))
        .sort((a, b) => (a.role === "owner" ? 0 : a.opex ? 2 : 1) - (b.role === "owner" ? 0 : b.opex ? 2 : 1))
    const mine = participants.find((participant) => participant.memberId === String(loaded.member._id))
    const opexActor = opexActorDto(campaign, members, combatActor, loaded.member.role === "owner")
    return {
        campaignId: String(campaign._id),
        name: campaign.name,
        rigor: campaign.rigor,
        status: campaign.status,
        ownerId: campaign.ownerId,
        maddoxAvatarUrl: avatarUrl,
        turn: {
            number: campaign.turn?.number ?? 0,
            phase: campaign.turn?.phase ?? "master",
            startedAt: campaign.turn?.startedAt ? new Date(campaign.turn.startedAt).toISOString() : null,
            generating: Boolean(campaign.turn?.generating),
            failed: campaign.turn?.phase === "master" && !campaign.turn?.generating && !campaign.turn?.awaitingChecks && Boolean(campaign.turn?.failedAt),
            awaitingChecks: campaign.turn?.phase === "master" && Boolean(campaign.turn?.awaitingChecks),
            pendingChecks: pendingChecks.map((check) => ({ checkId: String(check._id), memberId: String(check.memberId), characterName: check.characterName ?? "Personagem" })),
            combatActor:
                combatActor && tacticalCombat
                    ? { actorKey: combatActor.actorKey, memberId: String(combatActor.memberId), characterName: tacticalCombat.tactical.characters.find((item) => item.actorKey === combatActor.actorKey)?.name ?? "Personagem" }
                    : null,
            pendingCombat: pendingCombat.map((item) => ({
                id: String(item._id),
                kind: item.kind === "combat-reaction" ? ("reaction" as const) : ("roll" as const),
                memberId: String(item.memberId),
                characterName: item.characterName ?? "Personagem",
                label: item.combatRoll?.reason ?? item.combatReaction?.description ?? "",
            })),
            opexActor,
        },
        showCheckDc: Boolean(campaign.showCheckDc),
        npcs: npcs.map((npc) => ({ id: String(npc._id), name: npc.name, portraitUrl: npc.portraitUrl ?? null, status: npc.status ?? "active", portraitGenerating: portraitsGenerating.has(String(npc._id)) })),
        sceneImages: sceneImageControl,
        combat: activeCombat ? { ...(await import("./combat")).combatDto(activeCombat), ...(tacticalCombat && tacticalModule ? { tactical: await tacticalModule.loadTacticalDto(tacticalCombat) } : {}) } : null,
        participants,
        me: {
            memberId: String(loaded.member._id),
            isOwner: campaign.ownerId === userId,
            ready: mine?.ready ?? false,
            eligible: mine?.eligible ?? false,
            declared: mine?.declared ?? false,
            sheet: await mySheet(members.find(({ member }) => String(member._id) === String(loaded.member._id))?.character ?? null),
            combat: tacticalCombat && tacticalModule ? await tacticalModule.myCombatDto(tacticalCombat, String(loaded.member._id), Boolean(combatActor && String(combatActor.memberId) === String(loaded.member._id)), campaign._id) : null,
        },
        messages: page.messages,
        hasMore: page.hasMore,
    }
}

/** Quem do Personagem Opex está agindo (ou parado com falha) neste turno dos jogadores (DND-26). */
/** O motivo bruto da falha (texto do provedor) só vai ao dono; os demais recebem a mensagem genérica. */
function opexActorDto(campaign: CampaignDoc, members: { member: MemberDoc; character: CharacterDoc | null }[], combatActor: CampaignDoc["turn"]["combatActor"] | null, viewerIsOwner: boolean): NonNullable<MaddoxGameStateDto["turn"]["opexActor"]> | null {
    if (campaign.status !== "active" || campaign.turn?.phase !== "players") return null
    if (combatActor) {
        const found = members.find(({ member }) => String(member._id) === String(combatActor.memberId))
        if (!found || !isOpexMember(found.member)) return null
        const run = found.member.opex?.run
        const failed = run?.stage === "table" && run.status === "failed"
        return { memberId: String(found.member._id), characterName: found.character?.name || MADDOX_OPEX_LABEL, failed, error: failed ? ((viewerIsOwner ? run?.error : null) ?? MADDOX_OPEX_FAILED_MESSAGE) : null, combat: true }
    }
    const actor = campaign.turn.opexActor
    if (!actor) return null
    const found = members.find(({ member }) => String(member._id) === String(actor.memberId))
    return { memberId: String(actor.memberId), characterName: found?.character?.name || MADDOX_OPEX_LABEL, failed: Boolean(actor.failedAt), error: actor.failedAt ? ((viewerIsOwner ? actor.error : null) ?? MADDOX_OPEX_FAILED_MESSAGE) : null, combat: false }
}

/** Mensagens anteriores a `before` (paginação "Carregar anteriores"). */
export async function listGameMessages(campaignId: string, before: string | null, userId: string): Promise<MaddoxGameMessagesPageDto> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    if (before !== null && !Types.ObjectId.isValid(before)) throw new DomainError(400, "Cursor inválido", "INVALID_CURSOR")
    await dbConnect()
    return messagesPage(campaign._id, before ? new Types.ObjectId(before) : null, viewerOf(campaign, member))
}

/** Ficha D&D do MEU personagem (só a minha chega à tela). */
async function mySheet(character: CharacterDoc | null): Promise<{ id: string; slug: string } | null> {
    if (!character?.sheetId) return null
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(character.sheetId).select("slug").lean<{ _id: Types.ObjectId; slug: string }>()
    return sheet ? { id: String(sheet._id), slug: sheet.slug } : null
}
