/**
 * @fileoverview TypeScript type definitions for Feats feature.
 * 
 * @see specs/003-feats-catalog/data-model.md
 */

import type { FeatCategory } from "../lib/feat-categories"
import type { Charges } from "@/features/shared/charges/types"
export type { FeatCategory }

export interface Feat {
    _id: string
    name: string
    originalName?: string
    description: string
    charges?: Charges
    source: string
    level: number
    prerequisites: string[]
    attributeBonuses: {
        attribute: string
        value: number
    }[]
    category?: FeatCategory
    status: "active" | "inactive"
    createdAt: string // ISO 8601
    updatedAt: string
}

export interface CreateFeatInput {
    name: string
    originalName?: string
    description: string
    charges?: Charges
    source: string
    level?: number // Optional, defaults to 1
    prerequisites?: string[] // Optional, defaults to []
    attributeBonuses?: {
        attribute: string
        value: number
    }[]
    category?: FeatCategory
    status: "active" | "inactive"
}

export interface UpdateFeatInput {
    name?: string
    originalName?: string
    description?: string
    charges?: Charges
    source?: string
    level?: number
    prerequisites?: string[]
    attributeBonuses?: {
        attribute: string
        value: number
    }[]
    category?: FeatCategory
    status?: "active" | "inactive"
}

export interface FeatsFilters {
    page?: number
    limit?: number
    search?: string
    searchField?: "all" | "name"
    status?: "all" | "active" | "inactive"
    level?: number // Exact match
    levelMax?: number // Range (1 to levelMax)
    attributes?: string[]
    categories?: FeatCategory[]
    sources?: string[] // Multi-select: book name prefixes
}

export interface FeatsResponse {
  items: Feat[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FeatSearchResult {
  id: string
  _id: string
  label: string
  name: string
  originalName?: string
  entityType: 'Talento'
  description: string
  source: string
  metadata: {
    level: number
  }
}
