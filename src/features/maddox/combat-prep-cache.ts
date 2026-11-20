import { createHash } from "node:crypto"
import type { CombatSheetChange } from "./combat-prep-schemas"
import type { CombatPrepOverlay, PreparedCombatOption } from "./combat-types"

/**
 * Cache da preparação da mesa de combate (DND-78) — parte pura. A impressão digital da ficha é dividida em partes: a
 * base (`core`: nível, classe, espécie, atributos, proficiências, conjuração, maestrias…, que mexe em todas as opções) e
 * uma parte por ataque, item, característica, talento, magia e recurso com cargas. Fica de fora o que muda no jogo e não
 * mexe nas opções: PV, cargas e espaços usados, moedas, quantidade exata, bônus de CA temporários e os `updatedAt`.
 */

export interface PrepSheetSnapshot {
    core: Record<string, unknown>
    attacks: { id: string; name: string; attackBonus: string; damageType: unknown }[]
    items: { id: string; name: string; equipped: boolean; catalogItemId: string | null; catalogItemType: string | null; available: boolean }[]
    traits: { id: string; name: string; description: string; catalogId: string | null }[]
    feats: { id: string; name: string; description: string; catalogId: string | null }[]
    spells: { id: string; name: string; circle: number | null; prepared: boolean; castingTime: string; concentration: boolean; catalogId: string | null }[]
    charges: { id: string; name: string; total: number }[]
}

export interface PrepFingerprint {
    /** Versão do cache, instruções da preparação e grau da campanha. */
    context: string
    core: string
    /** `attack:<id>`, `item:<id>`, `trait:<id>`, `feat:<id>`, `spell:<id>`, `charge:<id>` → hash. */
    parts: Record<string, string>
    /** Rótulo legível de cada parte (para dizer o que mudou, inclusive o que saiu da ficha). */
    names: Record<string, string>
}

/** JSON com as chaves em ordem (o hash não depende da ordem dos campos no banco). */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value instanceof Date) return value.toISOString()
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        if (typeof (record as { toHexString?: unknown }).toHexString === "function") return String(value)
        return Object.fromEntries(
            Object.keys(record)
                .sort()
                .filter((key) => record[key] !== undefined)
                .map((key) => [key, canonical(record[key])]),
        )
    }
    return value
}

export const stableHash = (value: unknown): string => createHash("sha1").update(JSON.stringify(canonical(value) ?? null)).digest("hex")

const PART_LABELS = { attack: "Ataque", item: "Item", trait: "Característica", feat: "Talento", spell: "Magia", charge: "Recurso" } as const

/** Impressão digital da ficha (por partes) e do contexto da preparação. */
export function prepFingerprint(snapshot: PrepSheetSnapshot, context: { version: number; instructions: string; rigor: string }): PrepFingerprint {
    const parts: Record<string, string> = {}
    const names: Record<string, string> = {}
    const add = (kind: keyof typeof PART_LABELS, entry: { id: string; name: string }) => {
        const key = `${kind}:${entry.id}`
        parts[key] = stableHash(entry)
        names[key] = `${PART_LABELS[kind]}: ${entry.name.trim() || "sem nome"}`
    }
    for (const attack of snapshot.attacks) add("attack", attack)
    for (const item of snapshot.items) add("item", item)
    for (const trait of snapshot.traits) add("trait", trait)
    for (const feat of snapshot.feats) add("feat", feat)
    for (const spell of snapshot.spells) add("spell", spell)
    for (const charge of snapshot.charges) add("charge", charge)
    return { context: stableHash(context), core: stableHash(snapshot.core), parts, names }
}

export const PREP_FULL_REASONS = {
    none: null,
    context: "as instruções ou as regras da preparação mudaram",
    core: "a base da ficha mudou (nível, classe, espécie, atributos, proficiências ou conjuração)",
    sheet: "a ficha do personagem é outra",
    catalog: "o catálogo do DnDicas mudou",
    invalidated: "o dono da campanha pediu a repreparação da ficha",
} as const

export type PrepCacheDecision =
    | { kind: "hit" }
    | { kind: "partial"; changed: string[]; added: string[]; removed: string[] }
    | { kind: "full"; reason: string | null }

/** Compara a impressão guardada com a atual: igual, só algumas partes, ou a ficha inteira (base ou contexto mudou). */
export function diffPrepFingerprint(cached: PrepFingerprint | null, current: PrepFingerprint): PrepCacheDecision {
    if (!cached) return { kind: "full", reason: PREP_FULL_REASONS.none }
    if (cached.context !== current.context) return { kind: "full", reason: PREP_FULL_REASONS.context }
    if (cached.core !== current.core) return { kind: "full", reason: PREP_FULL_REASONS.core }
    const changed: string[] = []
    const added: string[] = []
    const removed: string[] = []
    for (const [key, hash] of Object.entries(current.parts)) {
        if (!(key in cached.parts)) added.push(key)
        else if (cached.parts[key] !== hash) changed.push(key)
    }
    for (const key of Object.keys(cached.parts)) if (!(key in current.parts)) removed.push(key)
    if (!changed.length && !added.length && !removed.length) return { kind: "hit" }
    return { kind: "partial", changed, added, removed }
}

/** Rótulos do que mudou, para o card ("Item: Espada (novo)", "Magia: Bola de Fogo (alterada)", "…(removido)"). */
export function changedPartLabels(decision: Extract<PrepCacheDecision, { kind: "partial" }>, cached: PrepFingerprint, current: PrepFingerprint): string[] {
    return [
        ...decision.added.map((key) => `${current.names[key] ?? key} (novo)`),
        ...decision.changed.map((key) => `${current.names[key] ?? key} (alterado)`),
        ...decision.removed.map((key) => `${cached.names[key] ?? key} (removido)`),
    ]
}

/** Parte da ficha de que uma opção da lista base depende (pelo id estável da opção); `core` quando não dá para saber. */
export function optionDeps(optionId: string): string[] {
    const [kind, ...rest] = optionId.split(":")
    const first = rest[0]
    if (!first) return ["core"]
    if (kind === "weapon" || kind === "offhand" || kind === "cleave" || kind === "item") return [`item:${first}`]
    if (kind === "spell") return [`spell:${first}`]
    if (kind === "ability" && (first === "trait" || first === "feat") && rest[1]) return [`${first}:${rest[1]}`]
    return ["core"]
}

/** Partes de que uma opção acrescentada pelo Maddox depende: o recurso e o item que ela gasta; senão, a base. */
export function addedOptionDeps(option: Pick<PreparedCombatOption, "requires">): string[] {
    const deps = [...(option.requires?.chargeId ? [`charge:${option.requires.chargeId}`] : []), ...(option.requires?.itemId ? [`item:${option.requires.itemId}`] : [])]
    return deps.length ? deps : ["core"]
}

const touches = (deps: readonly string[], stale: ReadonlySet<string>) => deps.some((dep) => stale.has(dep))

/**
 * Tira do overlay guardado os ajustes que dependem de partes que mudaram ou saíram da ficha (o resto continua valendo).
 * Os mantidos ficam marcados como vindos do cache.
 */
export function pruneOverlay(overlay: CombatPrepOverlay, stale: ReadonlySet<string>): CombatPrepOverlay {
    const cached = <T extends object>(entry: T) => ({ ...entry, fromCache: true })
    return {
        modify: overlay.modify.filter((entry) => !touches(optionDeps(entry.optionId), stale)).map(cached),
        remove: overlay.remove.filter((entry) => !touches(optionDeps(entry.optionId), stale)).map(cached),
        add: overlay.add.filter((entry) => !touches(entry.deps?.length ? entry.deps : addedOptionDeps(entry.option), stale)).map(cached),
        suppress: [...overlay.suppress],
    }
}

/** Quantos ajustes o overlay tem (alterações, remoções e acréscimos). */
export const overlaySize = (overlay: CombatPrepOverlay) => overlay.modify.length + overlay.remove.length + overlay.add.length

/**
 * Parte da ficha que uma correção mexe: a parte (`attack:<id>`…), `new` (criação, sem id) ou `core` (base da ficha).
 * Na preparação parcial, só passa a correção de uma parte que mudou ou a criação.
 */
export function sheetChangePart(change: CombatSheetChange): string {
    switch (change.type) {
        case "charge-upsert":
            return change.chargeId ? `charge:${change.chargeId}` : "new"
        case "attack-upsert":
            return change.attackId ? `attack:${change.attackId}` : "new"
        case "attack-remove":
            return `attack:${change.attackId}`
        case "trait-upsert":
            return change.id ? `trait:${change.id}` : "new"
        case "feat-upsert":
            return change.id ? `feat:${change.id}` : "new"
        case "trait-remove":
            return `trait:${change.id}`
        case "feat-remove":
            return `feat:${change.id}`
        case "spell-update":
        case "spell-remove":
            return `spell:${change.spellId}`
        case "spell-add":
        case "item-add":
            return "new"
        case "item-equip":
        case "item-remove":
        case "item-quantity":
            return `item:${change.itemId}`
        default:
            return "core"
    }
}
