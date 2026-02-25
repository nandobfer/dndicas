import { NextRequest, NextResponse } from "next/server";
import { Spell } from "@/features/spells/models/spell";
import dbConnect from "@/core/database/db";

/**
 * GET /api/spells/search - Search spells for mention system
 * Returns active spells only with simplified data for autocomplete
 */
export async function GET(req: NextRequest) {
  try {
      await dbConnect()
      const url = new URL(req.url)
      const query = url.searchParams.get("q") || ""

      // Search only active spells by name (case-insensitive)
      const filter: any = { status: "active" }
      if (query) {
          filter.name = { $regex: query, $options: "i" }
      }

      const spells = await Spell.find(filter)
        .select("_id name circle school source description")
        .limit(10)
        .sort({ name: 1 })
        .lean()

      // Format for mention system
      const items = spells.map((spell) => ({
          id: String(spell._id),
          label: spell.name,
          entityType: "Magia",
          circle: spell.circle,
          school: spell.school,
          source: spell.source,
          description: spell.description
      }))

      return NextResponse.json({ items })
  } catch (error) {
    console.error("Spells search error:", error);
    return NextResponse.json({ error: "Failed to search spells" }, { status: 500 });
  }
}
