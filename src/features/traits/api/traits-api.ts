// src/features/traits/api/traits-api.ts
import { Trait, CreateTraitInput, TraitsFilters, TraitsResponse, UpdateTraitInput } from '../types/traits.types';

const API_URL = '/api/traits';

export async function fetchTraits(params: TraitsFilters = {}): Promise<TraitsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.status && params.status !== 'all') query.append('status', params.status);

  const res = await fetch(`${API_URL}?${query.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch traits');
  }
  return res.json();
}

export async function fetchTraitById(id: string): Promise<Trait> {
  const res = await fetch(`${API_URL}/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Trait not found');
    throw new Error('Failed to fetch trait');
  }
  return res.json();
}

export async function createTrait(data: CreateTraitInput): Promise<Trait> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create trait');
  }
  return res.json();
}

export async function updateTrait(id: string, data: UpdateTraitInput): Promise<Trait> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update trait');
  }
  return res.json();
}

export async function deleteTrait(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete trait');
  }
}

export async function searchTraitsForMentions(query: string): Promise<Trait[]> {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error('Failed to search traits');
  }
  const data = await res.json();
  return data.items || [];
}
