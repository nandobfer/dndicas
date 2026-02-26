import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { Feat } from "@/features/feats/models/feat"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"

/**
 * GET /api/admin/mention-audit
 * Fetches all entities (Rules, Spells, Traits, Feats) that contain '@' in their description
 * but are not properly formatted as mentions (e.g. <span data-type="mention"...>).
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    const user = userId ? await currentUser() : null
    const isAdmin = user?.publicMetadata?.role === "admin"

    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const mentionRegex = /<span[^>]*data-type="mention"[^>]*>/;
    
    // We want to find cases where '@' exists but isn't part of a valid mention span.
    // Since complex regex in MongoDB is hard for "contains @ AND NOT contains span",
    // we'll fetch all that contain '@' and filter in memory for better accuracy
    // given the scale of a typical RPG database.

    const [rules, spells, traits, feats] = await Promise.all([
      Reference.find({ description: /@/ }).lean(),
      Spell.find({ description: /@/ }).lean(),
      Trait.find({ description: /@/ }).lean(),
      Feat.find({ description: /@/ }).lean(),
    ])

    const processEntities = (entities: any[], type: string) => {
      return entities
        .filter(entity => {
          const desc = entity.description || ""
          // Check if it has '@' but no mention tag nearby or count mismatch
          // A simple but effective heuristic for this UI:
          const atCount = (desc.match(/@/g) || []).length
          const spanCount = (desc.match(/data-type="mention"/g) || []).length
          
          return atCount > spanCount
        })
        .map(entity => ({
          _id: entity._id,
          type,
          name: entity.name,
          description: entity.description,
          source: entity.source,
          status: entity.status,
        }))
    }

    const allResults = [
      ...processEntities(rules, "Regra"),
      ...processEntities(spells, "Magia"),
      ...processEntities(traits, "Habilidade"),
      ...processEntities(feats, "Talento"),
    ]

    return NextResponse.json(allResults)
  } catch (error) {
    console.error("Mention audit error:", error)
    return NextResponse.json({ error: "Failed to fetch mention audit" }, { status: 500 })
  }
}
