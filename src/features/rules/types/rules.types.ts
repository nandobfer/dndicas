export interface Reference {
    _id: string; // Mongoose ID
    id: string; // Frontend ID (mapped from _id)
    name: string;
    description: string; // HTML content
    source: string;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
}

export type ReferenceResponse = Reference;

export interface CreateReferenceInput {
    name: string;
    description: string;
    source: string;
    status: 'active' | 'inactive';
}

export interface UpdateReferenceInput extends Partial<Omit<CreateReferenceInput, 'name'>> {
    name?: string;
}

export interface RulesFilters {
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    page?: number;
    limit?: number;
}

export interface RulesResponse {
    items: Reference[];
    total: number;
    page: number;
    limit: number;
}
