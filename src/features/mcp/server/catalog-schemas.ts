import { z } from "zod"

export const catalogEntityTypes = [
    "Regra",
    "Habilidade",
    "Talento",
    "Raça",
    "Classe",
    "Subclasse",
    "Origem",
    "Magia",
    "Item",
    "Monstro",
] as const

export const catalogEntityTypeSchema = z.enum(catalogEntityTypes)

export type CatalogEntityType = z.infer<typeof catalogEntityTypeSchema>

export const searchCatalogEntitiesSchema = z.object({
    query: z.string().optional().default(""),
    types: z.array(catalogEntityTypeSchema).optional(),
    limit: z.coerce.number().int().positive().max(50).optional().default(20),
    offset: z.coerce.number().int().min(0).optional().default(0),
    itemTypes: z.array(z.string().trim().min(1)).optional(),
    circles: z.array(z.coerce.number().int().min(0).max(9)).optional(),
    parentClassId: z.string().trim().min(1).optional(),
})

export const getCatalogEntitySchema = z.object({
    type: catalogEntityTypeSchema,
    id: z.string().trim().min(1, "ID é obrigatório"),
})

export type SearchCatalogEntitiesInput = z.infer<typeof searchCatalogEntitiesSchema>
export type GetCatalogEntityInput = z.infer<typeof getCatalogEntitySchema>
