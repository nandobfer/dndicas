export type TraitChargeMode = "fixed" | "byLevel";

export interface TraitChargesFixed {
    mode: "fixed";
    value: string;
}

export interface TraitChargesByLevelRow {
    level: number;
    value: string;
}

export interface TraitChargesByLevel {
    mode: "byLevel";
    values: TraitChargesByLevelRow[];
}

export type TraitCharges = TraitChargesFixed | TraitChargesByLevel;

export interface Trait {
    _id: string; // Mongoose ID
    id: string; // Frontend ID (mapped from _id)
    name: string;
    originalName?: string;
    description: string; // HTML content with mentions and S3 images
    charges?: TraitCharges;
    source: string;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
}

export type TraitResponse = Trait;

export interface CreateTraitInput {
    name: string;
    originalName?: string;
    description: string;
    charges?: TraitCharges;
    source: string;
    status: 'active' | 'inactive';
}

export interface UpdateTraitInput extends Partial<Omit<CreateTraitInput, 'name'>> {
    name?: string;
}

export interface TraitFilterParams {
    search?: string
    status?: "active" | "inactive" | "all"
    sources?: string[] // Multi-select: book name prefixes
    page?: number
    limit?: number
}

export interface TraitsResponse {
    items: Trait[];
    total: number;
    page: number;
    limit: number;
}
