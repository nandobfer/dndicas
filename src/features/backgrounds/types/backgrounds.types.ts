import type { AttributeType } from "@/lib/config/colors"
import type { SkillType } from "@/features/classes/types/classes.types"

export interface BackgroundTrait {
    _id?: string
    name: string
    description: string // HTML string with Mentions
}

export interface Background {
    _id: string
    name: string
    originalName?: string
    image?: string
    description: string // HTML string from TipTap
    source: string
    status: "active" | "inactive"
    
    // Mechanics
    skillProficiencies: SkillType[]
    suggestedAttributes: AttributeType[]
    featId?: string // Link to a Feat entity (T008)
    
    // Starting items / placeholder
    equipment: string // For now, a text description or JSON list
    
    traits: BackgroundTrait[]
    
    createdAt: Date
    updatedAt: Date
}

export type CreateBackgroundInput = Omit<Background, "_id" | "createdAt" | "updatedAt">
export type UpdateBackgroundInput = Partial<CreateBackgroundInput>

export interface BackgroundsFilters {
    search?: string
    status?: "all" | "active" | "inactive"
    suggestedAttributes?: string[]
    skillProficiencies?: string[]
    featIds?: string[]
    sources?: string[] // Multi-select: book name prefixes
    page?: number
    limit?: number
}

export interface BackgroundsListResponse {
    items: Background[]
    total: number
    page: number
    limit: number
}
