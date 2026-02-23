export interface Trait {
    _id: string; // Mongoose ID
    id: string; // Frontend ID (mapped from _id)
    name: string;
    description: string; // HTML content with mentions and S3 images
    source: string;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
}

export type TraitResponse = Trait;

export interface CreateTraitInput {
    name: string;
    description: string;
    source: string;
    status: 'active' | 'inactive';
}

export interface UpdateTraitInput extends Partial<Omit<CreateTraitInput, 'name'>> {
    name?: string;
}

export interface TraitsFilters {
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    page?: number;
    limit?: number;
}

export interface TraitsResponse {
    items: Trait[];
    total: number;
    page: number;
    limit: number;
}
