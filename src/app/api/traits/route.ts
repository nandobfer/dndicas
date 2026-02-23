import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Trait } from "@/features/traits/database/trait";
import { createAuditLog } from "@/features/users/api/audit-service";
import dbConnect from "@/core/database/db";
import { z } from "zod";

const createTraitSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(50000), // HTML string with S3 images
  source: z.string().min(1).max(200),
  status: z.enum(["active", "inactive"]),
});

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);
    const search = url.searchParams.get("search") || "";
    const searchField = url.searchParams.get("searchField") || "all";
    const status = url.searchParams.get("status");

    const query: Record<string, unknown> = {};
    if (search) {
      if (searchField === "name") {
        query.name = { $regex: search, $options: "i" };
      } else {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }
    if (status && status !== "all") {
      if (status === "active" || status === "inactive") {
        query.status = status;
      }
    }

    const items = await Trait.find(query as any)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Trait.countDocuments(query as any);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Traits GET error:", error);
    return NextResponse.json({ error: "Failed to fetch traits" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createTraitSchema.safeParse(body);

    if (!parseResult.success) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json({ error: (parseResult.error as any).errors }, { status: 400 });
    }

    const validatedData = parseResult.data;

    await dbConnect();

    // Check uniqueness
    const existing = await Trait.findOne({ name: validatedData.name });
    if (existing) {
      return NextResponse.json({ error: "Trait name already exists" }, { status: 409 });
    }

    const newTrait = await Trait.create(validatedData);

    // Audit Log using standard service
    try {
      await createAuditLog({
        action: "CREATE",
        entity: "Trait",
        entityId: String(newTrait._id),
        performedBy: session.userId,
        newData: newTrait.toObject() as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.warn("Failed to create audit log for trait creation", auditError);
    }

    return NextResponse.json(newTrait, { status: 201 });
  } catch (error) {
    console.error("Traits POST error:", error);
    return NextResponse.json({ error: "Failed to create trait" }, { status: 500 });
  }
}
