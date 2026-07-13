import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import { CharacterSpell } from "@/features/character-sheets/models/character-spell"
import { CharacterFeat } from "@/features/character-sheets/models/character-feat"
import { CharacterItem } from "@/features/character-sheets/models/character-item"
import { CharacterTrait } from "@/features/character-sheets/models/character-trait"
import { UserNpcModel } from "@/features/monsters/models/user-npc"

const EntityUsageQuerySchema = z.object({
    entityType: z.enum(["Classe", "Raça", "Origem", "Magia", "Habilidade", "Talento", "Item", "Monstro", "Ficha"]),
})

type UsageDatum = {
    context: string
    count: number
}

async function countResourceChargeUsage(entityType: "Habilidade" | "Talento" | "Item") {
    const [result] = await CharacterSheet.aggregate<{ count: number }>([
        { $unwind: "$resourceCharges" },
        { $match: { "resourceCharges.source.entityType": entityType } },
        { $count: "count" },
    ])

    return result?.count ?? 0
}

async function getUsage(entityType: z.infer<typeof EntityUsageQuerySchema>["entityType"]): Promise<UsageDatum[]> {
    switch (entityType) {
        case "Classe":
            return [{ context: "Fichas", count: await CharacterSheet.countDocuments({ classRef: { $ne: null } }) }]
        case "Raça":
            return [{ context: "Fichas", count: await CharacterSheet.countDocuments({ raceRef: { $ne: null } }) }]
        case "Origem":
            return [{ context: "Fichas", count: await CharacterSheet.countDocuments({ originRef: { $ne: null } }) }]
        case "Magia":
            return [{ context: "Fichas", count: await CharacterSpell.countDocuments({ catalogSpellId: { $ne: null } }) }]
        case "Habilidade": {
            const [traits, resources] = await Promise.all([
                CharacterTrait.countDocuments({ catalogTraitId: { $ne: null } }),
                countResourceChargeUsage("Habilidade"),
            ])

            return [
                { context: "Fichas", count: traits },
                { context: "Recursos", count: resources },
            ]
        }
        case "Talento": {
            const [feats, resources] = await Promise.all([
                CharacterFeat.countDocuments({ catalogFeatId: { $ne: null } }),
                countResourceChargeUsage("Talento"),
            ])

            return [
                { context: "Fichas", count: feats },
                { context: "Recursos", count: resources },
            ]
        }
        case "Item": {
            const [items, resources] = await Promise.all([
                CharacterItem.countDocuments({ catalogItemId: { $ne: null } }),
                countResourceChargeUsage("Item"),
            ])

            return [
                { context: "Fichas", count: items },
                { context: "Recursos", count: resources },
            ]
        }
        case "Monstro":
            return [{ context: "NPCs", count: await UserNpcModel.countDocuments({ status: "active" }) }]
        case "Ficha":
            return [{ context: "Criadas", count: await CharacterSheet.countDocuments({}) }]
    }
}

export async function GET(request: NextRequest) {
    try {
        const parsed = EntityUsageQuerySchema.safeParse({
            entityType: request.nextUrl.searchParams.get("entityType"),
        })

        if (!parsed.success) {
            return NextResponse.json({ error: "Tipo de entidade inválido" }, { status: 400 })
        }

        await dbConnect()

        const usage = await getUsage(parsed.data.entityType)
        const active = usage.reduce((total, item) => total + item.count, 0)

        return NextResponse.json({ active, usage })
    } catch (error) {
        console.error("[Entity Usage Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas de uso" }, { status: 500 })
    }
}
