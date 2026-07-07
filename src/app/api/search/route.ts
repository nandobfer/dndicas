import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { searchUnifiedEntities } from "@/features/search/api/unified-search-service"
import type { EntityType } from "@/lib/config/colors"

const searchParamsSchema = z.object({
    q: z.string().optional(),
    query: z.string().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    type: z.string().optional(),
    types: z.string().optional(),
    itemTypes: z.string().optional(),
    circles: z.string().optional(),
    parentClassId: z.string().optional(),
})

function splitParam(value?: string): string[] | undefined {
    const values = value?.split(",").map((item) => item.trim()).filter(Boolean)
    return values?.length ? values : undefined
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url)
        const parsed = searchParamsSchema.safeParse(Object.fromEntries(url.searchParams))

        if (!parsed.success) {
            return NextResponse.json({ error: "Parâmetros de busca inválidos", details: parsed.error.issues }, { status: 400 })
        }

        const params = parsed.data
        const circles = splitParam(params.circles)?.map(Number).filter((circle) => Number.isFinite(circle))
        const results = await searchUnifiedEntities({
            query: params.q ?? params.query ?? "",
            limit: params.limit ?? 20,
            offset: params.offset ?? 0,
            specificEntityType: params.type as EntityType | undefined,
            specificEntityTypes: splitParam(params.types) as EntityType[] | undefined,
            itemTypes: splitParam(params.itemTypes),
            circles,
            parentClassId: params.parentClassId,
        })

        return NextResponse.json({ items: results })
    } catch (error) {
        console.error("Unified search error:", error)
        return NextResponse.json({ error: "Erro ao buscar entidades" }, { status: 500 })
    }
}
