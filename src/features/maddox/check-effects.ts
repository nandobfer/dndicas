import { z } from "zod"
import type { SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceType } from "@/features/dice-roller/types"
import { MADDOX_CHECK_KINDS, type MaddoxCheckKind } from "./constants"

/**
 * Efeitos de teste (DND-69) — módulo PURO, servidor e tela. Um efeito de teste é um dado extra que uma magia (Orientação:
 * +1d4 em testes de atributo da perícia escolhida) ou um recurso de classe soma aos testes pedidos pelo Maddox
 * (`request_check`). Ele fica gravado na ficha do personagem que o recebe (`checkEffects`), com a fonte do catálogo; o
 * servidor relê os efeitos na hora da rolagem e os soma como dados próprios, com o resultado de cada um. O dado e o tipo
 * de teste saem do trecho do catálogo (`parseCheckEffectQuote`): o modelo nunca decide quanto somar.
 */

export const MADDOX_CHECK_EFFECT_DICE = ["d4", "d6", "d8", "d10", "d12"] as const satisfies readonly DiceType[]
export type MaddoxCheckEffectDie = (typeof MADDOX_CHECK_EFFECT_DICE)[number]
export const MADDOX_CHECK_EFFECTS_MAX = 10
export const MADDOX_CHECK_EFFECT_NAME_MAX = 80
export const MADDOX_CHECK_EFFECT_DICE_COUNT_MAX = 4

export const checkEffectSchema = z.object({
    id: z.string().min(1).max(60),
    name: z.string().trim().min(1).max(MADDOX_CHECK_EFFECT_NAME_MAX),
    dice: z.object({ count: z.number().int().min(1).max(MADDOX_CHECK_EFFECT_DICE_COUNT_MAX), die: z.enum(MADDOX_CHECK_EFFECT_DICE) }),
    kinds: z.array(z.enum(MADDOX_CHECK_KINDS)).min(1),
    /** Perícia escolhida (Orientação): o efeito só vale nos testes dela. */
    skill: z.string().max(40).nullable(),
    /** Recurso de classe (Inspiração de Bardo): some no primeiro teste em que entra. */
    singleUse: z.boolean(),
    concentration: z.boolean(),
    casterCharacterId: z.string().max(40),
    casterName: z.string().max(MADDOX_CHECK_EFFECT_NAME_MAX),
    /** Duração como o catálogo diz ("Concentração, até 1 minuto"); vale até o Maddox encerrar ou um descanso. */
    duration: z.string().max(200),
    source: z.object({ kind: z.enum(["spell", "resource"]), ref: z.string().max(300), quote: z.string().max(2_000) }),
    campaignId: z.string().max(40),
    turnNumber: z.number().int().min(0),
    createdAt: z.string().max(40),
})
export type MaddoxCheckEffect = z.infer<typeof checkEffectSchema>

/** Situação de um efeito num teste: prévia (pedido), entrou (rolado) ou não entrou (com o motivo). */
export type MaddoxCheckEffectStatus = "expected" | "applied" | "skipped"

/** Efeito como fica gravado no teste (`check.effects`) e chega à tela. */
export interface MaddoxCheckEffectEntry {
    id: string
    name: string
    /** "1d4". */
    dice: string
    status: MaddoxCheckEffectStatus
    /** Resultado de cada dado (só `applied`). */
    results: number[] | null
    /** Por que não entrou (só `skipped`). */
    reason: string | null
}

export interface MaddoxCheckEffectSpec {
    kind: MaddoxCheckKind
    skill: SkillName | string | null
}

/** Lista gravada na ficha (entradas inválidas são ignoradas). */
export function readCheckEffects(raw: unknown): MaddoxCheckEffect[] {
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
        const parsed = checkEffectSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
    })
}

export const diceText = (dice: MaddoxCheckEffect["dice"]) => `${dice.count}${dice.die}`

/** Chave de comparação de nomes (sem acento, caixa e espaços extras). */
export function checkEffectKey(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

/** Texto do catálogo normalizado (sem HTML, acento, caixa e pontuação), igual ao `normalizeCatalogQuote` do servidor. */
export function normalizeEffectText(value: string): string {
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

export interface ParsedCheckEffect {
    dice: MaddoxCheckEffect["dice"]
    kinds: MaddoxCheckKind[]
    /** O texto manda escolher uma perícia (o efeito vale só nos testes dela). */
    requiresSkill: boolean
}

const ALL_KINDS: MaddoxCheckKind[] = ["skill", "ability", "save"]

/**
 * Lê do trecho do catálogo o dado somado e em que testes ele entra. `string` = por que o trecho não serve (o Maddox e
 * o jogador leem). Só dados que SOMAM entram nesta mesa.
 */
export function parseCheckEffectQuote(quote: string): ParsedCheckEffect | string {
    const text = normalizeEffectText(quote)
    if (!text) return "o trecho do catálogo está vazio"
    const dice = [...text.matchAll(/(?:^|\s)(\d{0,2})\s?d\s?(4|6|8|10|12)(?=\s|$)/g)].map((match) => ({ count: Math.max(1, Number(match[1] || 1)), die: `d${match[2]}` as MaddoxCheckEffectDie }))
    const distinct = [...new Set(dice.map((item) => `${item.count}${item.die}`))]
    if (!distinct.length) return "o trecho do catálogo não traz o dado que entra no teste"
    if (distinct.length > 1) return `o trecho do catálogo traz mais de um dado (${distinct.join(", ")}): cite só a frase do dado que entra no teste`
    const [first] = dice
    if (first!.count > MADDOX_CHECK_EFFECT_DICE_COUNT_MAX) return "dados demais para um efeito de teste"
    if (/\b(subtrai\w*|subtrair|deduz\w*|reduz\w*|penalidade)\b/.test(text)) return "o efeito tira dados do teste (ou reduz dano), e só efeitos que somam ao teste entram aqui"
    const kinds = new Set<MaddoxCheckKind>()
    if (/\btestes? de d20\b/.test(text)) ALL_KINDS.forEach((kind) => kinds.add(kind))
    if (/\b(salvaguardas?|testes? de resistencia)\b/.test(text)) kinds.add("save")
    if (/\b(testes? de atributos?|testes? de pericias?|testes? de habilidades?)\b/.test(text)) {
        kinds.add("ability")
        kinds.add("skill")
    }
    if (!kinds.size) return "o trecho do catálogo não diz em que teste (atributo, perícia ou resistência) o dado entra"
    const requiresSkill = /\bpericia (escolhida|a sua escolha|que escolher)\b|\bescolhe uma pericia\b/.test(text)
    return { dice: first!, kinds: ALL_KINDS.filter((kind) => kinds.has(kind)), requiresSkill }
}

const KIND_SCOPE: Record<MaddoxCheckKind, string> = { skill: "testes de perícia", ability: "testes de atributo", save: "testes de resistência" }

/** "testes de Sobrevivência" | "testes de atributo e de perícia" | "testes de resistência". */
export function checkEffectScope(effect: Pick<MaddoxCheckEffect, "kinds" | "skill">): string {
    if (effect.skill) return `testes de ${effect.skill}`
    if (effect.kinds.length === 3) return "testes de d20 (atributo, perícia e resistência)"
    return effect.kinds.map((kind) => KIND_SCOPE[kind]).join(" e ")
}

/** `null` = o efeito entra neste teste; senão, por que não entra. */
export function checkEffectRefusal(effect: Pick<MaddoxCheckEffect, "kinds" | "skill" | "name">, spec: MaddoxCheckEffectSpec): string | null {
    if (effect.skill) {
        if (spec.kind !== "skill" || checkEffectKey(String(spec.skill ?? "")) !== checkEffectKey(effect.skill)) return `vale só em testes de ${effect.skill}`
        return null
    }
    if (!effect.kinds.includes(spec.kind)) return `vale só em ${checkEffectScope(effect)}`
    return null
}

/** Separa os efeitos do personagem entre os que entram no teste e os que não entram (com o motivo). */
export function effectsForCheck(effects: readonly MaddoxCheckEffect[], spec: MaddoxCheckEffectSpec): { applied: MaddoxCheckEffect[]; skipped: { effect: MaddoxCheckEffect; reason: string }[] } {
    const applied: MaddoxCheckEffect[] = []
    const skipped: { effect: MaddoxCheckEffect; reason: string }[] = []
    for (const effect of effects) {
        const reason = checkEffectRefusal(effect, spec)
        if (reason) skipped.push({ effect, reason })
        else applied.push(effect)
    }
    return { applied, skipped }
}

/** "Orientação +1d4 em testes de Sobrevivência (concentração de Lizwan)". */
export function checkEffectLabel(effect: MaddoxCheckEffect): string {
    const extras = [effect.concentration ? `concentração de ${effect.casterName}` : null, effect.singleUse ? "uso único" : null].filter(Boolean)
    return `${effect.name} +${diceText(effect.dice)} em ${checkEffectScope(effect)}${extras.length ? ` (${extras.join("; ")})` : ""}`
}

/** Entrada do teste a partir do efeito. */
export function checkEffectEntry(effect: MaddoxCheckEffect, status: MaddoxCheckEffectStatus, extra: { results?: number[] | null; reason?: string | null } = {}): MaddoxCheckEffectEntry {
    return { id: effect.id, name: effect.name, dice: diceText(effect.dice), status, results: extra.results ?? null, reason: extra.reason ?? null }
}

/** Lê "1d4" de uma entrada gravada (prévia da tela). */
export function entryDice(entry: Pick<MaddoxCheckEffectEntry, "dice">): { count: number; die: MaddoxCheckEffectDie } | null {
    const match = /^(\d+)(d(?:4|6|8|10|12))$/.exec(entry.dice)
    return match ? { count: Number(match[1]), die: match[2] as MaddoxCheckEffectDie } : null
}

/** Lista gravada no teste (`check.effects`), tolerante a documentos antigos. */
export function readCheckEffectEntries(raw: unknown): MaddoxCheckEffectEntry[] {
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const value = item as Record<string, unknown>
        if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.dice !== "string") return []
        const status = value.status === "applied" || value.status === "skipped" ? value.status : "expected"
        return [{ id: value.id, name: value.name, dice: value.dice, status, results: Array.isArray(value.results) ? value.results.filter((n): n is number => typeof n === "number") : null, reason: typeof value.reason === "string" ? value.reason : null }]
    })
}

export const entryTotal = (entry: MaddoxCheckEffectEntry) => (entry.results ?? []).reduce((sum, value) => sum + value, 0)
