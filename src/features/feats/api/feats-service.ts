/**
 * @fileoverview Service layer for Feats management with CRUD operations and audit logging.
 *
 * @see specs/003-feats-catalog/spec.md
 */

import dbConnect from '@/core/database/db';
import { Feat, type IFeat } from '../models/feat';
import { logCreate, logUpdate, logDelete } from '@/features/users/api/audit-service';
import { applyFuzzySearch } from '@/core/utils/search-engine';
import type {
  CreateFeatInput,
  UpdateFeatInput,
  FeatsFilters,
  FeatsResponse,
  FeatSearchResult,
} from '../types/feats.types';

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List feats with filters and pagination.
 *
 * @param filters - Query filters (search, status, level, levelMax, attributes, categories)
 * @param page - Current page number (1-based)
 * @param limit - Items per page (0 = return all)
 * @param isAdmin - Admins see all statuses
 * @returns Paginated list of feats
 */
export async function listFeats(
  filters: FeatsFilters,
  page = 1,
  limit = 10,
  isAdmin = false,
): Promise<FeatsResponse> {
  try {
    await dbConnect();

    const query: Record<string, unknown> = {};

    if (!isAdmin) {
      query.status = 'active';
    } else if (filters.status && filters.status !== 'all') {
      query.status = filters.status;
    }

    if (filters.level) {
      const n = Number(filters.level);
      if (!isNaN(n) && n >= 1 && n <= 20) query.level = n;
    }

    if (filters.levelMax && !filters.level) {
      const n = Number(filters.levelMax);
      if (!isNaN(n) && n >= 1 && n <= 20) query.level = { $lte: n };
    }

    if (filters.attributes && filters.attributes.length > 0) {
      query['attributeBonuses.attribute'] = { $in: filters.attributes };
    }

    if (filters.categories && filters.categories.length > 0) {
      query.category = { $in: filters.categories };
    }

    if (filters.sources && filters.sources.length > 0) {
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.source = { $in: filters.sources.map(s => new RegExp(`^${escapeRegex(s)}`, 'i')) }
    }

    const items = await Feat.find(query as unknown as Parameters<typeof Feat.find>[0])
      .sort({ createdAt: -1 })
      .lean();

    const searchedItems =
      filters.search && filters.search.trim()
        ? applyFuzzySearch(items, filters.search)
        : items;

    const total = searchedItems.length;
    const totalPages = limit ? Math.ceil(total / limit) : 1;
    const offset = (page - 1) * (limit || total);
    const paginatedItems = limit
      ? searchedItems.slice(offset, offset + limit)
      : searchedItems;

    return {
      items: paginatedItems.map((feat) => ({
        ...feat,
        _id: String(feat._id),
      })) as unknown as FeatsResponse['items'],
      total,
      page,
      limit: limit || total,
      totalPages,
    };
  } catch (error) {
    console.error('[FeatsService] Error listing feats:', error);
    throw new Error('Erro ao listar talentos. Por favor, tente novamente.');
  }
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

/**
 * Get a single feat by ID.
 *
 * @param id - Feat MongoDB ObjectId
 * @param isAdmin - Non-admins cannot access inactive feats
 * @returns Feat document or null if not found
 */
export async function getFeatById(id: string, isAdmin = false): Promise<IFeat | null> {
  try {
    await dbConnect();

    const feat = await Feat.findById(id).lean();

    if (!feat) return null;

    if (!isAdmin && feat.status === 'inactive') {
      throw new Error('Talento não encontrado ou inativo.');
    }

    return { ...feat, _id: String(feat._id) } as unknown as IFeat;
  } catch (error) {
    if (error instanceof Error && error.message.includes('não encontrado')) throw error;
    console.error('[FeatsService] Error fetching feat:', error);
    throw new Error('Erro ao buscar talento. Por favor, tente novamente.');
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new feat with audit logging.
 *
 * @param input - Feat creation data
 * @param userId - ID of the user creating the feat (or 'seed-script')
 * @returns Created feat document
 */
export async function createFeat(input: CreateFeatInput, userId: string): Promise<IFeat> {
  try {
    await dbConnect();

    const feat = await Feat.create(input);

    await logCreate('Feat', String(feat._id), userId, feat.toObject() as unknown as Record<string, unknown>);

    return { ...feat.toObject(), _id: String(feat._id) } as unknown as IFeat;
  } catch (error) {
    console.error('[FeatsService] Error creating feat:', error);
    if (error instanceof Error && 'code' in error && (error as { code: number }).code === 11000) {
      throw new Error('Já existe um talento com este nome.');
    }
    throw new Error('Erro ao criar talento. Por favor, tente novamente.');
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Update an existing feat with audit logging.
 *
 * @param id - Feat MongoDB ObjectId
 * @param input - Partial update data
 * @param userId - ID of the user updating the feat
 * @returns Updated feat document or null if not found
 */
export async function updateFeat(
  id: string,
  input: UpdateFeatInput,
  userId: string,
): Promise<IFeat | null> {
  try {
    await dbConnect();

    const previous = await Feat.findById(id).lean();
    if (!previous) return null;

    const updated = await Feat.findByIdAndUpdate(id, { $set: input }, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) return null;

    await logUpdate('Feat', String(updated._id), userId, previous as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);

    return { ...updated, _id: String(updated._id) } as unknown as IFeat;
  } catch (error) {
    console.error('[FeatsService] Error updating feat:', error);
    if (error instanceof Error && 'code' in error && (error as { code: number }).code === 11000) {
      throw new Error('Já existe um talento com este nome.');
    }
    throw new Error('Erro ao atualizar talento. Por favor, tente novamente.');
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a feat with audit logging.
 *
 * @param id - Feat MongoDB ObjectId
 * @param userId - ID of the user deleting the feat
 * @returns Deleted feat document or null if not found
 */
export async function deleteFeat(id: string, userId: string): Promise<IFeat | null> {
  try {
    await dbConnect();

    const feat = await Feat.findById(id).lean();
    if (!feat) return null;

    await Feat.findByIdAndDelete(id);

    await logDelete('Feat', String(feat._id), userId, feat as unknown as Record<string, unknown>);

    return { ...feat, _id: String(feat._id) } as unknown as IFeat;
  } catch (error) {
    console.error('[FeatsService] Error deleting feat:', error);
    throw new Error('Erro ao excluir talento. Por favor, tente novamente.');
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search active feats for the mention system.
 *
 * @param query - Search string
 * @param limit - Max results (undefined = no limit)
 * @returns Array of search result items
 */
export async function searchFeats(query: string, limit?: number): Promise<FeatSearchResult[]> {
  try {
    await dbConnect();

    const feats = await Feat.find({ status: 'active' })
      .select('_id name level description source')
      .sort({ createdAt: -1 })
      .lean();

    const searched = query.trim() ? applyFuzzySearch(feats, query) : feats;
    const results = (limit ? searched.slice(0, limit) : searched).map((feat) => ({
      id: feat._id.toString(),
      _id: feat._id.toString(),
      label: feat.name,
      name: feat.name,
      entityType: 'Talento' as const,
      description: feat.description,
      source: feat.source,
      metadata: {
        level: feat.level,
      },
    }));

    return results;
  } catch (error) {
    console.error('[FeatsService] Error searching feats:', error);
    throw new Error('Erro ao buscar talentos. Por favor, tente novamente.');
  }
}
