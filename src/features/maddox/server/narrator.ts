import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import {
    MADDOX_MCP_SERVER_NAME,
    MADDOX_NARRATION_CONSUMPTION_ORIGIN,
    MADDOX_NARRATOR_HISTORY_CHARS,
    MADDOX_NARRATOR_INDEX_ITEMS,
    MADDOX_NARRATOR_MAX_STEPS,
} from "../constants"
import { createMarkupFilter } from "../catalog-markup"
import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMemoryModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxNpcModel,
    type IMaddoxCampaign,
    type IMaddoxCampaignMemory,
    type IMaddoxCampaignMessage,
    type IMaddoxCharacter,
    type IMaddoxNpc,
} from "../models"
import type { MaddoxSettings } from "../schemas"
import type { MaddoxAnswerContext, MaddoxMaster, MaddoxMasterSink, MaddoxNarrationContext } from "./game-master"
import { buildNarratorInstructions, narratorTaskText, narratorTranscript, type NarratorDeclaration, type NarratorPromptContext, type NarratorTask } from "./narrator-prompt"

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

export interface NarratorModel {
    provider: NonNullable<MaddoxSettings["main"]["provider"]>
    model: string
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

/** Modelo do narrador (o "Maddox" da aba); indisponível = 409 `MADDOX_UNAVAILABLE` com o motivo. */
export async function loadNarrator(): Promise<{ settings: MaddoxSettings; model: NarratorModel }> {
    const [{ loadMaddoxSettings }, { availability }] = await Promise.all([import("./settings"), import("@/features/ai/server/settings")])
    const { settings } = await loadMaddoxSettings()
    const main = settings.main
    const status = await availability({ enabled: settings.enabled, provider: main.provider, model: main.model }, '"Agente Maddox"')
    if (!status.available || !main.provider || !main.model) throw new DomainError(409, status.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")
    return { settings, model: { provider: main.provider, model: main.model, agent: main.agent ?? null, variant: main.variant ?? null, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens } }
}

// ── Contexto ───────────────────────────────────────────────────────────────────

interface LoadedContext {
    campaign: IMaddoxCampaign
    prompt: Omit<NarratorPromptContext, "instructions" | "agentMemories">
    npcNames: string[]
    messages: IMaddoxCampaignMessage[]
}

async function loadContext(campaignId: Types.ObjectId): Promise<LoadedContext> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("userId characterId").lean<{ userId: string; characterId: Types.ObjectId | null }[]>()
    const characterIds = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const userIds = members.map((member) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const [characters, users, npcs, memories, recent] = await Promise.all([
        characterIds.length ? MaddoxCharacterModel.find({ _id: { $in: characterIds } }).lean<IMaddoxCharacter[]>() : Promise.resolve([]),
        userIds.length ? User.find({ _id: { $in: userIds } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : Promise.resolve([]),
        MaddoxNpcModel.find({ campaignId }).sort({ updatedAt: -1 }).limit(MADDOX_NARRATOR_INDEX_ITEMS).lean<IMaddoxNpc[]>(),
        MaddoxCampaignMemoryModel.find({ campaignId }).sort({ updatedAt: -1 }).limit(MADDOX_NARRATOR_INDEX_ITEMS * 2).lean<IMaddoxCampaignMemory[]>(),
        MaddoxCampaignMessageModel.find({ campaignId }).sort({ _id: -1 }).limit(200).lean<IMaddoxCampaignMessage[]>(),
    ])
    const userName = new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username || "Jogador"]))
    const byCharacter = new Map(members.filter((member) => member.characterId).map((member) => [String(member.characterId), member.userId]))
    const profileOf = (character: IMaddoxCharacter): Record<string, string> => (character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) })
    // Missões ativas sempre entram; o resto até o limite, das mais recentes.
    const quests = memories.filter((memory) => memory.kind === "missao" && (memory.status ?? "ativa") === "ativa")
    const others = memories.filter((memory) => !quests.includes(memory)).slice(0, Math.max(0, MADDOX_NARRATOR_INDEX_ITEMS - quests.length))
    return {
        campaign,
        npcNames: npcs.map((npc) => npc.name),
        messages: recent.reverse(),
        prompt: {
            rigor: campaign.rigor,
            campaignName: campaign.name,
            setting: campaign.setting ?? "",
            openingSituation: campaign.openingSituation ?? "",
            state: { scene: campaign.state?.scene ?? "", location: campaign.state?.location ?? "", situation: campaign.state?.situation ?? "", pendingDecision: campaign.state?.pendingDecision ?? "" },
            characters: characters
                .filter((character) => character.interview?.status === "done")
                .map((character) => ({ name: character.name, playerName: userName.get(byCharacter.get(String(character._id)) ?? "") ?? "Jogador", profile: profileOf(character), currentState: character.currentState ?? "" })),
            npcs: npcs.map((npc) => ({ name: npc.name, status: npc.status, visibility: npc.visibility, publicDescription: npc.publicDescription ?? "", masterNotes: npc.masterNotes ?? "" })),
            memories: [...quests, ...others].map((memory) => ({ kind: memory.kind, title: memory.title, text: memory.text, visibility: memory.visibility, status: memory.status ?? null })),
        },
    }
}

async function agentMemories(): Promise<string[]> {
    try {
        const { agentMemoryTexts } = await import("@/features/ai/server/agent-memory-service")
        return await agentMemoryTexts(["maddox"])
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] memórias do agente indisponíveis; narrando sem elas")
        return []
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
}

/** Stream de texto com a marcação do catálogo segurada (nunca crua ao vivo). */
function liveText(sink: MaddoxMasterSink) {
    const markup = createMarkupFilter()
    let text = ""
    return {
        push(chunk: string) {
            text += chunk
            const visible = markup.push(chunk)
            if (visible) sink.delta(visible)
        },
        finish() {
            const rest = markup.flush()
            if (rest) sink.delta(rest)
            return text
        },
    }
}

async function generate(args: GenerateArgs, sink: MaddoxMasterSink): Promise<string> {
    const campaignId = new Types.ObjectId(args.campaignId)
    const { settings, model } = await loadNarrator()
    const [context, memories] = await Promise.all([loadContext(campaignId), agentMemories()])
    const transcript = narratorTranscript(
        context.messages.filter((message) => !args.excludeIds.has(String(message._id)) && !message.error).map((message) => ({ turnNumber: message.turnNumber, kind: message.kind, characterName: message.characterName, content: message.content })),
        MADDOX_NARRATOR_HISTORY_CHARS,
    )
    const { mentionsToMarkup } = await import("./catalog-mentions")
    const userText = [transcript ? `# Últimos acontecimentos\n\n${mentionsToMarkup(transcript)}` : null, narratorTaskText(args.task)].filter(Boolean).join("\n\n")
    const promptContext: NarratorPromptContext = { instructions: settings.instructions, agentMemories: memories, ...context.prompt }
    const stream = liveText(sink)
    let failure: string | null = null

    if (model.provider === "opencode") {
        const [{ ensureMaddoxMcp }, { ensureMaddoxSession }, { createMaddoxTurnToken }, { streamAi }] = await Promise.all([import("./opencode-mcp"), import("./opencode-sessions"), import("./master-turn-token"), import("@/lib/ai/stream")])
        await ensureMaddoxMcp(settings)
        const sessionId = await ensureMaddoxSession({ campaignId: args.campaignId, purpose: "narrator", agent: model.agent, title: `Maddox · narrador · ${context.campaign.name}` })
        const turnToken = createMaddoxTurnToken({ campaignId: args.campaignId, jobId: args.jobId, turnNumber: args.turnNumber })
        const instructions = buildNarratorInstructions(promptContext, { kind: "mcp", server: MADDOX_MCP_SERVER_NAME, turnToken })
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
        })) {
            if (event.type === "delta") stream.push(event.text)
            else if (event.type === "tool") sink.tool(event.state === "running")
            else if (event.type === "error") failure = event.message
        }
    } else {
        failure = await generateWithTools({ model, instructions: buildNarratorInstructions(promptContext, { kind: "ai-sdk" }), userText, campaignId, turnNumber: args.turnNumber }, stream, sink)
    }
    sink.tool(false)
    const raw = stream.finish().trim()
    if (failure) throw new Error(failure)
    if (!raw) throw new Error("O Maddox não respondeu.")
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
    const prepared = await prepareModel({ provider: model.provider, model: model.model, variant: model.variant })
    let failure: string | null = null
    let stepHasText = false
    try {
        const result = streamText({
            model: prepared.model,
            instructions: input.instructions,
            messages: [{ role: "user", content: input.userText }],
            tools: await buildMaddoxAiTools({ campaignId: input.campaignId, turnNumber: input.turnNumber }),
            stopWhen: stepCountIs(MADDOX_NARRATOR_MAX_STEPS),
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
                case "error":
                    failure = describeAiError(part.error)
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
                            costUsd: null,
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
        const previous = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber - 1, turnAction: true }).select("_id").lean<{ _id: Types.ObjectId }[]>()
        return generate(
            {
                campaignId: context.campaignId,
                jobId: context.jobId,
                turnNumber: context.turnNumber,
                task: { kind: "narration", turnNumber: context.turnNumber, declarations: context.declarations },
                excludeIds: new Set(previous.map((item) => String(item._id))),
                title: `Maddox · narração · turno ${context.turnNumber}`,
            },
            sink,
        )
    },
    async answer(context: MaddoxAnswerContext, sink) {
        const campaignId = new Types.ObjectId(context.campaignId)
        const actions = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: context.turnNumber, turnAction: true }).sort({ _id: 1 }).lean<IMaddoxCampaignMessage[]>()
        return generate(
            {
                campaignId: context.campaignId,
                jobId: context.jobId,
                turnNumber: context.turnNumber,
                task: { kind: "answer", turnNumber: context.turnNumber, characterName: context.characterName, question: context.question, declarations: declarationsOf(actions) },
                excludeIds: new Set([context.questionId, ...actions.map((action) => String(action._id))]),
                title: `Maddox · pergunta · turno ${context.turnNumber}`,
            },
            sink,
        )
    },
}
