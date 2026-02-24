/**
 * @fileoverview Client-side API functions for Feats feature.
 * Fetch wrappers for calling /api/feats endpoints.
 *
 * @see specs/003-feats-catalog/contracts/feats.yaml
 */

import {
  Feat,
  CreateFeatInput,
  UpdateFeatInput,
  FeatsFilters,
  FeatsResponse,
} from '../types/feats.types';

const API_URL = '/api/feats';

export async function fetchFeats(params: FeatsFilters = {}): Promise<FeatsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.searchField) query.append('searchField', params.searchField);
  if (params.status && params.status !== 'all') query.append('status', params.status);
  if (params.level) query.append('level', params.level.toString());
  if (params.levelMax) query.append('levelMax', params.levelMax.toString());

  const res = await fetch(`${API_URL}?${query.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch feats');
  }
  return res.json();
}

export async function fetchFeat(id: string): Promise<Feat> {
  const res = await fetch(`${API_URL}/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Feat not found');
    throw new Error('Failed to fetch feat');
  }
  return res.json();
}

export async function createFeat(data: CreateFeatInput): Promise<Feat> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create feat');
  }
  return res.json();
}

export async function updateFeat(id: string, data: UpdateFeatInput): Promise<Feat> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update feat');
  }
  return res.json();
}

export async function deleteFeat(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete feat');
  }
}
