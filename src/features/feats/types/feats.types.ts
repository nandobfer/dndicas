/**
 * @fileoverview TypeScript type definitions for Feats feature.
 * 
 * @see specs/003-feats-catalog/data-model.md
 */

export interface Feat {
  _id: string;
  name: string;
  description: string;
  source: string;
  level: number;
  prerequisites: string[];
  status: 'active' | 'inactive';
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface CreateFeatInput {
  name: string;
  description: string;
  source: string;
  level?: number; // Optional, defaults to 1
  prerequisites?: string[]; // Optional, defaults to []
  status: 'active' | 'inactive';
}

export interface UpdateFeatInput {
  name?: string;
  description?: string;
  source?: string;
  level?: number;
  prerequisites?: string[];
  status?: 'active' | 'inactive';
}

export interface FeatsFilters {
  page?: number;
  limit?: number;
  search?: string;
  searchField?: 'all' | 'name';
  status?: 'all' | 'active' | 'inactive';
  level?: number; // Exact match
  levelMax?: number; // Range (1 to levelMax)
}

export interface FeatsResponse {
  items: Feat[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FeatSearchResult {
  id: string;
  label: string;
  entityType: 'Talento';
}
