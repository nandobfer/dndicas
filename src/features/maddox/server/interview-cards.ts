import type { IMaddoxAbilityScoresCard, IMaddoxHitPointsCard, IMaddoxInterviewMessage } from "../models"

/** Cards da entrevista de personagem (atributos e PV) — leitura pura das mensagens, sem banco. */

/** Último card que vale (o mais novo que não foi substituído). */
export function latestAbilityCard(messages: readonly IMaddoxInterviewMessage[]): { message: IMaddoxInterviewMessage; card: IMaddoxAbilityScoresCard } | null {
    for (let index = messages.length - 1; index >= 0; index--) {
        const card = messages[index]!.abilityScores
        if (card && card.status !== "superseded") return { message: messages[index]!, card }
    }
    return null
}

/**
 * Último envio do card (o que entra na ficha). Um card reaberto pelo Maddox e não reenviado não apaga o envio anterior:
 * vale o mais novo com valores — enviado ou já substituído (`superseded`) —, com o bônus aplicado a ele.
 */
export function submittedAbilityCard(messages: readonly IMaddoxInterviewMessage[]): IMaddoxAbilityScoresCard | null {
    for (let index = messages.length - 1; index >= 0; index--) {
        const card = messages[index]!.abilityScores
        if (card && card.base && card.method && (card.status === "submitted" || card.status === "superseded")) return card
    }
    return null
}

/** Card aberto e nenhum envio ainda: os atributos não estão definidos (a conclusão espera o envio). */
export function abilityCardAwaitingFirstSubmit(messages: readonly IMaddoxInterviewMessage[]): boolean {
    return latestAbilityCard(messages)?.card.status === "pending" && !submittedAbilityCard(messages)
}

/** Último card de PV que vale (o mais novo que não foi substituído). */
export function latestHitPointsCard(messages: readonly IMaddoxInterviewMessage[]): { message: IMaddoxInterviewMessage; card: IMaddoxHitPointsCard } | null {
    for (let index = messages.length - 1; index >= 0; index--) {
        const card = messages[index]!.hitPoints
        if (card && card.status !== "superseded") return { message: messages[index]!, card }
    }
    return null
}

/** Último envio do card de PV (enviado ou já reaberto), como no card de atributos. */
export function submittedHitPointsCard(messages: readonly IMaddoxInterviewMessage[]): IMaddoxHitPointsCard | null {
    for (let index = messages.length - 1; index >= 0; index--) {
        const card = messages[index]!.hitPoints
        if (card && card.choices && (card.status === "submitted" || card.status === "superseded")) return card
    }
    return null
}
