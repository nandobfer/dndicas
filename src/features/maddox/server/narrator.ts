import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { stepCostUsd } from "@/lib/ai/step-cost"
import { User } from "@/features/users/models/user"
import {
    MADDOX_MASTER_TIMEOUT_MESSAGE,
    MADDOX_MCP_SERVER_NAME,
    MADDOX_NARRATION_CONSUMPTION_ORIGIN,
    MADDOX_NARRATOR_HISTORY_CHARS,
    MADDOX_NARRATOR_INDEX_ITEMS,
    MADDOX_NARRATOR_MAX_STEPS,
    MADDOX_COMBAT_OUTCOME_LABELS,
    MADDOX_COMBAT_DIFFICULTY_DEFAULT,
    MADDOX_DEFAULT_DENSITY,
    type MaddoxRigorLevel,
} from "../constants"
import { createMarkupFilter } from "../catalog-markup"
import { dropRewrittenParagraphs, splitOpenParagraph } from "../narration-dedupe"
import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxNpcModel,
    type IMaddoxCampaign,
    type IMaddoxCombat,
    type IMaddoxCampaignMessage,
    type IMaddoxCharacter,
    type IMaddoxNpc,
} from "../models"
import type { MaddoxSettings } from "../schemas"
import { resolveNarratorModel, type MaddoxResolvedModel } from "../model-resolution"
import type { MaddoxAnswerContext, MaddoxMaster, MaddoxMasterSink, MaddoxNarrationContext } from "./game-master"
import { checkTitle, sheetSummary, type MaddoxCheckSheet } from "../check-modifier"
import { worldCatalogOf } from "../world-catalog"
import { buildNarratorInstructions, checkResultLine, narratorTaskText, narratorTranscript, usesChecks, usesCombat, usesTacticalCombat, type NarratorCheckResult, type NarratorDeclaration, type NarratorPromptContext, type NarratorTacticalTask, type NarratorTask } from "./narrator-prompt"
import { isOpexUserId } from "./opex-members"
import { MADDOX_OPEX_LABEL, MADDOX_SHEET_RIGORS, maddoxOpexNpcFallbackNote } from "../constants"

/**
 * Maddox narrador (Maddox 4) — SOMENTE servidor. Monta as instruções com o estado gravado da campanha, gera em
 * streaming e grava o estado pelas ferramentas:
 *
 * - provedores diretos (Gemini, Anthropic, OpenAI, DeepSeek): `streamText` com as ferramentas da AI SDK;
 * - OpenCode: `streamAi` na sessão `narrator` da campanha, com as ferramentas pelo MCP do Maddox e o token de turno.
 *
 * A camada de IA e a SDK `ai` entram sob demanda.
 */

const log = loggerFor({ module: "maddox", feature: "narrator" })

export type NarratorModel = MaddoxResolvedModel

/**
 * Modelo do narrador (o "Maddox" da aba) para o rigor da campanha: o bloco do nível ou o padrão (DND-32);
 * indisponível = 409 `MADDOX_UNAVAILABLE` com o motivo.
 */
export async function loadNarrator(rigor?: MaddoxRigorLevel | null): Promise<{ settings: MaddoxSettings; model: NarratorModel }> {
    const [{ loadMaddoxSettings }, { availability }] = await Promise.all([import("./settings"), import("@/features/ai/server/settings")])
    const { settings } = await loadMaddoxSettings()
    const model = resolveNarratorModel(settings, rigor)
    const status = await availability({ enabled: settings.enabled, provider: model?.provider ?? null, model: model?.model ?? null }, '"Agente Maddox"')
    if (!status.available || !model) throw new DomainError(409, status.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")
    return { settings, model }
}

// ── Contexto ───────────────────────────────────────────────────────────────────

interface LoadedContext {
    campaign: IMaddoxCampaign
    prompt: Omit<NarratorPromptContext, "instructions" | "agentMemories">
    npcNames: string[]
    /** NPCs Opex vivos (DND-27), consultados nas narrações. */
    opexNpcNames: string[]
    messages: IMaddoxCampaignMessage[]
    /** Combates citados pelos cards da transcrição. */
    combats: Map<string, IMaddoxCombat>
}

async function loadContext(campaignId: Types.ObjectId): Promise<LoadedContext> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("userId characterId").lean<{ userId: string; characterId: Types.ObjectId | null }[]>()
    const characterIds = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const userIds = members.map((member) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const [characters, users, npcs, memories, recent, opexNpcs] = await Promise.all([
        characterIds.length ? MaddoxCharacterModel.find({ _id: { $in: characterIds } }).lean<IMaddoxCharacter[]>() : Promise.resolve([]),
        userIds.length ? User.find({ _id: { $in: userIds } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : Promise.resolve([]),
        MaddoxNpcModel.find({ campaignId }).sort({ updatedAt: -1 }).limit(MADDOX_NARRATOR_INDEX_ITEMS).lean<IMaddoxNpc[]>(),
        // Memórias da campanha: só no Engramind (missões ativas sempre + as mais recentes); sem a rede, nenhuma.
        import("@/features/engramind/server/campaign-memories").then(({ narratorMemoryIndex }) => narratorMemoryIndex(String(campaignId), MADDOX_NARRATOR_INDEX_ITEMS)),
        MaddoxCampaignMessageModel.find({ campaignId }).sort({ _id: -1 }).limit(200).lean<IMaddoxCampaignMessage[]>(),
        MaddoxNpcModel.find({ campaignId, "opex.active": true, status: { $ne: "dead" } }).sort({ name: 1 }).select("name").lean<{ name: string }[]>(),
    ])
    const sheets = await loadSheetSummaries(campaign, characters)
    const tacticalCombat = usesTacticalCombat(campaign.rigor) ? await tacticalCombatBlock(campaignId) : null
    // Combate narrativo (Maddox 6): o ativo vai ao prompt; os dos cards, à transcrição.
    const combatIds = recent.map((message) => message.combat?.combatId).filter((id): id is Types.ObjectId => Boolean(id))
    const [activeCombat, cardCombats] = await Promise.all([
        usesCombat(campaign.rigor) ? MaddoxCombatModel.findOne({ campaignId, status: "active" }).lean<IMaddoxCombat>() : Promise.resolve(null),
        combatIds.length ? MaddoxCombatModel.find({ _id: { $in: combatIds } }).lean<IMaddoxCombat[]>() : Promise.resolve([]),
    ])
    const userName = new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username || "Jogador"]))
    const byCharacter = new Map(members.filter((member) => member.characterId).map((member) => [String(member.characterId), member.userId]))
    const profileOf = (character: IMaddoxCharacter): Record<string, string> => (character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) })
    return {
        campaign,
        npcNames: npcs.map((npc) => npc.name),
        opexNpcNames: opexNpcs.map((npc) => npc.name),
        messages: recent.reverse(),
        combats: new Map(cardCombats.map((combat) => [String(combat._id), combat])),
        prompt: {
            rigor: campaign.rigor,
            campaignName: campaign.name,
            setting: campaign.setting ?? "",
            openingSituation: campaign.openingSituation ?? "",
            worldCatalog: worldCatalogOf(campaign.worldCatalog),
            state: { scene: campaign.state?.scene ?? "", location: campaign.state?.location ?? "", situation: campaign.state?.situation ?? "", pendingDecision: campaign.state?.pendingDecision ?? "" },
            characters: characters
                .filter((character) => character.interview?.status === "done")
                .map((character) => ({
                    name: character.name,
                    // Personagem Opex (DND-26): o Maddox o trata como qualquer personagem; só o rótulo do "jogador" muda.
                    playerName: userName.get(byCharacter.get(String(character._id)) ?? "") ?? (isOpexUserId(byCharacter.get(String(character._id))) ? MADDOX_OPEX_LABEL : "Jogador"),
                    profile: profileOf(character),
                    currentState: character.currentState ?? "",
                    sheet: character.sheetId ? (sheets.get(String(character.sheetId)) ?? null) : null,
                })),
            npcs: npcs.map((npc) => ({ name: npc.name, status: npc.status, visibility: npc.visibility, publicDescription: npc.publicDescription ?? "", masterNotes: npc.masterNotes ?? "", ...(npc.opex?.active ? { opex: true } : {}) })),
            memories: memories.map((memory) => ({ kind: memory.kind, title: memory.title, text: memory.text, visibility: memory.visibility, status: memory.status ?? null })),
            combat: activeCombat
                ? {
                      title: activeCombat.title,
                      location: activeCombat.location ?? "",
                      masterTurns: activeCombat.masterTurns ?? 0,
                      combatants: (activeCombat.combatants ?? []).map((item) => ({ name: item.name, side: item.side, quantity: item.quantity ?? 1, condition: item.condition ?? "", description: item.description ?? "" })),
                  }
                : null,
            tacticalCombat,
        },
    }
}

/** Bloco "Combate tático em andamento" (ordem, PV, CA, condições e quem age) para as instruções. */
async function tacticalCombatBlock(campaignId: Types.ObjectId): Promise<string | null> {
    try {
        const { tacticalView } = await import("./tactical-master")
        const view = await tacticalView(campaignId, undefined)
        if (!view) return null
        return [`## Combate tático em andamento: ${String(view.titulo)}`, "Estado (o servidor mantém; consulte de novo com get_combat):", "```json", JSON.stringify(view, null, 1), "```"].join("\n")
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] estado do combate tático indisponível; narrando sem o bloco")
        return null
    }
}

/** Quem age nesta narração do combate tático (`null` = sem combate tático). */
async function tacticalTask(campaignId: Types.ObjectId, round: number): Promise<NarratorTacticalTask | null> {
    const tactical = await import("./tactical-combat")
    const combat = await tactical.findActiveTactical(campaignId)
    if (!combat) return null
    const nameOf = (key: string) => tactical.findActor(combat, key)?.name ?? null
    const block = combat.tactical.phase === "running" ? (combat.tactical.block ?? null) : null
    return {
        phase: combat.tactical.phase,
        queue: combat.tactical.queue.map(nameOf).filter((name): name is string => Boolean(name)),
        next: combat.tactical.nextKey ? nameOf(combat.tactical.nextKey) : null,
        enemiesDown: tactical.livingEnemies(combat).length === 0,
        charactersDown: tactical.consciousCharacters(combat).length === 0,
        ...(block
            ? {
                  block: {
                      kind: block.kind,
                      actor: block.actorKey ? nameOf(block.actorKey) : null,
                      actorKey: block.actorKey ?? null,
                      resumed: round > block.startRound,
                      waits: block.waits,
                      remaining: tactical.remainingBlocks(combat).map(nameOf).filter((name): name is string => Boolean(name)),
                  },
              }
            : {}),
    }
}

/** Faixa de PV de um adversário (sem números exatos), para o agente do NPC Opex escolher o alvo. */
function healthBand(hp: number, hpMax: number, defeated: boolean): string {
    if (defeated || hp <= 0) return "fora de combate"
    const ratio = hpMax > 0 ? hp / hpMax : 1
    if (ratio >= 1) return "ileso"
    if (ratio > 0.5) return "ferido"
    if (ratio > 0.25) return "muito ferido"
    return "quase caindo"
}

const clipLine = (value: string, max: number) => {
    const text = value.replace(/\s+/g, " ").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * Vez de um NPC Opex no combate tático (DND-27): antes da narração do bloco dele (não retomado), o servidor consulta o
 * agente, que escolhe uma das ações da ficha (ou uma genérica). A decisão vai na tarefa; a falha vira o aviso do dono
 * (o Maddox decide como hoje). Nunca lança: nada fica pendente no banco e a mesa não trava.
 */
async function consultTacticalOpexNpc(campaignId: Types.ObjectId, jobId: string, tactical: NarratorTacticalTask | null): Promise<void> {
    const block = tactical?.block
    if (!tactical || !block || block.kind !== "npc" || block.resumed || !block.actorKey || tactical.enemiesDown || tactical.charactersDown) return
    const tacticalModule = await import("./tactical-combat")
    const combat = await tacticalModule.findActiveTactical(campaignId)
    const actor = combat ? tacticalModule.findActor(combat, block.actorKey) : null
    if (!combat || !actor || actor.kind !== "combatant" || !actor.combatant.npcId) return
    const npc = await MaddoxNpcModel.findOne({ _id: actor.combatant.npcId, campaignId }).lean<IMaddoxNpc>()
    if (!npc?.opex?.active || npc.status === "dead") return
    const { addDraftOpexNpcFailure, setJobOpexNpcConsult } = await import("./game-live")
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("name rigor setting openingSituation state").lean<IMaddoxCampaign>()
        if (!campaign) return
        const stats = actor.state.stats
        const describe = (action: (typeof stats.actions)[number]) => {
            if (action.kind === "attack") return `ataque ${action.bonus !== null ? (action.bonus >= 0 ? `+${action.bonus}` : String(action.bonus)) : ""}${action.damage ? `, dano ${action.damage}${action.damageType ? ` ${action.damageType}` : ""}` : ""}${action.ranged ? ", à distância" : ""}`.trim()
            if (action.kind === "save") return `salvaguarda CD ${action.dc ?? "?"}${action.damage ? `, dano ${action.damage}` : ""}`
            return clipLine(action.description, 160)
        }
        const options = [
            ...(stats.multiattack > 1 ? [{ name: "Ataques Múltiplos", detail: `${stats.multiattack} ataques na mesma ação` }] : []),
            ...stats.actions.filter((action) => action.available && action.economy !== "reaction").map((action) => ({ name: action.name, detail: `${action.economy === "bonus" ? "ação bônus; " : ""}${describe(action)}` })),
            { name: "Disparada", detail: "dobra o deslocamento" },
            { name: "Esquivar", detail: "ataques contra ele têm desvantagem até a próxima vez" },
            { name: "Desengajar", detail: "move-se sem provocar ataques de oportunidade" },
            { name: "Fugir", detail: "abandona o combate" },
        ]
        const targets = [
            ...combat.combatants
                .filter((item) => item.tactical && !item.tactical.defeated && item.tactical.actorKey !== block.actorKey)
                .map((item) => ({ name: item.name, side: item.side === actor.combatant.side ? "do seu lado" : "do outro lado", health: healthBand(item.tactical!.stats.hp, item.tactical!.stats.hpMax, item.tactical!.defeated) })),
            ...combat.tactical.characters
                .filter((item) => !item.dead && !item.left)
                .map((item) => ({ name: item.name, side: actor.combatant.side === "aliado" ? "personagem, do seu lado" : "personagem, do outro lado", health: item.hpZero ? "caído (0 PV)" : "de pé" })),
        ]
        const situation = [
            `Combate: ${combat.title}${combat.location ? ` (${combat.location})` : ""}. Você está ${actor.combatant.side === "aliado" ? "do lado dos personagens" : "contra os personagens"}; os seus PV: ${healthBand(stats.hp, stats.hpMax, false)}.`,
            campaign.state?.situation ? `Situação: ${campaign.state.situation}` : null,
        ]
            .filter(Boolean)
            .join("\n")
        const { decideOpexNpcCombat } = await import("./opex-player")
        const decision = await decideOpexNpcCombat(campaign, npc, { round: combat.tactical.round, situation, options, targets })
        block.opexDecision = { npcName: npc.name, action: decision.acao, targets: decision.alvos, speech: decision.fala }
        setJobOpexNpcConsult(String(campaignId), jobId, String(npc._id), { npc: npc.name, fala: decision.fala.trim(), acao: `${decision.acao}${decision.alvos.length ? ` em ${decision.alvos.join(", ")}` : ""}`, nota: `Narre a partir desta decisão de ${npc.name}.` })
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        log.warn({ campaignId: String(campaignId), npcId: String(npc._id), err: reason }, "[maddox] o agente do NPC Opex não escolheu a ação do combate")
        addDraftOpexNpcFailure(String(campaignId), jobId, { npcId: String(npc._id), npcName: npc.name, error: reason.slice(0, 500) })
        // Já tentou nesta geração: `consultar_npc_opex` para o mesmo NPC devolve a falha, sem tentar de novo.
        setJobOpexNpcConsult(String(campaignId), jobId, String(npc._id), { npc: npc.name, falhou: true, nota: maddoxOpexNpcFallbackNote(npc.name) })
    }
}

/** Resumo das fichas D&D dos personagens (só nos graus com testes). Falha = narra sem os resumos (aviso no log). */
export async function loadSheetSummaries(campaign: IMaddoxCampaign, characters: readonly IMaddoxCharacter[]): Promise<Map<string, string>> {
    const summaries = new Map<string, string>()
    const sheetIds = characters.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    if (!usesChecks(campaign.rigor) || sheetIds.length === 0) return summaries
    try {
        const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
        const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
        const { computeSheetArmorClass } = await import("@/features/character-sheets/utils/armor-class")
        type StoredSheet = MaddoxCheckSheet & Parameters<typeof computeSheetArmorClass>[0] & { _id: Types.ObjectId }
        type StoredItem = Parameters<typeof computeSheetArmorClass>[1][number] & { sheetId: Types.ObjectId }
        const [sheets, items] = await Promise.all([
            CharacterSheet.find({ _id: { $in: sheetIds } }).lean<StoredSheet[]>(),
            CharacterItem.find({ sheetId: { $in: sheetIds }, equipped: true }).lean<StoredItem[]>(),
        ])
        // A CA não é gravada na ficha: é calculada dos itens equipados, como na listagem de fichas.
        for (const sheet of sheets) {
            const own = items.filter((item) => String(item.sheetId) === String(sheet._id))
            summaries.set(String(sheet._id), sheetSummary({ ...sheet, computedArmorClass: computeSheetArmorClass(sheet, own) }))
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] fichas indisponíveis; narrando sem os resumos")
    }
    return summaries
}

/** Card de combate → linha da transcrição ("combate começou: …" / "combate terminou: Vitória — …"). */
export function combatTranscriptLine(message: Pick<IMaddoxCampaignMessage, "combat">, combat: IMaddoxCombat | undefined): string {
    if (!message.combat || !combat) return ""
    if (message.combat.event === "order") return `ordem de iniciativa: ${(combat.tactical?.order ?? []).map((slot) => `${slot.name} (${slot.total ?? "?"})`).join(", ")}`
    if (message.combat.event === "start") {
        const foes = combat.combatants.map((item) => `${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ""}${item.side === "aliado" ? " [aliado]" : ""}`).join(", ")
        return `combate começou: ${combat.title}${combat.location ? ` (${combat.location})` : ""}${foes ? `; participantes: ${foes}` : ""}`
    }
    return `combate terminou: ${MADDOX_COMBAT_OUTCOME_LABELS[combat.outcome ?? "interrompido"]} — ${combat.summary}`
}

/** Mensagem de teste → resultado para a continuação e a transcrição. */
export function checkResultOf(message: IMaddoxCampaignMessage): NarratorCheckResult | null {
    const check = message.check
    if (message.kind !== "check" || !check) return null
    const roll = check.roll
    return {
        characterName: message.characterName ?? "Personagem",
        title: checkTitle({ kind: check.kind, ability: check.ability, skill: check.skill }),
        reason: check.reason,
        dc: check.dc,
        status: check.status,
        mode: check.mode,
        total: roll ? roll.total : null,
        d20: roll ? (roll.selectedD20?.kept ?? roll.terms[0]?.results[0] ?? null) : null,
        discarded: roll?.selectedD20?.discarded ?? null,
        modifier: roll ? roll.modifier : null,
        rolledByOwner: Boolean(check.rolledBy && check.rolledBy !== message.userId),
        cancelReason: check.cancelReason ?? null,
    }
}

/** Memórias do agente (canal `dndicas/maddox` no Engramind); sem elas, o Maddox narra assim mesmo. */
async function agentMemories(): Promise<string> {
    try {
        const { memoryBlock } = await import("@/features/ai/server/memory-block")
        return await memoryBlock("maddox")
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] memórias do agente indisponíveis; narrando sem elas")
        return ""
    }
}

// ── Geração ────────────────────────────────────────────────────────────────────

interface GenerateArgs {
    campaignId: string
    jobId: string
    turnNumber: number
    task: NarratorTask
    /** Mensagens que já estão na tarefa e não entram na transcrição. */
    excludeIds: Set<string>
    title: string
    signal?: AbortSignal
}

/**
 * Stream de texto com a marcação do catálogo segurada (nunca crua ao vivo). A cada trecho com quebra de linha, os parágrafos
 * já fechados (nunca o que ainda está em escrita) passam
 * pela mesma defesa da gravação (DND-52): se a reescrita depois das ferramentas repetir a primeira versão, o texto ao vivo
 * é trocado pela versão sem repetição (`sink.replace`), igual ao que vai ser gravado.
 */
function liveText(sink: MaddoxMasterSink) {
    const markup = createMarkupFilter()
    let text = ""
    let shown = ""
    // Só os parágrafos fechados entram na comparação; no fim (`final`), todos estão fechados.
    const settle = (final: boolean) => {
        if (!sink.replace) return
        const { closed, open } = final ? { closed: shown, open: "" } : splitOpenParagraph(shown)
        const clean = dropRewrittenParagraphs(closed)
        if (!clean.dropped) return
        shown = clean.text + open
        sink.replace(shown)
    }
    const show = (visible: string) => {
        if (!visible) return
        shown += visible
        sink.delta(visible)
    }
    return {
        push(chunk: string) {
            text += chunk
            show(markup.push(chunk))
            if (chunk.includes("\n")) settle(false)
        },
        finish() {
            show(markup.flush())
            settle(true)
            return text
        },
    }
}

async function generate(args: GenerateArgs, sink: MaddoxMasterSink): Promise<string> {
    const campaignId = new Types.ObjectId(args.campaignId)
    const [context, memories] = await Promise.all([loadContext(campaignId), agentMemories()])
    // O modelo depende do rigor da campanha (DND-32): bloco do nível ou a seleção padrão.
    const { settings, model } = await loadNarrator(context.campaign.rigor)
    const transcript = narratorTranscript(
        context.messages
            .filter((message) => !args.excludeIds.has(String(message._id)) && !message.error && message.kind !== "reminder" && message.kind !== "rewind")
            .map((message) => {
                const check = checkResultOf(message)
                if (message.kind === "combat") return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: combatTranscriptLine(message, context.combats.get(String(message.combat?.combatId))) }
                if (message.combatAction) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: message.combatAction.status === "cancelled" ? "" : message.combatAction.summary }
                if (message.combatRoll) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: `${message.characterName ?? "Personagem"} — ${message.combatRoll.reason}: ${message.combatRoll.outcome ?? message.combatRoll.status}` }
                if (message.combatReaction) return { turnNumber: message.turnNumber, kind: message.kind, characterName: null, content: `${message.characterName ?? "Personagem"} — reação (${message.combatReaction.description}): ${message.combatReaction.outcome ?? message.combatReaction.status}` }
                return { turnNumber: message.turnNumber, kind: message.kind, characterName: message.characterName, content: check ? checkResultLine(check) : message.content }
            }),
        MADDOX_NARRATOR_HISTORY_CHARS,
    )
    const { mentionsToMarkup } = await import("./catalog-mentions")
    // Injetar Lembrança (DND-25): as pendentes valem para esta narração (as enviadas durante ela, para a próxima).
    let remindersText = ""
    if (args.task.kind !== "answer") {
        const { claimReminders, remindersTaskSection } = await import("./reminders")
        remindersText = remindersTaskSection(await claimReminders(campaignId, args.jobId), usesTacticalCombat(context.campaign.rigor))
    }
    // Sugestões de ação (DND-30): só nas narrações fora do combate tático (lá a vez é pelos botões).
    const actionOptions = args.task.kind !== "answer" && !args.task.tactical
    // Dificuldade dos combates (DND-42): só nos graus táticos e nas narrações (não nas respostas); com o combate tático em
    // andamento, a tarefa leva a versão curta, para os reforços.
    const combatDifficulty = args.task.kind !== "answer" && usesTacticalCombat(context.campaign.rigor) ? (context.campaign.combatDifficulty ?? MADDOX_COMBAT_DIFFICULTY_DEFAULT) : null
    // NPCs Opex (DND-27): a consulta ao agente só existe nas narrações (nas respostas, o Maddox decide sozinho).
    const opexNpcs = args.task.kind !== "answer" && context.opexNpcNames.length > 0
    // No bloco de um adversário do combate tático, o servidor já consultou o agente (a decisão ou a falha vêm na tarefa): a
    // seção que manda consultar fica de fora.
    const npcBlock = args.task.kind !== "answer" && args.task.tactical?.block?.kind === "npc"
    const userText = [
        transcript ? `# Últimos acontecimentos\n\n${mentionsToMarkup(transcript)}` : null,
        narratorTaskText(args.task, { density: context.campaign.density ?? MADDOX_DEFAULT_DENSITY, combatDifficulty, actionOptions, opexNpcs: opexNpcs && !npcBlock ? context.opexNpcNames : [] }),
        remindersText || null,
    ]
        .filter(Boolean)
        .join("\n\n")
    const promptContext: NarratorPromptContext = { instructions: settings.instructions, agentMemories: memories, ...context.prompt }
    const stream = liveText(sink)
    let failure: string | null = null
    // Testes só nas narrações do turno do mestre dos graus com ficha (respostas a perguntas nunca pedem teste).
    const checks = usesChecks(context.campaign.rigor) && args.task.kind !== "answer"
    // Combate narrativo (Maddox 6): ferramentas só nas narrações dos graus com combate registrado.
    const tactical = usesTacticalCombat(context.campaign.rigor) && args.task.kind !== "answer"
    const combat = (usesCombat(context.campaign.rigor) || tactical) && args.task.kind !== "answer"
    // Imagens nas cenas (Maddox 10): só nas narrações; respostas a perguntas não pedem imagem.
    if (args.task.kind !== "answer") {
        const { narratorSceneImageContext } = await import("./scene-images")
        promptContext.sceneImages = await narratorSceneImageContext(context.campaign, args.turnNumber)
    }
    const sceneImages = Boolean(promptContext.sceneImages?.situations.length)
    // DND-51: leitura e correção da ficha só na resposta a uma pergunta dos graus com ficha.
    const sheetFix = args.task.kind === "answer" && Boolean(args.task.sheetFix)

    if (model.provider === "opencode") {
        const [{ ensureMaddoxMcp }, { ensureMaddoxSession }, { createMaddoxTurnToken }, { streamAi }] = await Promise.all([import("./opencode-mcp"), import("./opencode-sessions"), import("./master-turn-token"), import("@/lib/ai/stream")])
        await ensureMaddoxMcp(settings)
        const sessionId = await ensureMaddoxSession({ campaignId: args.campaignId, purpose: "narrator", agent: model.agent, model: model.model, variant: model.variant, title: `Maddox · narrador · ${context.campaign.name}` })
        const turnToken = createMaddoxTurnToken({ campaignId: args.campaignId, jobId: args.jobId, turnNumber: args.turnNumber })
        const instructions = buildNarratorInstructions(promptContext, { kind: "mcp", server: MADDOX_MCP_SERVER_NAME, turnToken, checks, combat, tactical, sceneImages, actionOptions, opexNpcs, sheetFix })
        for await (const event of streamAi({
            provider: "opencode",
            model: model.model,
            agent: model.agent,
            variant: model.variant,
            instructions,
            prompt: userText,
            opencodeSessionId: sessionId,
            title: args.title,
            consumption: { origin: MADDOX_NARRATION_CONSUMPTION_ORIGIN, subject: args.campaignId },
            signal: args.signal,
        })) {
            if (event.type === "delta") stream.push(event.text)
            else if (event.type === "tool") sink.tool(event.state === "running")
            else if (event.type === "error") failure = event.message
        }
    } else {
        failure = await generateWithTools(
            { model, instructions: buildNarratorInstructions(promptContext, { kind: "ai-sdk" }), userText, campaignId, turnNumber: args.turnNumber, jobId: args.jobId, checks, combat, tactical, sceneImages, actionOptions, opexNpcs, sheetFix, signal: args.signal },
            stream,
            sink,
        )
    }
    // Abortada pelo teto de duração: o texto parcial nunca vira narração gravada.
    if (args.signal?.aborted) throw new Error(MADDOX_MASTER_TIMEOUT_MESSAGE)
    sink.tool(false)
    const finished = stream.finish().trim()
    if (failure) throw new Error(failure)
    if (!finished) throw new Error("O Maddox não respondeu.")
    // Defesa da gravação (DND-52): a primeira versão de um trecho reescrito depois das ferramentas não chega ao diário.
    const { text: raw, dropped } = dropRewrittenParagraphs(finished)
    if (dropped) log.warn({ campaignId: args.campaignId, turnNumber: args.turnNumber, kind: args.task.kind, dropped }, "[maddox] narração reescrita depois das ferramentas: primeira versão descartada")
    const [{ linkCatalogMentions }, { campaignReservedNames }] = await Promise.all([import("./catalog-mentions"), import("./interviews")])
    const reserved = [...(await campaignReservedNames(context.campaign)), ...context.npcNames]
    return linkCatalogMentions(raw, { reserved })
}

interface ToolGeneration {
    model: NarratorModel
    instructions: string
    userText: string
    campaignId: Types.ObjectId
    turnNumber: number
    jobId: string
    checks: boolean
    combat: boolean
    tactical: boolean
    sceneImages: boolean
    actionOptions: boolean
    opexNpcs: boolean
    sheetFix: boolean
    signal?: AbortSignal
}

/** Laço de ferramentas na AI SDK. Devolve a mensagem de falha (`null` = ok). */
async function generateWithTools(input: ToolGeneration, stream: ReturnType<typeof liveText>, sink: MaddoxMasterSink): Promise<string | null> {
    const [{ streamText, stepCountIs }, { prepareModel, samplingOptions, describeAiError }, { buildMaddoxAiTools }, { recordAiConsumption }] = await Promise.all([
        import("ai"),
        import("@/lib/ai/stream"),
        import("./master-tools"),
        import("@/lib/ai/consumption"),
    ])
    const { model } = input
    const prepared = await prepareModel({ provider: model.provider, model: model.model, variant: model.variant, sessionKey: `maddox:${input.campaignId}:narrator` })
    let failure: string | null = null
    let stepHasText = false
    let costUsd: number | null = null
    try {
        const result = streamText({
            model: prepared.model,
            instructions: input.instructions,
            messages: [{ role: "user", content: input.userText }],
            tools: await buildMaddoxAiTools({ campaignId: input.campaignId, turnNumber: input.turnNumber, jobId: input.jobId }, { checks: input.checks, combat: input.combat, tactical: input.tactical, sceneImages: input.sceneImages, actionOptions: input.actionOptions, opexNpcs: input.opexNpcs, sheetFix: input.sheetFix }),
            stopWhen: stepCountIs(MADDOX_NARRATOR_MAX_STEPS),
            abortSignal: input.signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions({ provider: model.provider, variant: model.variant, temperature: model.temperature, maxOutputTokens: model.maxOutputTokens }),
        })
        let written = ""
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "start-step":
                    stepHasText = false
                    break
                case "text-delta":
                    if (!part.text) break
                    // Texto de um passo novo depois de ferramentas: separa do anterior por parágrafo.
                    if (!stepHasText && written && !written.endsWith("\n")) {
                        stream.push("\n\n")
                        written += "\n\n"
                    }
                    stepHasText = true
                    written += part.text
                    stream.push(part.text)
                    break
                case "tool-call":
                    sink.tool(true)
                    break
                case "tool-result":
                case "tool-error":
                    sink.tool(false)
                    break
                case "finish-step": {
                    const cost = stepCostUsd(part.providerMetadata)
                    if (cost !== null) costUsd = (costUsd ?? 0) + cost
                    break
                }
                case "error":
                    failure = describeAiError(part.error, model)
                    break
                case "abort":
                    failure = MADDOX_MASTER_TIMEOUT_MESSAGE
                    break
                case "finish":
                    if (part.finishReason === "error" && !failure) failure = "O modelo terminou com erro"
                    if (!failure) {
                        const usage = part.totalUsage
                        const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
                        await recordAiConsumption({
                            dedupKey: `maddox-narration:${randomUUID()}`,
                            provider: model.provider,
                            origin: MADDOX_NARRATION_CONSUMPTION_ORIGIN,
                            subject: String(input.campaignId),
                            model: model.model,
                            inputTokens: num(usage.inputTokens),
                            outputTokens: num(usage.outputTokens),
                            totalTokens: num(usage.totalTokens),
                            costUsd,
                        })
                    }
                    break
            }
        }
    } catch (error) {
        failure = describeAiError(error)
    } finally {
        await prepared.dispose().catch(() => undefined)
    }
    if (failure) log.warn({ campaignId: String(input.campaignId), provider: model.provider, err: failure }, "[maddox] falha na geração do narrador")
    return failure
}

const declarationsOf = (actions: readonly IMaddoxCampaignMessage[]): NarratorDeclaration[] =>
    actions.map((action) => ({ characterName: action.characterName ?? "Personagem", kind: action.kind === "pass" ? "pass" : "declaration", content: action.content, skipped: Boolean(action.skippedBy) }))

export const aiMaddoxMaster: MaddoxMaster = {
    async narrate(context: MaddoxNarrationContext, sink) {
        const campaignId = new Types.ObjectId(context.campaignId)
        const round = context.round ?? 0
        const previous = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber - 1, turnAction: true }).select("_id").lean<{ _id: Types.ObjectId }[]>()
        // Continuação (Maddox 5): os testes da rodada anterior vão na tarefa, não na transcrição.
        const checks = round > 0 ? await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber, kind: "check", "check.round": round - 1 }).sort({ _id: 1 }).lean<IMaddoxCampaignMessage[]>() : []
        const results = checks.map(checkResultOf).filter((result): result is NarratorCheckResult => Boolean(result))
        // Combate tático (Maddox 7): quem age agora e o resultado das rolagens/reações da espera anterior.
        const campaignDoc = await MaddoxCampaignModel.findById(campaignId).select("rigor").lean<Pick<IMaddoxCampaign, "rigor">>()
        const tacticalRigor = Boolean(campaignDoc && usesTacticalCombat(campaignDoc.rigor))
        const tactical = tacticalRigor ? await tacticalTask(campaignId, round) : null
        // NPC Opex na vez (DND-27): o agente escolhe a ação antes da narração do bloco dele.
        if (tactical) await consultTacticalOpexNpc(campaignId, context.jobId, tactical)
        const waitDocs = tacticalRigor && round > 0 ? await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber, $or: [{ "combatRoll.waitRound": round - 1 }, { "combatReaction.waitRound": round - 1 }, { "combatAction.waitRound": round - 1 }] }).select("_id").lean<{ _id: Types.ObjectId }[]>() : []
        const combatResults = tacticalRigor && round > 0 ? await (await import("./combat-reactions")).waitRoundResults(campaignId, context.turnNumber, round - 1) : []
        const { MADDOX_COMBAT_WAIT_ROUNDS_MAX } = await import("../constants")
        const task: NarratorTask =
            round > 0
                ? { kind: "continuation", turnNumber: context.turnNumber, round, declarations: context.declarations, results, combatResults, tactical, ...(tactical ? { lastRound: tactical.block ? tactical.block.waits >= MADDOX_COMBAT_WAIT_ROUNDS_MAX - 1 : round >= MADDOX_COMBAT_WAIT_ROUNDS_MAX - 1 } : {}) }
                : { kind: "narration", turnNumber: context.turnNumber, declarations: context.declarations, combatHint: context.combatHint ?? null, tactical }
        return generate(
            {
                campaignId: context.campaignId,
                jobId: context.jobId,
                turnNumber: context.turnNumber,
                task,
                excludeIds: new Set([...previous.map((item) => String(item._id)), ...checks.map((item) => String(item._id)), ...waitDocs.map((item) => String(item._id))]),
                title: round > 0 ? `Maddox · narração · turno ${context.turnNumber} · testes ${round}` : `Maddox · narração · turno ${context.turnNumber}`,
                signal: context.signal,
            },
            sink,
        )
    },
    async answer(context: MaddoxAnswerContext, sink) {
        const campaignId = new Types.ObjectId(context.campaignId)
        const questionId = new Types.ObjectId(context.questionId)
        const [actions, question, campaign, runs] = await Promise.all([
            MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber, turnAction: true }).sort({ _id: 1 }).lean<IMaddoxCampaignMessage[]>(),
            MaddoxCampaignMessageModel.findById(questionId).select("userId characterId").lean<Pick<IMaddoxCampaignMessage, "userId" | "characterId">>(),
            MaddoxCampaignModel.findById(campaignId).select("ownerId rigor").lean<Pick<IMaddoxCampaign, "ownerId" | "rigor">>(),
            import("./question-runs"),
        ])
        // DND-51: a conversa da pergunta (réplicas seguem `replyToId`) e, nos graus com ficha, a correção da ficha.
        const thread = (await runs.questionThread(campaignId, questionId)).slice(0, -1)
        const sheetFix = Boolean(campaign && MADDOX_SHEET_RIGORS.includes(campaign.rigor))
        const characterId = question?.characterId ?? null
        const playerTexts = [...thread.filter((entry) => entry.role === "player").map((entry) => entry.content), context.question, ...(await runs.interviewPlayerTexts(campaignId, characterId))]
        runs.openQuestionRun({
            campaignId: context.campaignId,
            jobId: context.jobId,
            turnNumber: context.turnNumber,
            questionId: context.questionId,
            askerUserId: question?.userId ?? null,
            askerCharacterId: characterId ? String(characterId) : null,
            askerIsOwner: Boolean(campaign && question?.userId && campaign.ownerId === question.userId),
            playerTexts,
        })
        try {
            return await generate(
                {
                    campaignId: context.campaignId,
                    jobId: context.jobId,
                    turnNumber: context.turnNumber,
                    task: { kind: "answer", turnNumber: context.turnNumber, characterName: context.characterName, question: context.question, declarations: declarationsOf(actions), thread: thread.map(({ role, characterName, content }) => ({ role, characterName, content })), sheetFix },
                    excludeIds: new Set([context.questionId, ...thread.map((entry) => entry.id), ...actions.map((action) => String(action._id))]),
                    title: `Maddox · pergunta · turno ${context.turnNumber}`,
                    signal: context.signal,
                },
                sink,
            )
        } finally {
            runs.closeQuestionRun(context.jobId)
        }
    },
}
