export interface RaceTrait {
    _id?: string
    name: string
    description: string // HTML string with Mentions
    level?: number
}

export type SizeCategory = "Pequeno" | "Médio" | "Grande"

export interface RaceVariation {
    _id?: string
    name: string
    description: string
    source?: string
    image?: string
    color?: string
    traits: RaceTrait[]
    spells: any[]
    size?: SizeCategory
    speed?: string
}

export interface Race {
    _id: string
    name: string
    originalName?: string
    image?: string
    description: string // HTML string from TipTap
    source: string
    status: "active" | "inactive"
    
    // Mechanics
    size: SizeCategory
    speed: string
    
    traits: RaceTrait[]
    spells: any[] // Array of spell objects (mention style)
    variations: RaceVariation[]
    
    createdAt: Date
    updatedAt: Date
}

export type CreateRaceInput = Omit<Race, "_id" | "createdAt" | "updatedAt">
export type UpdateRaceInput = Partial<CreateRaceInput>

export interface RacesFilters {
    search?: string
    status?: "all" | "active" | "inactive" | "all"
    sources?: string[] // Multi-select: book name prefixes
    page?: number
    limit?: number
}

export interface RacesListResponse {
    items: Race[]
    total: number
    page: number
    limit: number
}
