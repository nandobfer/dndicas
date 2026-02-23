import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Trait } from "@/features/traits/database/trait";
import { createAuditLog } from "@/features/users/api/audit-service";
import dbConnect from "@/core/database/db";
import { z } from "zod";

const updateTraitSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(50000).optional(),
  source: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    const trait = await Trait.findById(id);
    if (!trait) {
      return NextResponse.json({ error: "Trait not found" }, { status: 404 });
    }

    return NextResponse.json(trait);
  } catch (error) {
    console.error("Trait GET error:", error);
    if ((error as { name?: string }).name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    // Check if user is authenticated
    if (! userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id } = await params;
    await dbConnect();

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = updateTraitSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const existingTrait = await Trait.findById(id);
    if (!existingTrait) {
      return NextResponse.json({ error: "Trait not found" }, { status: 404 });
    }

    // Capture previous state for audit
    const previousData = {
      name: existingTrait.name,
      description: existingTrait.description,
      source: existingTrait.source,
      status: existingTrait.status,
    };

    // Apply updates
    if (validation.data.name) existingTrait.name = validation.data.name;
    if (validation.data.description) existingTrait.description = validation.data.description;
    if (validation.data.source) existingTrait.source = validation.data.source;
    if (validation.data.status) existingTrait.status = validation.data.status;

    const updatedTrait = await existingTrait.save();

    // Create Audit Log using service
    try {
      await createAuditLog({
        action: "UPDATE",
        entity: "Trait",
        entityId: updatedTrait._id.toString(),
        performedBy: userId,
        previousData,
        newData: {
          name: updatedTrait.name,
          description: updatedTrait.description,
          source: updatedTrait.source,
          status: updatedTrait.status,
        },
        metadata: {
          reason: "API Update",
          userAgent: req.headers.get("user-agent") || "Unknown",
          ip: req.headers.get("x-forwarded-for") || "Unknown",
        },
      });
    } catch (auditError) {
      console.error("Failed to create audit log for update:", auditError);
    }

    return NextResponse.json(updatedTrait);
  } catch (error) {
    console.error("Trait PUT error:", error);
    if ((error as { name?: string }).name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Trait name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update trait" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id } = await params;
    await dbConnect();

    const existingTrait = await Trait.findById(id);
    if (!existingTrait) {
      return NextResponse.json({ error: "Trait not found" }, { status: 404 });
    }

    const previousData = {
      name: existingTrait.name,
      source: existingTrait.source,
      status: existingTrait.status,
    };

    await existingTrait.deleteOne();

    // Create Audit Log using service
    try {
      await createAuditLog({
        action: "DELETE",
        entity: "Trait",
        entityId: id,
        performedBy: userId,
        previousData,
        metadata: {
          reason: "API Delete",
          userAgent: req.headers.get("user-agent") || "Unknown",
          ip: req.headers.get("x-forwarded-for") || "Unknown",
        },
      });
    } catch (auditError) {
      console.error("Failed to create audit log for delete:", auditError);
    }

    return NextResponse.json({ success: true, message: "Trait deleted successfully" });
  } catch (error) {
    console.error("Trait DELETE error:", error);
    if ((error as { name?: string }).name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete trait" }, { status: 500 });
  }
}
