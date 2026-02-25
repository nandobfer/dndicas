/**
 * @fileoverview Client-side API functions for Spells feature.
 * Fetch wrappers for calling /api/spells endpoints.
 *
 * @see specs/004-spells-catalog/contracts/spells.yaml
 */

import type {
  Spell,
  CreateSpellInput,
  UpdateSpellInput,
  SpellsFilters,
  SpellsListResponse,
} from '../types/spells.types';

const API_URL = '/api/spells';

/**
 * Fetch a paginated list of spells with filters.
 *
 * @param params - Query filters and pagination parameters
 * @returns Paginated list of spells
 *
 * @example
 * ```ts
 * const response = await fetchSpells({
 *   search: 'fogo',
 *   circles: [3, 5],
 *   schools: ['Evocação'],
 *   page: 1,
 *   limit: 10
 * });
 * ```
 */
export async function fetchSpells(params: SpellsFilters & { page?: number; limit?: number } = {}): Promise<SpellsListResponse> {
  const query = new URLSearchParams();
  
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.circles && params.circles.length > 0) {
    query.append('circles', params.circles.join(','));
  }
  if (params.schools && params.schools.length > 0) {
    query.append('schools', params.schools.join(','));
  }
  if (params.saveAttributes && params.saveAttributes.length > 0) {
    query.append('saveAttributes', params.saveAttributes.join(','));
  }
  if (params.diceTypes && params.diceTypes.length > 0) {
    query.append('diceTypes', params.diceTypes.join(','));
  }
  if (params.status && params.status !== 'all') {
    query.append('status', params.status);
  }

  const res = await fetch(`${API_URL}?${query.toString()}`);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro ao buscar magias');
  }
  
  return res.json();
}

/**
 * Fetch a single spell by ID.
 *
 * @param id - Spell ID
 * @returns Spell document
 *
 * @example
 * ```ts
 * const spell = await fetchSpell('507f1f77bcf86cd799439011');
 * ```
 */
export async function fetchSpell(id: string): Promise<Spell> {
  const res = await fetch(`${API_URL}/${id}`);
  
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Magia não encontrada');
    }
    throw new Error('Erro ao buscar magia');
  }
  
  return res.json();
}

/**
 * Create a new spell (admin only).
 *
 * @param data - Spell creation data
 * @returns Created spell
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
 * });
 * ```
 */
export async function createSpell(data: CreateSpellInput): Promise<Spell> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro ao criar magia');
  }
  
  return res.json();
}

/**
 * Update an existing spell (admin only).
 *
 * @param id - Spell ID
 * @param data - Spell update data (partial)
 * @returns Updated spell
 *
 * @example
 * ```ts
 * const spell = await updateSpell('507f1f77bcf86cd799439011', {
 *   description: 'Descrição atualizada',
 *   status: 'inactive'
 * });
 * ```
 */
export async function updateSpell(id: string, data: UpdateSpellInput): Promise<Spell> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro ao atualizar magia');
  }
  
  return res.json();
}

/**
 * Delete a spell (admin only).
 *
 * @param id - Spell ID
 * @returns Void on success
 *
 * @example
 * ```ts
 * await deleteSpell('507f1f77bcf86cd799439011');
 * ```
 */
export async function deleteSpell(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || 'Erro ao excluir magia');
  }
}
