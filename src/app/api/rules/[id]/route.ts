import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { Reference } from "@/core/database/models/reference"
import { AuditLogExtended } from "@/features/users/models/audit-log-extended"
import { connectDB } from "@/core/database/connect"
import { z } from "zod"

const updateReferenceSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(50000).optional(),
  source: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await connectDB()

    const reference = await Reference.findById(id)
    if (!reference) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    }

    return NextResponse.json(reference)
  } catch (error: any) {
    console.error("Rule GET error:", error)
    if (error.name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    
    // Check if user is authenticated
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params
    await connectDB()

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    
    const validation = updateReferenceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const existingReference = await Reference.findById(id)
    if (!existingReference) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    }

    // Capture previous state for audit
    const previousData = {
        name: existingReference.name,
        description: existingReference.description?.substring(0, 100) + "...", // Truncate
        source: existingReference.source,
        status: existingReference.status,
    }

    // Apply updates
    if (validation.data.name) existingReference.name = validation.data.name
    if (validation.data.description) existingReference.description = validation.data.description
    if (validation.data.source) existingReference.source = validation.data.source
    if (validation.data.status) existingReference.status = validation.data.status

    const updatedReference = await existingReference.save()

    // Create Audit Log
    try {
      await AuditLogExtended.create({
        action: "UPDATE",
        entity: "Reference",
        entityId: updatedReference._id.toString(),
        performedBy: userId,
        performedByUser: {
            _id: userId,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || "Unknown",
            username: user.username || user.emailAddresses[0]?.emailAddress || "unknown",
            email: user.emailAddresses[0]?.emailAddress || "",
            avatarUrl: user.imageUrl,
            role: (user.publicMetadata as any)?.role || "user",
            status: "active",
        },
        previousData,
        newData: {
            name: updatedReference.name,
            description: updatedReference.description?.substring(0, 100) + "...", // Truncate
            source: updatedReference.source,
            status: updatedReference.status,
        },
        metadata: {
            reason: "API Update",
            userAgent: req.headers.get("user-agent") || "Unknown",
            ip: req.headers.get("x-forwarded-for") || "Unknown",
        }
      })
    } catch (auditError) {
      console.error("Failed to create audit log for update:", auditError)
      // Non-blocking error
    }

    return NextResponse.json(updatedReference)
  } catch (error: any) {
    console.error("Rule PUT error:", error)
    if (error.name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }
    if (error.code === 11000) {
      return NextResponse.json({ error: "Rule name already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params
    await connectDB()

    const existingReference = await Reference.findById(id)
    if (!existingReference) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    }

    const previousData = {
        name: existingReference.name,
        source: existingReference.source,
        status: existingReference.status,
    }

    await existingReference.deleteOne()

    // Create Audit Log
    try {
      await AuditLogExtended.create({
        action: "DELETE",
        entity: "Reference",
        entityId: id,
        performedBy: userId,
        performedByUser: {
            _id: userId,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || "Unknown",
            username: user.username || user.emailAddresses[0]?.emailAddress || "unknown",
            email: user.emailAddresses[0]?.emailAddress || "",
            avatarUrl: user.imageUrl,
            role: (user.publicMetadata as any)?.role || "user",
            status: "active",
        },
        previousData,
        metadata: {
            reason: "API Delete",
            userAgent: req.headers.get("user-agent") || "Unknown",
            ip: req.headers.get("x-forwarded-for") || "Unknown",
        }
      })
    } catch (auditError) {
      console.error("Failed to create audit log for delete:", auditError)
    }

    return NextResponse.json({ success: true, message: "Rule deleted successfully" })
  } catch (error: any) {
    console.error("Rule DELETE error:", error)
    if (error.name === "CastError") {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 })
  }
}
