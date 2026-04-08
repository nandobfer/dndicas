// src/features/items/api/items-api.ts
import { Item, CreateItemInput, ItemFilterParams, ItemsResponse, UpdateItemInput } from "../types/items.types"

const API_URL = "/api/items"

export async function fetchItems(params: ItemFilterParams = {}): Promise<ItemsResponse> {
    const query = new URLSearchParams()
    if (params.page) query.append("page", params.page.toString())
    if (params.limit) query.append("limit", params.limit.toString())
    if (params.search) query.append("search", params.search)
    if (params.type && params.type !== "all") query.append("type", params.type)
    if (params.rarity && params.rarity !== "all") query.append("rarity", params.rarity)
    if (params.status && params.status !== "all") query.append("status", params.status)
    if (params.sources && params.sources.length > 0) query.append("sources", params.sources.join(","))

    const res = await fetch(`${API_URL}?${query.toString()}`)
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.message || "Failed to fetch items")
    }
    return res.json()
}

export async function fetchItemById(id: string): Promise<Item> {
  const res = await fetch(`${API_URL}/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Item not found');
    throw new Error('Failed to fetch item');
  }
  return res.json();
}

export async function createItem(data: CreateItemInput): Promise<Item> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create item');
  }
  return res.json();
}

export async function updateItem(id: string, data: UpdateItemInput): Promise<Item> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update item');
  }
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete item');
  }
}

export async function searchItemsForMentions(query: string): Promise<Item[]> {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error('Failed to search items');
  }
  const data = await res.json();
  return data.items || [];
}
