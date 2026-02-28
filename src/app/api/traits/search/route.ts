import { NextRequest, NextResponse } from "next/server";
import { Trait } from "@/features/traits/database/trait";
import dbConnect from "@/core/database/db";
import { applyFuzzySearch } from "@/core/utils/search-engine"

export async function GET(req: NextRequest) {
  try {
      await dbConnect()
      const url = new URL(req.url)
      const query = url.searchParams.get("q") || ""
      const limitParam = url.searchParams.get("limit")
      const limit = limitParam ? parseInt(limitParam, 10) : undefined

      // Search only active traits
      const filter: any = { status: "active" }
      const items = await Trait.find(filter).select("_id name source description").sort({ name: 1 })

      // Apply fuzzy search locally using the shared function
      const searchedItems = query ? applyFuzzySearch(items, query) : items

      // Format for output and apply limit if present
      const formattedItems = searchedItems.map((item) => ({
          id: String(item._id),
          _id: String(item._id),
          name: item.name,
          entityType: "Habilidade",
          source: item.source,
          description: item.description
      }))

      const finalItems = limit ? formattedItems.slice(0, limit) : formattedItems

      return NextResponse.json({ items: finalItems })
  } catch (error) {
    console.error("Traits search error:", error);
    return NextResponse.json({ error: "Failed to search traits" }, { status: 500 });
  }
}
