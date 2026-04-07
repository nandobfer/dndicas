/**
 * @fileoverview Service layer for Items management with CRUD operations and audit logging.
 */

import dbConnect from '@/core/database/db';
import { ItemModel, type IItem } from '../database/item';
import { logCreate } from '@/features/users/api/audit-service';
import type { CreateItemInput } from '../types/items.types';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new item with audit logging.
 *
 * @param input - Item creation data
 * @param userId - ID of the user creating the item (or 'seed-script')
 * @returns Created item document
 */
export async function createItem(input: CreateItemInput, userId: string): Promise<IItem> {
  try {
    await dbConnect();

    const item = await ItemModel.create(input);

    await logCreate('Item', String(item._id), userId, item.toObject() as unknown as Record<string, unknown>);

    return { ...item.toObject(), _id: String(item._id) } as unknown as IItem;
  } catch (error) {
    console.error('[ItemsService] Error creating item:', error);
    if (error instanceof Error && 'code' in error && (error as { code: number }).code === 11000) {
      throw new Error('Já existe um item com este nome.');
    }
    throw new Error('Erro ao criar item. Por favor, tente novamente.');
  }
}
