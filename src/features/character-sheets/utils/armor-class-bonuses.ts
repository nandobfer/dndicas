import { z } from "zod"

/**
 * Bônus de CA nomeados da ficha (DND-66) — módulo PURO. Cada bônus tem nome, valor, origem e duração; o total da CA soma
 * todos (`computeSheetArmorClass`) e o tooltip mostra cada um pelo nome. A expiração automática (rodadas, concentração,
 * fim do combate, descanso) é decidida aqui e aplicada pelo servidor do Maddox.
 */

export const ARMOR_CLASS_BONUS_ORIGINS = ["spell", "item", "feat", "situation", "other"] as const
export type ArmorClassBonusOrigin = (typeof ARMOR_CLASS_BONUS_ORIGINS)[number]

export const ARMOR_CLASS_BONUS_ORIGIN_LABELS: Record<ArmorClassBonusOrigin, string> = {
    spell: "Magia",
    item: "Item",
    feat: "Talento",
    situation: "Situação",
    other: "Outro",
}

export const ARMOR_CLASS_BONUS_DURATION_KINDS = ["permanent", "rounds", "combat", "concentration", "short-rest", "long-rest", "moment"] as const
export type ArmorClassBonusDurationKind = (typeof ARMOR_CLASS_BONUS_DURATION_KINDS)[number]

/** Durações que dependem de um combate tático em andamento (só o Maddox grava). */
export const COMBAT_BOUND_DURATIONS: readonly ArmorClassBonusDurationKind[] = ["rounds", "combat", "concentration"]

export const ARMOR_CLASS_BONUS_DURATION_LABELS: Record<ArmorClassBonusDurationKind, string> = {
    permanent: "Permanente",
    rounds: "Rodadas",
    combat: "Até o fim do combate",
    concentration: "Concentração",
    "short-rest": "Até o descanso curto",
    "long-rest": "Até o descanso longo",
    moment: "Até um momento declarado",
}

export const ARMOR_CLASS_BONUS_NAME_MAX = 80
export const ARMOR_CLASS_BONUS_MOMENT_MAX = 160
export const ARMOR_CLASS_BONUS_VALUE_MIN = -10
export const ARMOR_CLASS_BONUS_VALUE_MAX = 10
export const ARMOR_CLASS_BONUSES_MAX = 20

export const armorClassBonusDurationSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("permanent") }),
    z.object({ kind: z.literal("rounds"), rounds: z.number().int().min(1).max(100), combatId: z.string().min(1).max(40), untilRound: z.number().int().min(1) }),
    z.object({ kind: z.literal("combat"), combatId: z.string().min(1).max(40) }),
    z.object({ kind: z.literal("concentration"), combatId: z.string().min(1).max(40), casterKey: z.string().min(1).max(80), casterName: z.string().min(1).max(ARMOR_CLASS_BONUS_NAME_MAX), spell: z.string().min(1).max(200) }),
    z.object({ kind: z.literal("short-rest") }),
    z.object({ kind: z.literal("long-rest") }),
    z.object({ kind: z.literal("moment"), moment: z.string().trim().min(1).max(ARMOR_CLASS_BONUS_MOMENT_MAX) }),
])
export type ArmorClassBonusDuration = z.infer<typeof armorClassBonusDurationSchema>

export const armorClassBonusSchema = z.object({
    id: z.string().min(1).max(60),
    name: z.string().trim().min(1).max(ARMOR_CLASS_BONUS_NAME_MAX),
    value: z
        .number()
        .int()
        .min(ARMOR_CLASS_BONUS_VALUE_MIN)
        .max(ARMOR_CLASS_BONUS_VALUE_MAX)
        .refine((value) => value !== 0, "O bônus não pode ser 0."),
    origin: z.enum(ARMOR_CLASS_BONUS_ORIGINS),
    duration: armorClassBonusDurationSchema,
    source: z.object({ ref: z.string().max(300), quote: z.string().max(2_000) }).nullable().optional(),
    campaignId: z.string().max(40).nullable().optional(),
    addedBy: z.enum(["maddox", "player"]).default("player"),
    createdAt: z.string().max(40).optional(),
})
export type ArmorClassBonus = z.infer<typeof armorClassBonusSchema>

/** Lista do PATCH da ficha: nomes únicos e no máximo `ARMOR_CLASS_BONUSES_MAX`. */
export const armorClassBonusListSchema = z
    .array(armorClassBonusSchema)
    .max(ARMOR_CLASS_BONUSES_MAX)
    .refine((list) => new Set(list.map((bonus) => armorClassBonusKey(bonus.name))).size === list.length, "Dois bônus de CA com o mesmo nome.")

/** Chave do nome (sem acento, caixa e espaços extras): o mesmo efeito não se acumula. */
export function armorClassBonusKey(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

export const findArmorClassBonus = (bonuses: readonly ArmorClassBonus[] | null | undefined, name: string) => (bonuses ?? []).find((bonus) => armorClassBonusKey(bonus.name) === armorClassBonusKey(name)) ?? null

/** Lista lida do banco: entradas inválidas são ignoradas (nunca derrubam a conta da CA). */
export function readArmorClassBonuses(value: unknown): ArmorClassBonus[] {
    if (!Array.isArray(value)) return []
    const out: ArmorClassBonus[] = []
    for (const item of value) {
        const parsed = armorClassBonusSchema.safeParse(item)
        if (parsed.success) out.push(parsed.data)
    }
    return out
}

export const sumArmorClassBonuses = (bonuses: readonly Pick<ArmorClassBonus, "value">[] | null | undefined) => (bonuses ?? []).reduce((sum, bonus) => sum + bonus.value, 0)

/** Parcelas para o `getArmorClass` (uma por nome). */
export const armorClassBonusParts = (bonuses: readonly ArmorClassBonus[] | null | undefined) => readArmorClassBonuses(bonuses).map((bonus) => ({ name: bonus.name, value: bonus.value }))

/** Acrescenta ou substitui (mesmo nome) — puro. */
export function upsertArmorClassBonus(bonuses: readonly ArmorClassBonus[], bonus: ArmorClassBonus): { list: ArmorClassBonus[]; replaced: ArmorClassBonus | null } {
    const replaced = findArmorClassBonus(bonuses, bonus.name)
    const list = replaced ? bonuses.map((item) => (item === replaced ? { ...bonus, id: replaced.id } : item)) : [...bonuses, bonus]
    return { list, replaced }
}

export const signedValue = (value: number) => (value >= 0 ? `+${value}` : String(value))

export function armorClassBonusDurationText(duration: ArmorClassBonusDuration): string {
    switch (duration.kind) {
        case "permanent":
            return "permanente"
        case "rounds":
            return `${duration.rounds} rodada${duration.rounds === 1 ? "" : "s"} (até a rodada ${duration.untilRound - 1})`
        case "combat":
            return "até o fim do combate"
        case "concentration":
            return `concentração de ${duration.casterName}`
        case "short-rest":
            return "até o descanso curto"
        case "long-rest":
            return "até o descanso longo"
        case "moment":
            return `até ${duration.moment}`
    }
}

/** "Escudo da Fé +2 (concentração de Ravel)". */
export const armorClassBonusLabel = (bonus: Pick<ArmorClassBonus, "name" | "value" | "duration">) => `${bonus.name} ${signedValue(bonus.value)} (${armorClassBonusDurationText(bonus.duration)})`

export interface ArmorClassExpiryContext {
    /** Combate tático ativo (`null` = nenhum). */
    combatId: string | null
    round: number
    /** Concentração de cada ator do combate ativo (`null` = não concentrado, morto ou fora). */
    concentrationByKey: ReadonlyMap<string, string | null>
    /** O combate `endedCombatId` terminou. */
    endedCombatId?: string | null
    /** Descanso concluído (só os bônus "até o descanso" vencem). */
    rest?: "short" | "long" | null
    /** Só os bônus de outro combate (começo de um combate novo). */
    staleOnly?: boolean
}

export type ArmorClassExpiryReason = "rounds" | "concentration" | "combat-ended" | "stale-combat" | "rest"

export const ARMOR_CLASS_EXPIRY_TEXT: Record<ArmorClassExpiryReason, string> = {
    rounds: "acabaram as rodadas",
    concentration: "a concentração terminou",
    "combat-ended": "fim do combate",
    "stale-combat": "o combate dele já terminou",
    rest: "descanso concluído",
}

/** Por que o bônus vence agora (`null` = continua). */
export function armorClassBonusExpiry(bonus: ArmorClassBonus, context: ArmorClassExpiryContext): ArmorClassExpiryReason | null {
    const duration = bonus.duration
    if (duration.kind === "short-rest") return context.rest ? "rest" : null
    if (duration.kind === "long-rest") return context.rest === "long" ? "rest" : null
    if (duration.kind !== "rounds" && duration.kind !== "combat" && duration.kind !== "concentration") return null
    if (context.rest) return null
    if (context.endedCombatId) return duration.combatId === context.endedCombatId ? "combat-ended" : null
    if (context.combatId !== duration.combatId) return "stale-combat"
    if (context.staleOnly) return null
    if (duration.kind === "rounds") return context.round >= duration.untilRound ? "rounds" : null
    if (duration.kind === "concentration") {
        const spell = context.concentrationByKey.get(duration.casterKey) ?? null
        return spell && armorClassBonusKey(spell) === armorClassBonusKey(duration.spell) ? null : "concentration"
    }
    return null
}

export function expiredArmorClassBonuses(bonuses: readonly ArmorClassBonus[], context: ArmorClassExpiryContext): { bonus: ArmorClassBonus; reason: ArmorClassExpiryReason }[] {
    const out: { bonus: ArmorClassBonus; reason: ArmorClassExpiryReason }[] = []
    for (const bonus of bonuses) {
        const reason = armorClassBonusExpiry(bonus, context)
        if (reason) out.push({ bonus, reason })
    }
    return out
}
