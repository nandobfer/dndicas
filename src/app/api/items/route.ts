import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ItemModel } from "@/features/items/database/item";
import { createItemSchema } from "@/features/items/api/validation";
import { createAuditLog } from "@/features/users/api/audit-service";
import dbConnect from "@/core/database/db";
import { applyFuzzySearch } from "@/core/utils/search-engine";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);
    const search = url.searchParams.get("search") || "";
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const rarity = url.searchParams.get("rarity");

    const query: any = {};
    if (status && status !== "all") query.status = status;
    if (type && type !== "all") query.type = type;
    if (rarity && rarity !== "all") query.rarity = rarity;
    const sourcesParam = url.searchParams.get("sources");
    if (sourcesParam) {
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sourcesList = sourcesParam.split(",").map(s => s.trim()).filter(Boolean)
      if (sourcesList.length > 0) {
        query.source = { $in: sourcesList.map(s => new RegExp(`^${escapeRegex(s)}`, 'i')) }
      }
    }

    const items = await ItemModel.find(query).sort({ createdAt: -1 });

    const searchedItems = search ? applyFuzzySearch(items, search) : items;
    const total = searchedItems.length;

    let paginatedItems = searchedItems;
    if (limit) {
      const offset = (page - 1) * limit;
      paginatedItems = searchedItems.slice(offset, offset + limit);
    }

    return NextResponse.json({
      items: paginatedItems,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Items GET error:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
    }

    await dbConnect();
    const existing = await ItemModel.findOne({ name: parseResult.data.name });
    if (existing) {
      return NextResponse.json({ error: "Item name already exists" }, { status: 409 });
    }

    const newItem = (await ItemModel.create(parseResult.data as any)) as any

    try {
      await createAuditLog({
        action: "CREATE",
        entity: "Item",
        entityId: String(newItem._id),
        performedBy: session.userId,
        newData: newItem.toObject() as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.warn("Failed to create audit log for item creation", auditError);
    }

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error("Item POST error:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}
