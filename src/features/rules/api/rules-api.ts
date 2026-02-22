// src/features/rules/api/rules-api.ts
import { Reference, CreateReferenceInput, RulesFilters, RulesResponse, UpdateReferenceInput } from '../types/rules.types';

const API_URL = '/api/rules';

export async function fetchRules(params: RulesFilters = {}): Promise<RulesResponse> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.status && params.status !== 'all') query.append('status', params.status);

  const res = await fetch(`${API_URL}?${query.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch rules');
  }
  return res.json();
}

export async function fetchRule(id: string): Promise<Reference> {
  const res = await fetch(`${API_URL}/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Rule not found');
    throw new Error('Failed to fetch rule');
  }
  return res.json();
}

export async function createRule(data: CreateReferenceInput): Promise<Reference> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create rule');
  }
  return res.json();
}

export async function updateRule(id: string, data: UpdateReferenceInput): Promise<Reference> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update rule');
  }
  return res.json();
}

export async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete rule');
  }
}
