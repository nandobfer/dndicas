import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_OPEX_GENERATION_TIMEOUT_MS, type MaddoxRigorLevel } from "../constants"
import { resolveOpexCharacterModel, type MaddoxResolvedModel } from "../model-resolution"
import type { IMaddoxCampaign, IMaddoxCampaignMember, IMaddoxCharacter } from "../models"
import type { MaddoxSettings } from "../schemas"
import { parseJsonObject } from "./interview-prompt"
import type { OpexPromptContext } from "./opex-prompt"

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

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error("o Personagem Opex demorou demais para decidir"))
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
}

/** Decisão do Opex: JSON validado, com uma nova tentativa. Falha das duas = erro com o motivo (pt-BR). */
export async function decideOpex<T>(input: OpexDecisionInput<T>): Promise<T> {
    const { generateAiText } = await import("@/lib/ai/stream")
    let lastError = ""
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
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
                MADDOX_OPEX_GENERATION_TIMEOUT_MS,
            )
            const parsed = input.schema.safeParse(parseJsonObject(text))
            if (parsed.success) return parsed.data
            lastError = "resposta fora do formato"
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        log.warn({ attempt, err: lastError, subject: input.subject, title: input.title }, "[maddox] decisão do Personagem Opex inválida")
    }
    throw new Error(`O Personagem Opex não conseguiu decidir (${lastError}).`)
}
