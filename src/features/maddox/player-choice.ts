import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_ABILITY_LABELS } from "./check-modifier"

/**
 * Escolhas que a regra manda o JOGADOR fazer (DND-51) — módulo PURO. O Maddox nunca as decide sozinho: o atributo de
 * conjuração de uma regra que oferece uma lista ("Inteligência, Sabedoria ou Carisma … escolha") e a magia escolhida de
 * uma lista ("dois truques à sua escolha") só são gravados com o trecho de uma mensagem do próprio jogador que diga a
 * escolha (`choice.quote`). Magia nomeada pela regra ("Você sabe Rajada de Veneno") não é escolha.
 */

/** Sem acento, minúsculo, pontuação como espaço, sem a marcação de menção (`[Nome](#mention:…)`) e sem HTML. */
export function normalizeChoiceText(value: string): string {
    return value
        .replace(/\[([^\]\n]+)\]\(#mention:[^)]*\)/g, "$1")
        .replace(/\{\{[^}:]+:([^}]+)\}\}/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

const CASTING = "(inteligencia|sabedoria|carisma)"
const CHOICE_LIST = new RegExp(`${CASTING}\\s+(ou\\s+)?${CASTING}`)

/** O texto da regra oferece uma lista de atributos de conjuração ("Inteligência, Sabedoria ou Carisma"). */
export function offersCastingAttributeChoice(ruleText: string | null | undefined): boolean {
    return CHOICE_LIST.test(normalizeChoiceText(ruleText ?? ""))
}

/** A regra nomeia a magia (concessão fixa); senão, a magia vem de uma lista e é escolha do jogador. */
export function ruleNamesSpell(ruleText: string | null | undefined, spellName: string): boolean {
    const name = normalizeChoiceText(spellName)
    return Boolean(name) && ` ${normalizeChoiceText(ruleText ?? "")} `.includes(` ${name} `)
}

export interface PlayerChoice {
    quote: string
}

export const PLAYER_CHOICE_MISSING = "é escolha do jogador: pergunte a ele e grave com o trecho da resposta dele (`choice.quote`)"
export const PLAYER_CHOICE_NOT_FOUND = "o trecho da escolha não está nas mensagens do jogador"
export const PLAYER_CHOICE_MISMATCH = "o trecho do jogador não cita o que está sendo gravado"

/**
 * Confere a escolha do jogador: o trecho está numa mensagem dele e cita o valor gravado (o nome do atributo ou da magia).
 * `null` = confirmada; senão, o motivo da recusa.
 */
export function checkPlayerChoice(choice: PlayerChoice | null | undefined, value: string, playerTexts: readonly string[]): string | null {
    const quote = normalizeChoiceText(choice?.quote ?? "")
    if (!quote) return PLAYER_CHOICE_MISSING
    if (!playerTexts.some((text) => ` ${normalizeChoiceText(text)} `.includes(` ${quote} `))) return PLAYER_CHOICE_NOT_FOUND
    const wanted = normalizeChoiceText(value)
    if (!wanted || !` ${quote} `.includes(` ${wanted} `)) return PLAYER_CHOICE_MISMATCH
    return null
}

export const castingAttributeLabel = (attribute: AttributeType) => MADDOX_ABILITY_LABELS[attribute]
