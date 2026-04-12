import type { Charges } from "@/features/shared/charges/types"
import { parseTraitChargeDice } from "@/features/traits/utils/trait-charges"
import type {
    AttributeType,
    CharacterResourceCharge,
    CharacterResourceChargeSource,
    ResourceChargeSourceKind,
} from "../types/character-sheet.types"
import { extractMentionsFromHtml, toMentionKey, type ParsedMention } from "./mention-sync"

interface ResourceChargeCalcContext {
    level: number
    proficiencyBonus: number
    attributeModifiers: Record<AttributeType, number>
}

interface ChargeBoundEntity {
    entityId: string
    entityType: CharacterResourceChargeSource["entityType"]
    kind: ResourceChargeSourceKind
    nameHtml: string
    charges?: Charges
}

export function createResourceChargeId() {
    return `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function clampResourceChargeRow(row: CharacterResourceCharge): CharacterResourceCharge {
    const total = Math.max(0, Math.trunc(row.total))
    const used = Math.max(0, Math.min(total, Math.trunc(row.used)))
    return { ...row, total, used }
}

export function resolveChargesTotal(charges: Charges | undefined, context: ResourceChargeCalcContext): number | null {
    if (!charges) return null

    if (charges.mode === "fixed") {
        return parseChargeCountValue(charges.value)
    }

    if (charges.mode === "proficiency") {
        return context.proficiencyBonus
    }

    if (charges.mode === "attribute") {
        return context.attributeModifiers[mapCatalogAttribute(charges.attribute)] ?? 0
    }

    const row = charges.values.find((value) => value.level === context.level)
    return row ? parseChargeCountValue(row.value) : null
}

export function extractResourceChargeMention(nameHtml: string): ParsedMention | null {
    const mentions = extractMentionsFromHtml(nameHtml)
    return mentions.find((mention) => mention.entityType === "Habilidade" || mention.entityType === "Talento" || mention.entityType === "Item") ?? null
}

export function buildBoundResourceCharge(
    entity: ChargeBoundEntity,
    context: ResourceChargeCalcContext,
    existing?: CharacterResourceCharge | null
): CharacterResourceCharge | null {
    const total = resolveChargesTotal(entity.charges, context)
    if (total === null) return null

    return clampResourceChargeRow({
        id: existing?.id ?? createResourceChargeId(),
        name: entity.nameHtml,
        total,
        used: existing?.used ?? 0,
        source: {
            kind: entity.kind,
            entityType: entity.entityType,
            entityId: entity.entityId,
        },
    })
}

export function syncResourceChargeRows(
    currentRows: CharacterResourceCharge[],
    desiredRows: CharacterResourceCharge[]
): CharacterResourceCharge[] {
    const desiredBySource = new Map(
        desiredRows
            .filter((row): row is CharacterResourceCharge & { source: NonNullable<CharacterResourceCharge["source"]> } => !!row.source)
            .map((row) => [toMentionKey({ id: row.source.entityId, entityType: row.source.entityType }), row])
    )

    const nextRows: CharacterResourceCharge[] = []

    for (const row of currentRows) {
        if (!row.source || row.source.kind === "manual-name-mention") {
            nextRows.push(clampResourceChargeRow(row))
            continue
        }

        const key = toMentionKey({ id: row.source.entityId, entityType: row.source.entityType })
        const desired = desiredBySource.get(key)
        if (!desired) {
            continue
        }

        nextRows.push(clampResourceChargeRow({ ...desired, id: row.id, used: row.used }))
        desiredBySource.delete(key)
    }

    for (const desired of desiredRows) {
        if (!desired.source) continue
        const key = toMentionKey({ id: desired.source.entityId, entityType: desired.source.entityType })
        if (!desiredBySource.has(key)) continue
        nextRows.push(clampResourceChargeRow(desired))
        desiredBySource.delete(key)
    }

    return nextRows
}

function parseChargeCountValue(value: string): number | null {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10)
    }

    const dice = parseTraitChargeDice(trimmed)
    return dice?.quantidade ?? null
}

function mapCatalogAttribute(attribute: string): AttributeType {
    const map: Record<string, AttributeType> = {
        Força: "strength",
        Destreza: "dexterity",
        Constituição: "constitution",
        Inteligência: "intelligence",
        Sabedoria: "wisdom",
        Carisma: "charisma",
    }

    return map[attribute] ?? "wisdom"
}
