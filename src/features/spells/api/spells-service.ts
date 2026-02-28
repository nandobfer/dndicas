/**
 * @fileoverview Service layer for Spells management with CRUD operations and audit logging.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004 to FR-010
 */

import dbConnect from '@/core/database/db';
import { Spell, type ISpell } from '../models/spell';
import { logCreate, logUpdate, logDelete } from '@/features/users/api/audit-service';
import { applyFuzzySearch } from "@/core/utils/search-engine"
import type {
  CreateSpellInput,
  UpdateSpellInput,
  SpellsFilters,
  SpellsListResponse,
} from '../types/spells.types';

/**
 * List spells with filters and pagination.
 *
 * @param filters - Query filters (search, circles, schools, saveAttributes, diceTypes, status)
 * @param page - Current page number (1-based)
 * @param limit - Items per page
 * @param isAdmin - Whether the requester is an admin (admins see all statuses)
 * @returns Paginated list of spells
 *
 * @example
 * ```ts
 * const result = await listSpells(
 *   { search: 'fogo', circles: [3], schools: ['Evocação'] },
 *   1,
 *   10,
 *   false
 * );
 * ```
 */
export async function listSpells(
  filters: SpellsFilters,
  page = 1,
  limit = 10,
  isAdmin = false
): Promise<SpellsListResponse> {
  try {
      await dbConnect()

      // Build query
      const query: Record<string, unknown> = {}

      // Circle filter
      if (filters.circles && filters.circles.length > 0) {
          query.circle = { $in: filters.circles }
      }

      // School filter
      if (filters.schools && filters.schools.length > 0) {
          query.school = { $in: filters.schools }
      }

      // Save attribute filter
      if (filters.saveAttributes && filters.saveAttributes.length > 0) {
          query.saveAttribute = { $in: filters.saveAttributes }
      }

      // Dice type filter (base dice or extra dice per level)
      if (filters.diceTypes && filters.diceTypes.length > 0) {
          query.$or = [{ "baseDice.tipo": { $in: filters.diceTypes } }, { "extraDicePerLevel.tipo": { $in: filters.diceTypes } }]
      }

      // Status filter
      if (!isAdmin) {
          query.status = "active"
      } else if (filters.status) {
          query.status = filters.status
      }

      // Fetch ALL items matching filters (except search) to apply fuzzy search locally
      const items = await Spell.find(query).sort({ circle: 1, name: 1 }).lean()

      // Apply fuzzy search locally using the shared function
      const searchedItems = filters.search ? applyFuzzySearch(items, filters.search) : items

      const total = searchedItems.length
      const totalPages = limit ? Math.ceil(total / limit) : 1

      // Manual pagination
      const offset = (page - 1) * limit
      const paginatedItems = searchedItems.slice(offset, offset + limit)

      return {
          spells: paginatedItems.map((spell: any) => ({
              ...spell,
              _id: String(spell._id),
              circleLabel: spell.circle === 0 ? "Truque" : `${spell.circle}º Círculo`
          })),
          total,
          page,
          limit,
          totalPages
      }
  } catch (error) {
    console.error('[SpellsService] Error listing spells:', error);
    throw new Error('Erro ao listar magias. Por favor, tente novamente.');
  }
}

/**
 * Get a single spell by ID.
 *
 * @param id - Spell ID
 * @param isAdmin - Whether the requester is an admin
 * @returns Spell document or null if not found
 * @throws Error if spell is inactive and requester is not admin
 *
 * @example
 * ```ts
 * const spell = await getSpellById('507f1f77bcf86cd799439011', false);
 * ```
 */
export async function getSpellById(
  id: string,
  isAdmin = false
): Promise<ISpell | null> {
  try {
    await dbConnect();

    const spell = await Spell.findById(id).lean();

    if (!spell) {
      return null;
    }

    // Non-admins can only see active spells
    if (!isAdmin && spell.status === 'inactive') {
      throw new Error('Magia não encontrada ou inativa.');
    }

    return {
      ...spell,
      _id: String(spell._id),
      circleLabel: spell.circle === 0 ? 'Truque' : `${spell.circle}º Círculo`,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('não encontrada')) {
      throw error;
    }
    console.error('[SpellsService] Error fetching spell:', error);
    throw new Error('Erro ao buscar magia. Por favor, tente novamente.');
  }
}

/**
 * Create a new spell with audit logging.
 *
 * @param input - Spell creation data
 * @param userId - ID of the user creating the spell
 * @returns Created spell document
 * @throws Error if validation fails or creation fails
 *
 * @example
 * ```ts
 * const spell = await createSpell({
 *   name: 'Bola de Fogo',
 *   description: 'Uma explosão de fogo...',
 *   circle: 3,
 *   school: 'Evocação',
 *   baseDice: { quantidade: 8, tipo: 'd6' },
 *   status: 'active'
 * }, 'clerkUserId123');
 * ```
 */
export async function createSpell(
  input: CreateSpellInput,
  userId: string
): Promise<ISpell> {
  try {
    await dbConnect();

    // Create spell
    const spell = await Spell.create(input);

    // Audit log
    await logCreate(
      'Spell',
      String(spell._id),
      userId,
      spell.toObject()
    );

    return {
      ...spell.toObject(),
      _id: String(spell._id),
      circleLabel: spell.circle === 0 ? 'Truque' : `${spell.circle}º Círculo`,
    };
  } catch (error) {
    console.error('[SpellsService] Error creating spell:', error);

    // Handle duplicate name error
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new Error('Já existe uma magia com este nome.');
    }

    throw new Error('Erro ao criar magia. Por favor, tente novamente.');
  }
}

/**
 * Update an existing spell with audit logging.
 *
 * @param id - Spell ID
 * @param input - Spell update data (partial)
 * @param userId - ID of the user updating the spell
 * @returns Updated spell document or null if not found
 * @throws Error if update fails
 *
 * @example
 * ```ts
 * const spell = await updateSpell(
 *   '507f1f77bcf86cd799439011',
 *   { description: 'Descrição atualizada', status: 'inactive' },
 *   'clerkUserId123'
 * );
 * ```
 */
export async function updateSpell(
  id: string,
  input: UpdateSpellInput,
  userId: string
): Promise<ISpell | null> {
  try {
    await dbConnect();

    // Fetch previous state for audit log
    const previousSpell = await Spell.findById(id).lean();

    if (!previousSpell) {
      return null;
    }

    // Update spell
    const updatedSpell = await Spell.findByIdAndUpdate(
      id,
      { $set: input },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedSpell) {
      return null;
    }

    // Audit log
    await logUpdate(
      'Spell',
      String(updatedSpell._id),
      userId,
      previousSpell,
      updatedSpell
    );

    return {
      ...updatedSpell,
      _id: String(updatedSpell._id),
      circleLabel: updatedSpell.circle === 0 ? 'Truque' : `${updatedSpell.circle}º Círculo`,
    };
  } catch (error) {
    console.error('[SpellsService] Error updating spell:', error);

    // Handle duplicate name error
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new Error('Já existe uma magia com este nome.');
    }

    throw new Error('Erro ao atualizar magia. Por favor, tente novamente.');
  }
}

/**
 * Delete a spell with audit logging.
 *
 * @param id - Spell ID
 * @param userId - ID of the user deleting the spell
 * @returns Deleted spell document or null if not found
 * @throws Error if deletion fails
 *
 * @example
 * ```ts
 * const deleted = await deleteSpell('507f1f77bcf86cd799439011', 'clerkUserId123');
 * ```
 */
export async function deleteSpell(
  id: string,
  userId: string
): Promise<ISpell | null> {
  try {
    await dbConnect();

    // Fetch spell for audit log before deletion
    const spell = await Spell.findById(id).lean();

    if (!spell) {
      return null;
    }

    // Delete spell
    await Spell.findByIdAndDelete(id);

    // Audit log
    await logDelete(
      'Spell',
      String(spell._id),
      userId,
      spell
    );

    return {
      ...spell,
      _id: String(spell._id),
      circleLabel: spell.circle === 0 ? 'Truque' : `${spell.circle}º Círculo`,
    };
  } catch (error) {
    console.error('[SpellsService] Error deleting spell:', error);
    throw new Error('Erro ao excluir magia. Por favor, tente novamente.');
  }
}
