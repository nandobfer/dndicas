import { NextRequest, NextResponse } from "next/server";
import { Trait } from "@/features/traits/database/trait";
import dbConnect from "@/core/database/db";

export async function GET(req: NextRequest) {
  try {
      await dbConnect()
      const url = new URL(req.url)
      const query = url.searchParams.get("q") || ""

      // Search only by name for mentions (limit to 10 results)
      const filter: any = { status: "active" }
      if (query) {
          filter.name = { $regex: query, $options: "i" }
      }

      const items = await Trait.find(filter).select("_id name source").limit(10).sort({ name: 1 })

      // Format for mention system
      const formattedItems = items.map((item) => ({
          id: String(item._id),
          name: item.name,
          entityType: "Habilidade",
          source: item.source,
      }))

      return NextResponse.json({ items: formattedItems })
  } catch (error) {
    console.error("Traits search error:", error);
    return NextResponse.json({ error: "Failed to search traits" }, { status: 500 });
  }
}
