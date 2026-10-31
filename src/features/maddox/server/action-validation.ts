import { z } from "zod"
import { loggerFor } from "@/lib/logger"
import { MADDOX_JEV_MODEL, MADDOX_PROFILE_SECTIONS, MADDOX_RIGOR_LEVEL_DEFS, MADDOX_VALIDATION_CONSUMPTION_ORIGIN, MADDOX_VALIDATION_TIMEOUT_MS } from "../constants"
import type { IMaddoxCampaign, IMaddoxCharacter } from "../models"
import { parseJsonObject, rigorBlock } from "./interview-prompt"

/**
 * Validação da ação livre no momento da declaração (Maddox 4) — só nos rigores Rigoroso e Fiel ao D&D
 * (`MADDOX_DECLARATION_VALIDATION_RIGORS`); os demais julgam na narração. Com a chave JEV "Validade de ação livre"
 * ligada decide o JEV; senão, uma geração curta e efêmera do narrador devolve `{ valid, reason }`.
 * Falha do validador ACEITA a declaração (o jogo não trava) e fica no log.
 */

const log = loggerFor({ module: "maddox", feature: "action-validation" })

export interface DeclarationVerdict {
    valid: boolean
    /** Motivo em pt-BR quando inválida. */
    reason: string
}

export interface ValidateDeclarationInput {
    campaign: Pick<IMaddoxCampaign, "_id" | "name" | "rigor" | "setting" | "state">
    character: Pick<IMaddoxCharacter, "name" | "profile" | "currentState"> | null
    content: string
}

const verdictSchema = z.object({ valid: z.boolean(), reason: z.string().optional().default("") })

const ACCEPT: DeclarationVerdict = { valid: true, reason: "" }
const REASON_MAX = 600

const profileOf = (character: ValidateDeclarationInput["character"]): Record<string, string> => {
    if (!character?.profile) return {}
    return character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...character.profile }
}

function characterText(character: ValidateDeclarationInput["character"]): string {
    if (!character) return "(personagem sem perfil)"
    const profile = profileOf(character)
    const sections = MADDOX_PROFILE_SECTIONS.map((section) => (profile[section.key]?.trim() ? `- ${section.label}: ${profile[section.key]!.trim()}` : null)).filter(Boolean)
    return [`Personagem: ${character.name}`, ...sections, `- Condição atual: ${character.currentState?.trim() || "(sem mudanças registradas)"}`].join("\n")
}

const fallbackReason = (input: ValidateDeclarationInput) =>
    `O Maddox considera que essa ação não é possível para ${input.character?.name ?? "o seu personagem"} pelas regras desta campanha (${MADDOX_RIGOR_LEVEL_DEFS[input.campaign.rigor].label}). Reescreva a declaração.`

async function viaJev(input: ValidateDeclarationInput, signal: AbortSignal): Promise<DeclarationVerdict> {
    const { askJevSystemOne } = await import("@/lib/ai/jev")
    const response = await askJevSystemOne({
        model: MADDOX_JEV_MODEL,
        tracking: { feature: "maddox", subject: String(input.campaign._id) },
        signal,
        state: {
            rigor: rigorBlock(input.campaign.rigor),
            cenario: input.campaign.setting ?? "",
            situacao: input.campaign.state?.situation ?? "",
            personagem: characterText(input.character),
            acao: input.content,
        },
        questions: {
            valid: {
                type: "noul",
                instructions: "A ação declarada é possível para este personagem, coerente com as capacidades dele, o cenário e o grau de rigor da campanha?",
                criteria: { true: "O personagem tem os meios para tentar a ação, mesmo que ela possa falhar.", false: "A ação usa capacidades, poderes ou recursos que o personagem não tem, ou viola as regras do cenário ou do rigor." },
            },
        },
    })
    const answer = response.answers?.valid
    if (answer?.type !== "noul") return ACCEPT
    return answer.noul < 0.5 ? { valid: false, reason: fallbackReason(input) } : ACCEPT
}

async function viaNarrator(input: ValidateDeclarationInput, signal: AbortSignal): Promise<DeclarationVerdict> {
    const [{ loadNarrator }, { generateAiText }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream")])
    const { model } = await loadNarrator()
    const instructions = [
        "Você é Maddox, o mestre da campanha. Decida se a ação que um jogador declarou é VÁLIDA: o personagem tem os meios para TENTÁ-LA (capacidades, poderes, equipamentos, condição), de forma coerente com o cenário e o grau de rigor. A ação pode falhar e ainda ser válida; só é inválida o que o personagem não poderia sequer tentar ou o que as regras não permitem.",
        rigorBlock(input.campaign.rigor),
        `## Cenário\n${input.campaign.setting?.trim() || "(sem cenário registrado)"}`,
        `## Situação atual\n${input.campaign.state?.situation?.trim() || "(não registrada)"}`,
        `## ${characterText(input.character)}`,
        'Responda SOMENTE com um objeto JSON: {"valid": true|false, "reason": "quando inválida, explique em uma ou duas frases em português do Brasil, falando com o jogador, o que impede a ação e o que ele poderia tentar"}.',
    ].join("\n\n")
    const { text } = await generateAiText({
        provider: model.provider,
        model: model.model,
        agent: model.agent,
        variant: model.variant,
        instructions,
        prompt: `Ação declarada por ${input.character?.name ?? "o personagem"}: ${input.content}`,
        title: `Maddox · validação · ${input.campaign.name}`,
        consumption: { origin: MADDOX_VALIDATION_CONSUMPTION_ORIGIN, subject: String(input.campaign._id) },
        signal,
    })
    const verdict = verdictSchema.parse(parseJsonObject(text))
    if (verdict.valid) return ACCEPT
    const reason = verdict.reason.trim()
    return { valid: false, reason: reason ? (reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX - 1).trimEnd()}…` : reason) : fallbackReason(input) }
}

/** Rejeita quando o teto passa, mesmo que o provedor ignore o sinal (a requisição do jogador nunca fica presa). */
async function withValidationTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`validação passou de ${MADDOX_VALIDATION_TIMEOUT_MS} ms`))
        }, MADDOX_VALIDATION_TIMEOUT_MS)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

export async function validateDeclaration(input: ValidateDeclarationInput): Promise<DeclarationVerdict> {
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        const verdict = await withValidationTimeout((signal) => (settings.jev["free-action-validity"] ? viaJev(input, signal) : viaNarrator(input, signal)))
        if (!verdict.valid) log.info({ campaignId: String(input.campaign._id), rigor: input.campaign.rigor }, "[maddox] declaração recusada pela validação de ação livre")
        return verdict
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(input.campaign._id) }, "[maddox] validação da ação livre indisponível; a declaração foi aceita")
        return ACCEPT
    }
}
