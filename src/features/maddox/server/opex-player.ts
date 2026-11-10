import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_OPEX_GENERATION_TIMEOUT_MS, MADDOX_OPEX_NPC_COMBAT_CONSUMPTION_ORIGIN, MADDOX_OPEX_NPC_CONSUMPTION_ORIGIN, MADDOX_OPEX_NPC_TIMEOUT_MS, type MaddoxRigorLevel } from "../constants"
import { resolveOpexCharacterModel, type MaddoxResolvedModel } from "../model-resolution"
import type { IMaddoxCampaign, IMaddoxCampaignMember, IMaddoxCharacter, IMaddoxNpc } from "../models"
import type { MaddoxSettings } from "../schemas"
import { parseJsonObject } from "./interview-prompt"
import {
    buildOpexNpcInstructions,
    opexMemoriesOf,
    opexNpcCombatSchema,
    opexNpcCombatTask,
    opexNpcSceneSchema,
    opexNpcSceneTask,
    type OpexNpcCombatDecision,
    type OpexNpcCombatTask,
    type OpexNpcPromptContext,
    type OpexNpcSceneDecision,
    type OpexNpcSceneTask,
    type OpexPromptContext,
} from "./opex-prompt"

/**
 * Geração das decisões do Personagem Opex (DND-26) — SOMENTE servidor. Cada decisão é uma geração efêmera (sem sessão
 * fixa) com saída JSON validada por Zod e uma nova tentativa; o teto `MADDOX_OPEX_GENERATION_TIMEOUT_MS` aborta o
 * provedor e rejeita mesmo que ele ignore o sinal.
 */

const log = loggerFor({ module: "maddox", feature: "opex" })
const ATTEMPTS = 2

/** Modelo do Personagem Opex no rigor da campanha (409 `MADDOX_UNAVAILABLE` indisponível). */
export async function loadOpexModel(rigor: MaddoxRigorLevel): Promise<{ settings: MaddoxSettings; model: MaddoxResolvedModel }> {
    const [{ loadMaddoxSettings }, { availability }] = await Promise.all([import("./settings"), import("@/features/ai/server/settings")])
    const { settings } = await loadMaddoxSettings()
    const model = resolveOpexCharacterModel(settings, rigor)
    const result = await availability({ enabled: settings.enabled, provider: model?.provider ?? null, model: model?.model ?? null }, '"Agente Maddox"')
    if (!result.available || !model) throw new DomainError(409, result.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")
    return { settings, model }
}

const profileOf = (character: Pick<IMaddoxCharacter, "profile"> | null): Record<string, string> =>
    !character?.profile ? {} : character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...character.profile }

/** Contexto das decisões: instruções da configuração, memórias dos 3 canais, campanha e personagem (com a ficha). */
export async function opexPromptContext(campaign: IMaddoxCampaign, member: IMaddoxCampaignMember, character: IMaddoxCharacter | null, settings: MaddoxSettings): Promise<OpexPromptContext> {
    const [{ opexCharacterMemoryBlock }, { loadSheetSummaries }] = await Promise.all([import("@/features/engramind/server/opex-characters"), import("./narrator")])
    const [memories, sheets] = await Promise.all([
        opexCharacterMemoryBlock({ campaignId: String(campaign._id), memberId: String(member._id), characterName: character?.name ?? "" }),
        character?.sheetId ? loadSheetSummaries(campaign, [character]) : Promise.resolve(new Map<string, string>()),
    ])
    return {
        instructions: settings.opexCharacterInstructions,
        memories,
        basePrompt: member.opex?.prompt ?? "",
        campaign: {
            name: campaign.name,
            rigor: campaign.rigor,
            setting: campaign.setting ?? "",
            openingSituation: campaign.openingSituation ?? "",
            state: { scene: campaign.state?.scene ?? "", location: campaign.state?.location ?? "", situation: campaign.state?.situation ?? "", pendingDecision: campaign.state?.pendingDecision ?? "" },
        },
        character: character ? { name: character.name ?? "", profile: profileOf(character), currentState: character.currentState ?? "", sheet: character.sheetId ? (sheets.get(String(character.sheetId)) ?? null) : null } : null,
    }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, message = "o Personagem Opex demorou demais para decidir"): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(message))
        }, ms)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

export interface OpexDecisionInput<T> {
    model: MaddoxResolvedModel
    instructions: string
    prompt: string
    schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }
    title: string
    origin: string
    subject: string
    /** Teto de cada tentativa (padrão `MADDOX_OPEX_GENERATION_TIMEOUT_MS`; o NPC Opex usa um menor, DND-27). */
    timeoutMs?: number
    /** Tentativas (padrão 2). */
    attempts?: number
    /** Quem decide, nas mensagens de erro e no log (padrão "Personagem Opex"). */
    actorLabel?: string
}

/** Decisão do Opex: JSON validado, com uma nova tentativa. Falha das duas = erro com o motivo (pt-BR). */
export async function decideOpex<T>(input: OpexDecisionInput<T>): Promise<T> {
    const { generateAiText } = await import("@/lib/ai/stream")
    const label = input.actorLabel ?? "Personagem Opex"
    const attempts = Math.max(1, input.attempts ?? ATTEMPTS)
    let lastError = ""
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const { text } = await withTimeout(
                (signal) =>
                    generateAiText({
                        provider: input.model.provider,
                        model: input.model.model,
                        agent: input.model.agent,
                        variant: input.model.variant,
                        instructions: input.instructions,
                        prompt: input.prompt,
                        title: input.title,
                        consumption: { origin: input.origin, subject: input.subject },
                        signal,
                    }),
                input.timeoutMs ?? MADDOX_OPEX_GENERATION_TIMEOUT_MS,
                `o ${label} demorou demais para decidir`,
            )
            const parsed = input.schema.safeParse(parseJsonObject(text))
            if (parsed.success) return parsed.data
            lastError = "resposta fora do formato"
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        log.warn({ attempt, err: lastError, subject: input.subject, title: input.title }, `[maddox] decisão do ${label} inválida`)
    }
    throw new Error(`O ${label} não conseguiu decidir (${lastError}).`)
}

// ── NPC Opex (DND-27) ───────────────────────────────────────────────────────

type NpcForPrompt = Pick<IMaddoxNpc, "_id" | "name" | "publicDescription">
type CampaignForPrompt = Pick<IMaddoxCampaign, "_id" | "name" | "rigor" | "setting" | "openingSituation" | "state">

/**
 * Contexto do agente do NPC Opex: instruções da seção Personagem Opex, memórias dos 2 canais (global dos NPCs Opex e o
 * individual), a campanha e o NPC (nome e descrição pública; as notas do mestre só chegam pela memória inicial).
 */
export async function opexNpcPromptContext(campaign: CampaignForPrompt, npc: NpcForPrompt, settings: MaddoxSettings): Promise<OpexNpcPromptContext> {
    const { opexNpcMemoryBlock } = await import("@/features/engramind/server/opex-npcs")
    const memories = await opexNpcMemoryBlock({ campaignId: String(campaign._id), npcId: String(npc._id), npcName: npc.name })
    return {
        instructions: settings.opexCharacterInstructions,
        memories,
        npc: { name: npc.name, publicDescription: npc.publicDescription ?? "" },
        campaign: {
            name: campaign.name,
            rigor: campaign.rigor,
            setting: campaign.setting ?? "",
            openingSituation: campaign.openingSituation ?? "",
            state: { scene: campaign.state?.scene ?? "", location: campaign.state?.location ?? "", situation: campaign.state?.situation ?? "", pendingDecision: campaign.state?.pendingDecision ?? "" },
        },
    }
}

async function decideAsNpc<T extends { memorias: { titulo: string; texto: string }[] }>(
    campaign: CampaignForPrompt,
    npc: NpcForPrompt,
    input: { prompt: string; schema: OpexDecisionInput<T>["schema"]; origin: string; title: string; attempts: number },
): Promise<T> {
    const { settings, model } = await loadOpexModel(campaign.rigor)
    const context = await opexNpcPromptContext(campaign, npc, settings)
    const decision = await decideOpex<T>({
        model,
        instructions: buildOpexNpcInstructions(context),
        prompt: input.prompt,
        schema: input.schema,
        title: input.title,
        origin: input.origin,
        subject: String(campaign._id),
        timeoutMs: MADDOX_OPEX_NPC_TIMEOUT_MS,
        attempts: input.attempts,
        actorLabel: "NPC Opex",
    })
    const memories = opexMemoriesOf(decision)
    if (memories.length) {
        const { saveOpexNpcMemories } = await import("@/features/engramind/server/opex-npcs")
        await saveOpexNpcMemories({ campaignId: String(campaign._id), npcId: String(npc._id), npcName: npc.name }, memories).catch((error: unknown) =>
            log.warn({ npcId: String(npc._id), err: error instanceof Error ? error.message : String(error) }, "[maddox] memórias do NPC Opex não gravadas"),
        )
    }
    return decision
}

/** O que o NPC Opex fala e faz numa narração (`consultar_npc_opex`): uma tentativa, dentro do teto da narração. */
export function decideOpexNpcScene(campaign: CampaignForPrompt, npc: NpcForPrompt, task: OpexNpcSceneTask): Promise<OpexNpcSceneDecision> {
    return decideAsNpc(campaign, npc, { prompt: opexNpcSceneTask(task), schema: opexNpcSceneSchema, origin: MADDOX_OPEX_NPC_CONSUMPTION_ORIGIN, title: `NPC Opex · ${npc.name} · cena`, attempts: 1 })
}

/** A vez do NPC Opex no combate tático: escolhe uma das opções (uma tentativa extra, fora da geração do Maddox). */
export function decideOpexNpcCombat(campaign: CampaignForPrompt, npc: NpcForPrompt, task: OpexNpcCombatTask): Promise<OpexNpcCombatDecision> {
    return decideAsNpc(campaign, npc, { prompt: opexNpcCombatTask(task), schema: opexNpcCombatSchema(task.options), origin: MADDOX_OPEX_NPC_COMBAT_CONSUMPTION_ORIGIN, title: `NPC Opex · ${npc.name} · combate`, attempts: 2 })
}
