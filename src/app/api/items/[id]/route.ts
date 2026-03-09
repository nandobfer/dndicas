import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ItemModel } from "@/features/items/database/item";
import { updateItemSchema } from "@/features/items/api/validation";
import { createAuditLog } from "@/features/users/api/audit-service";
import dbConnect from "@/core/database/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await dbConnect();
    const item = await ItemModel.findById(id);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error("Item GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = updateItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
    }

    await dbConnect();
    const oldItem = await ItemModel.findById(id);
    if (!oldItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const newItem = await ItemModel.findByIdAndUpdate(id, parseResult.data, { new: true });

    try {
      await createAuditLog({
        action: "UPDATE",
        entity: "Item",
        entityId: String(newItem?._id),
        performedBy: session.userId,
        previousData: oldItem.toObject() as unknown as Record<string, unknown>,
        newData: newItem?.toObject() as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.warn("Failed to create audit log for item update", auditError);
    }

    return NextResponse.json(newItem);
  } catch (error) {
    console.error("Item PUT error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const itemToDelete = await ItemModel.findById(id);
    if (!itemToDelete) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await ItemModel.findByIdAndDelete(id);

    try {
      await createAuditLog({
        action: "DELETE",
        entity: "Item",
        entityId: id,
        performedBy: session.userId,
        previousData: itemToDelete.toObject() as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.warn("Failed to create audit log for item deletion", auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Item DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
