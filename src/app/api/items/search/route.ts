import { NextRequest, NextResponse } from "next/server";
import { ItemModel } from "@/features/items/database/item";
import dbConnect from "@/core/database/db";
import { applyFuzzySearch } from "@/core/utils/search-engine";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    if (!query || query.length < 2) {
      return NextResponse.json({ items: [] });
    }

    await dbConnect();
    // Fetch active items for mentions/search
    const items = await ItemModel.find({ status: "active" });

    const filtered = applyFuzzySearch(items, query);

    return NextResponse.json({
      items: filtered.slice(0, 10), // Limit results for mentions
    });
  } catch (error) {
    console.error("Items search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
