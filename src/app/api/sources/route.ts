import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/core/database/db"
import { Spell } from "@/features/spells/models/spell"
import { CharacterClass } from "@/features/classes/models/character-class"
import { RaceModel } from "@/features/races/models/race"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { Feat } from "@/features/feats/models/feat"
import { Reference } from "@/core/database/models/reference"
import { Trait } from "@/features/traits/database/trait"
import { ItemModel } from "@/features/items/database/item"
import type { Model, Document } from "mongoose"
import { extractBookName } from "@/core/utils/source-utils"

const ENTITY_MODEL_MAP: Record<string, Model<Document>> = {
    spells: Spell as unknown as Model<Document>,
    classes: CharacterClass as unknown as Model<Document>,
    races: RaceModel as unknown as Model<Document>,
    backgrounds: BackgroundModel as unknown as Model<Document>,
    feats: Feat as unknown as Model<Document>,
    rules: Reference as unknown as Model<Document>,
    traits: Trait as unknown as Model<Document>,
    items: ItemModel as unknown as Model<Document>,
}

/**
 * GET /api/sources?entity=spells
 * Returns distinct book names (extracted from source field) for the given entity type.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url)
        const entity = url.searchParams.get("entity")

        if (!entity || !ENTITY_MODEL_MAP[entity]) {
            return NextResponse.json(
                { error: "Parâmetro 'entity' inválido ou ausente. Use: spells, classes, races, backgrounds, feats, rules, traits, items" },
                { status: 400 }
            )
        }

        await dbConnect()

        const model = ENTITY_MODEL_MAP[entity]
        const rawSources = (await model.distinct("source")) as string[]

        const bookNames = Array.from(
            new Set(
                rawSources
                    .filter((s) => typeof s === "string" && s.trim().length > 0)
                    .map(extractBookName)
            )
        ).sort((a, b) => a.localeCompare(b, "pt-BR"))

        return NextResponse.json({ sources: bookNames })
    } catch (error) {
        console.error("[API] GET /api/sources error:", error)
        return NextResponse.json({ error: "Erro ao buscar fontes" }, { status: 500 })
    }
}
