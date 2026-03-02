/**
 * @fileoverview Service layer for Classes management with CRUD operations and audit logging.
 */

import dbConnect from "@/core/database/db"
import { CharacterClass } from "../models/character-class"
import { logCreate, logUpdate, logDelete } from "@/features/users/api/audit-service"
import { applyFuzzySearch } from "@/core/utils/search-engine"
import type {
    CreateClassInput,
    UpdateClassInput,
    ClassesFilters,
    ClassesListResponse,
    CharacterClass as CharacterClassType,
} from "../types/classes.types"

/**
 * List classes with filters and pagination.
 */
export async function listClasses(
    filters: ClassesFilters,
    page = 1,
    limit = 10,
    isAdmin = false
): Promise<ClassesListResponse> {
    await dbConnect()

    const query: Record<string, unknown> = {}

    if (filters.hitDice && filters.hitDice.length > 0) {
        query.hitDice = { $in: filters.hitDice }
    }

    if (filters.spellcasting && filters.spellcasting.length > 0) {
        query.spellcasting = { $in: filters.spellcasting }
    }

    if (!isAdmin) {
        query.status = "active"
    } else if (filters.status && filters.status !== "all") {
        query.status = filters.status
    }

    const items = await CharacterClass.find(query).sort({ name: 1 }).lean()

    const searchedItems = filters.search ? applyFuzzySearch(items, filters.search) : items

    const total = searchedItems.length
    const offset = (page - 1) * limit
    const paginatedItems = searchedItems.slice(offset, offset + limit)

    return {
        classes: paginatedItems.map((c: any) => ({
            ...c,
            _id: String(c._id),
            subclasses: (c.subclasses || []).map((s: any) => ({
                ...s,
                _id: String(s._id),
            })),
            traits: (c.traits || []).map((t: any) => ({
                ...t,
                _id: String(t._id),
            })),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    }
}

/**
 * Get a single class by ID.
 */
export async function getClassById(id: string, isAdmin = false): Promise<CharacterClassType | null> {
    await dbConnect()

    const doc = await CharacterClass.findById(id).lean()
    if (!doc) return null
    if (!isAdmin && (doc as any).status !== "active") return null

    return {
        ...(doc as any),
        _id: String((doc as any)._id),
        subclasses: ((doc as any).subclasses || []).map((s: any) => ({
            ...s,
            _id: String(s._id),
        })),
        traits: ((doc as any).traits || []).map((t: any) => ({
            ...t,
            _id: String(t._id),
        })),
    }
}

/**
 * Create a new class (admin only).
 */
export async function createClass(
    data: CreateClassInput,
    actorId?: string
): Promise<CharacterClassType> {
    await dbConnect()

    const existing = await CharacterClass.findOne({ name: data.name })
    if (existing) throw new Error("Já existe uma classe com esse nome")

    const doc = await CharacterClass.create(data)

    if (actorId) {
        await logCreate("CharacterClass", String(doc._id), actorId, { name: doc.name }).catch(() => {})
    }

    return {
        ...(doc.toObject() as any),
        _id: String(doc._id),
        subclasses: (doc.subclasses || []).map((s: any) => ({
            ...s,
            _id: String(s._id),
        })),
        traits: (doc.traits || []).map((t: any) => ({
            ...t,
            _id: String(t._id),
        })),
    }
}

/**
 * Update a class (admin only).
 */
export async function updateClass(
    id: string,
    data: UpdateClassInput,
    actorId?: string
): Promise<CharacterClassType> {
    await dbConnect()

    if (data.name) {
        const existing = await CharacterClass.findOne({ name: data.name, _id: { $ne: id } })
        if (existing) throw new Error("Já existe uma classe com esse nome")
    }

    const doc = await CharacterClass.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
    if (!doc) throw new Error("Classe não encontrada")

    if (actorId) {
        await logUpdate("CharacterClass", id, actorId, {}, data as Record<string, unknown>).catch(() => {})
    }

    return {
        ...(doc as any),
        _id: String((doc as any)._id),
        subclasses: ((doc as any).subclasses || []).map((s: any) => ({
            ...s,
            _id: String(s._id),
        })),
        traits: ((doc as any).traits || []).map((t: any) => ({
            ...t,
            _id: String(t._id),
        })),
    }
}

/**
 * Delete a class (admin only).
 */
export async function deleteClass(id: string, actorId?: string): Promise<void> {
    await dbConnect()

    const doc = await CharacterClass.findByIdAndDelete(id)
    if (!doc) throw new Error("Classe não encontrada")

    if (actorId) {
        await logDelete("CharacterClass", id, actorId, { name: doc.name }).catch(() => {})
    }
}

/**
 * Search classes for mention/autocomplete.
 */
export async function searchClasses(query: string, limit = 10): Promise<CharacterClassType[]> {
    await dbConnect()

    const items = await CharacterClass.find({ status: "active" }).sort({ name: 1 }).lean()
    const searched = query ? applyFuzzySearch(items, query) : items

    return searched.slice(0, limit).map((c: any) => ({
        ...c,
        _id: String(c._id),
        subclasses: (c.subclasses || []).map((s: any) => ({
            ...s,
            _id: String(s._id),
        })),
        traits: (c.traits || []).map((t: any) => ({
            ...t,
            _id: String(t._id),
        })),
    }))
}
