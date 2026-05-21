import "server-only"

import dbConnect from "@/core/database/db"
import { clampDiceValue, getDiceFaces } from "../dice-utils"
import { DiceRollOverride, type IDiceRollOverride } from "../models/dice-roll-override"
import type { DiceRollOverrideInput, DiceRollOverrideRecord, DiceType } from "../types"
import type { DiceTarget } from "./dice-target"

function toOverrideRecord(doc: IDiceRollOverride | (Partial<IDiceRollOverride> & { _id: unknown })): DiceRollOverrideRecord {
    return {
        id: String(doc._id),
        scope: doc.scope as "local" | "owlbear",
        targetId: String(doc.targetId),
        dice: doc.dice as DiceType,
        min: typeof doc.min === "number" ? doc.min : undefined,
        max: typeof doc.max === "number" ? doc.max : undefined,
        exact: typeof doc.exact === "number" ? doc.exact : undefined,
        remainingUses: typeof doc.remainingUses === "number" ? doc.remainingUses : 1,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : undefined,
        updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : undefined,
    }
}

function normalizeOverride(input: DiceRollOverrideInput): DiceRollOverrideInput {
    if (typeof input.exact === "number") {
        return {
            dice: input.dice,
            exact: clampDiceValue(input.dice, input.exact),
        }
    }

    const faces = getDiceFaces(input.dice)
    const min = clampDiceValue(input.dice, input.min ?? 1)
    const max = clampDiceValue(input.dice, input.max ?? faces)

    return {
        dice: input.dice,
        min: Math.min(min, max),
        max: Math.max(min, max),
    }
}

export async function upsertDiceOverride(target: DiceTarget, input: DiceRollOverrideInput) {
    await dbConnect()

    const normalized = normalizeOverride(input)
    const update = {
        $set: {
            scope: target.scope,
            targetId: target.targetId,
            dice: normalized.dice,
            min: normalized.min,
            max: normalized.max,
            exact: normalized.exact,
            remainingUses: 1,
        },
        $unset: {
            ...(normalized.exact !== undefined ? { min: "", max: "" } : { exact: "" }),
        },
    }

    const doc = await DiceRollOverride.findOneAndUpdate(
        {
            scope: target.scope,
            targetId: target.targetId,
            dice: normalized.dice,
        },
        update,
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }
    )

    return toOverrideRecord(doc)
}

export async function listDiceOverrides(target: DiceTarget) {
    await dbConnect()

    const docs = await DiceRollOverride.find({
        scope: target.scope,
        targetId: target.targetId,
    })
        .sort({ updatedAt: -1 })
        .lean()

    return docs.map(toOverrideRecord)
}

export async function getPendingDiceOverride(target: DiceTarget, dice: DiceType) {
    await dbConnect()

    const doc = await DiceRollOverride.findOne({
        scope: target.scope,
        targetId: target.targetId,
        dice,
        remainingUses: { $gt: 0 },
    }).lean()

    return doc ? toOverrideRecord(doc) : null
}

export async function consumeDiceOverride(id: string) {
    await dbConnect()
    await DiceRollOverride.deleteOne({ _id: id })
}

export async function clearDiceOverrides(target: DiceTarget, dice?: DiceType) {
    await dbConnect()

    const result = await DiceRollOverride.deleteMany({
        scope: target.scope,
        targetId: target.targetId,
        ...(dice ? { dice } : {}),
    })

    return { deletedCount: result.deletedCount ?? 0 }
}
